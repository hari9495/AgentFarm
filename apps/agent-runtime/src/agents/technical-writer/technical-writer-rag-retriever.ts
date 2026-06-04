/**
 * Technical Writer — RAG Retriever
 *
 * Before the Technical Writer agent generates API docs, release notes,
 * tutorials, or manuals, this module retrieves relevant prior work and
 * style knowledge to inject into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior documentation — past approved API docs, tutorials, and
 *      guides that match the current subject via cosine-similarity search
 *   2. Style guide & templates — documentation templates, style rules, and
 *      audience-specific writing standards from the domain library
 *   3. Doc lessons — workspace-specific lessons from SME review rejections,
 *      style audits, and user feedback (from technical-writer-lesson-pipeline.ts)
 *
 * APIs used:
 *   POST /v1/knowledge-base/search  — cosine-similarity search
 *   GET  /v1/workspaces/:id/memory/patterns — long-term lesson patterns
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type TwDocumentType =
    | 'api_reference'
    | 'tutorial'
    | 'how_to_guide'
    | 'release_notes'
    | 'manual'
    | 'faq'
    | 'whitepaper'
    | 'onboarding_guide'
    | 'style_check'
    | 'sprint_doc';

export type TwAudience =
    | 'developer'
    | 'end_user'
    | 'sme'
    | 'executive'
    | 'support'
    | 'internal';

export interface TechnicalWriterRagQuery {
    tenantId: string;
    botId?: string;
    docTitle: string;
    docDescription: string;
    documentType: TwDocumentType;
    audience?: TwAudience;
    productArea?: string;
    topKDocuments?: number;
    topKStyleGuide?: number;
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface TechnicalWriterRagContext {
    contextBlock: string;
    similarDocCount: number;
    styleGuideChunkCount: number;
    lessonCount: number;
    retrievedAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge base search client
// ---------------------------------------------------------------------------

async function searchKnowledgeBase(
    body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number },
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? [])
            .filter((r) => r.id && r.content)
            .map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Retrieval paths
// ---------------------------------------------------------------------------

export async function retrieveSimilarDocs(
    query: TechnicalWriterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Document type: ${query.documentType}`,
        `Title: ${query.docTitle}`,
        query.docDescription,
        query.audience ? `Audience: ${query.audience}` : '',
        query.productArea ? `Product area: ${query.productArea}` : '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 },
        gatewayBaseUrl,
        serviceToken,
    );
    return results.filter((r) => r.sourceType !== 'tw_style_guide_template');
}

export async function retrieveStyleGuide(
    query: TechnicalWriterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Style guide for: ${query.documentType}`,
        query.audience ? `Audience: ${query.audience}` : '',
        query.productArea ?? '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKStyleGuide ?? 4, minSimilarity: 0.55 },
        gatewayBaseUrl,
        serviceToken,
    );
    return results.filter((r) => r.sourceType === 'tw_style_guide_template');
}

export async function retrieveTwLessons(
    tenantId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('tw:lesson:'));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatSimilarDocs(docs: KbSearchResult[]): string {
    if (docs.length === 0) return '';
    const lines: string[] = [
        '### Similar Prior Documentation',
        'Reference these approved past docs for structure, terminology, and depth. Adapt to the current subject.',
        '',
    ];
    for (const doc of docs) {
        const pct = Math.round(doc.similarity * 100);
        const label = doc.sourceUrl ? ` (${doc.sourceUrl})` : '';
        lines.push(`**Similarity ${pct}%${label}**`);
        lines.push(doc.content.slice(0, 600) + (doc.content.length > 600 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatStyleGuide(chunks: KbSearchResult[]): string {
    if (chunks.length === 0) return '';
    const lines: string[] = [
        '### Style Guide & Templates',
        'Apply these style rules strictly. Flag any conflicts with the SME for resolution.',
        '',
    ];
    for (const chunk of chunks) {
        lines.push(chunk.content.slice(0, 800) + (chunk.content.length > 800 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatTwLessons(patterns: Array<{ pattern?: string; summary?: string; confidence?: number }>): string {
    if (patterns.length === 0) return '';
    const lines: string[] = [
        '### Workspace Documentation Lessons',
        'Apply these lessons proactively — each one prevented a SME rejection or user confusion.',
        '',
    ];
    const sorted = [...patterns].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10);
    for (const p of sorted) {
        const conf = p.confidence !== undefined ? ` (confidence: ${Math.round(p.confidence * 100)}%)` : '';
        lines.push(`- ${p.summary ?? p.pattern ?? ''}${conf}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildTechnicalWriterRagContext(
    query: TechnicalWriterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
    config?: MemoryRetrievalConfig,
): Promise<TechnicalWriterRagContext> {
    const [similarDocs, styleChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarDocs(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveStyleGuide(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveTwLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    const docsSection = formatSimilarDocs(similarDocs);
    if (docsSection) sections.push(docsSection);
    const styleSection = formatStyleGuide(styleChunks);
    if (styleSection) sections.push(styleSection);
    const lessonsSection = formatTwLessons(lessons);
    if (lessonsSection) sections.push(lessonsSection);

    return {
        contextBlock: sections.length > 0 ? `## Documentation Context\n\n${sections.join('\n---\n\n')}` : '',
        similarDocCount: similarDocs.length,
        styleGuideChunkCount: styleChunks.length,
        lessonCount: lessons.length,
        retrievedAt: new Date().toISOString(),
    };
}

export async function ingestApprovedDoc(params: {
    tenantId: string;
    botId?: string;
    docTitle: string;
    documentType: TwDocumentType;
    content: string;
    mimeType?: string;
    sourceUrl?: string;
    audience?: TwAudience;
    productArea?: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const { tenantId, botId, docTitle, documentType, content, mimeType, sourceUrl, audience, productArea, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enrichedContent = [
        `[Technical Writer Approved Doc: ${docTitle}]`,
        `Type: ${documentType}${audience ? ` | Audience: ${audience}` : ''}${productArea ? ` | Product: ${productArea}` : ''}`,
        '',
        normalizedContent,
    ].join('\n');

    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify({ tenantId, botId, content: enrichedContent, sourceUrl: sourceUrl ?? `urn:agentfarm:tw:approved:${documentType}:${Date.now()}`, sourceType: 'tw_approved_doc' }),
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
