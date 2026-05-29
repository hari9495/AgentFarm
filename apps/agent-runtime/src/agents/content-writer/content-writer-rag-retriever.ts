/**
 * Content Writer — RAG Retriever
 *
 * Before the Content Writer agent drafts prose, optimises for SEO, or adapts
 * tone, this module retrieves relevant prior work and brand knowledge to inject
 * into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior content — past published articles, blog posts, and copy
 *      that match the current topic via cosine-similarity search
 *   2. Brand voice & style guidelines — editorial style guides, brand voice
 *      samples, and content templates from the domain library
 *   3. Editorial lessons — workspace-specific lessons from editor revisions,
 *      performance data, and SEO feedback (from content-writer-lesson-pipeline.ts)
 *
 * APIs used:
 *   POST /v1/knowledge-base/search  — cosine-similarity search
 *   GET  /v1/workspaces/:id/memory/patterns — long-term lesson patterns
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';

export type ContentDomain =
    | 'technology'
    | 'finance'
    | 'healthcare'
    | 'ecommerce'
    | 'saas'
    | 'lifestyle'
    | 'education'
    | 'legal'
    | 'marketing'
    | 'hr';

export type ContentDocumentType =
    | 'blog_post'
    | 'landing_page'
    | 'email_copy'
    | 'social_post'
    | 'product_description'
    | 'whitepaper'
    | 'case_study'
    | 'press_release'
    | 'newsletter'
    | 'ad_copy';

export interface ContentWriterRagQuery {
    tenantId: string;
    botId?: string;
    contentTitle: string;
    contentDescription: string;
    documentType: ContentDocumentType;
    domain?: ContentDomain;
    targetKeywords?: string[];
    targetAudience?: string;
    topKDocuments?: number;
    topKBrandGuide?: number;
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface ContentWriterRagContext {
    contextBlock: string;
    similarContentCount: number;
    brandGuideChunkCount: number;
    lessonCount: number;
    retrievedAt: string;
}

// ---------------------------------------------------------------------------
// Knowledge base search client
// ---------------------------------------------------------------------------

interface KbSearchBody {
    tenantId: string;
    botId?: string;
    queryText: string;
    topK?: number;
    minSimilarity?: number;
}

interface KbSearchResponse {
    results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }>;
}

async function searchKnowledgeBase(
    body: KbSearchBody,
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
        const data = (await res.json()) as KbSearchResponse;
        return (data.results ?? [])
            .filter((r) => r.id && r.content)
            .map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Retrieval path 1 — Similar prior content
// ---------------------------------------------------------------------------

export async function retrieveSimilarContent(
    query: ContentWriterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Content type: ${query.documentType}`,
        `Title: ${query.contentTitle}`,
        query.contentDescription,
        query.domain ? `Domain: ${query.domain}` : '',
        query.targetKeywords?.length ? `Keywords: ${query.targetKeywords.join(', ')}` : '',
        query.targetAudience ? `Audience: ${query.targetAudience}` : '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 },
        gatewayBaseUrl,
        serviceToken,
    );

    return results.filter((r) => r.sourceType !== 'cw_brand_guide_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 2 — Brand voice & style guidelines
// ---------------------------------------------------------------------------

export async function retrieveBrandGuide(
    query: ContentWriterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Brand voice and style guidelines for: ${query.documentType}`,
        query.domain ? `Domain: ${query.domain}` : '',
        query.targetAudience ? `Audience: ${query.targetAudience}` : '',
        query.contentTitle,
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKBrandGuide ?? 4, minSimilarity: 0.55 },
        gatewayBaseUrl,
        serviceToken,
    );

    return results.filter((r) => r.sourceType === 'cw_brand_guide_template');
}

// ---------------------------------------------------------------------------
// Retrieval path 3 — Editorial lessons
// ---------------------------------------------------------------------------

interface MemoryPatternRecord {
    pattern?: string;
    summary?: string;
    confidence?: number;
    observedCount?: number;
    lastSeen?: string;
}

export async function retrieveContentLessons(
    tenantId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<MemoryPatternRecord[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(
            `${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId },
                signal: AbortSignal.timeout(10_000),
            },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: MemoryPatternRecord[] };
        return (data.patterns ?? []).filter(
            (p) => typeof p.pattern === 'string' && p.pattern.startsWith('cw:lesson:'),
        );
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Context block formatter
// ---------------------------------------------------------------------------

function formatSimilarContent(docs: KbSearchResult[]): string {
    if (docs.length === 0) return '';
    const lines: string[] = [
        '### Similar Prior Content',
        'Reference these past published pieces when drafting. Mirror their structure and voice, adapted for the current brief.',
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

function formatBrandGuide(chunks: KbSearchResult[]): string {
    if (chunks.length === 0) return '';
    const lines: string[] = [
        '### Brand Voice & Style Guidelines',
        'Strictly apply the following brand guidelines. Deviations require explicit editor approval.',
        '',
    ];
    for (const chunk of chunks) {
        lines.push(chunk.content.slice(0, 800) + (chunk.content.length > 800 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatContentLessons(patterns: MemoryPatternRecord[]): string {
    if (patterns.length === 0) return '';
    const lines: string[] = [
        '### Workspace Editorial Lessons',
        'These lessons were derived from editor feedback and performance data. Apply them proactively.',
        '',
    ];
    const sorted = [...patterns].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10);
    for (const p of sorted) {
        const summary = p.summary ?? p.pattern ?? '';
        const conf = p.confidence !== undefined ? ` (confidence: ${Math.round(p.confidence * 100)}%)` : '';
        lines.push(`- ${summary}${conf}`);
    }
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildContentWriterRagContext(
    query: ContentWriterRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
): Promise<ContentWriterRagContext> {
    const [similarContent, brandGuideChunks, lessons] = await Promise.all([
        retrieveSimilarContent(query, gatewayBaseUrl, serviceToken),
        retrieveBrandGuide(query, gatewayBaseUrl, serviceToken),
        retrieveContentLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken),
    ]);

    const sections: string[] = [];
    const contentSection = formatSimilarContent(similarContent);
    if (contentSection) sections.push(contentSection);
    const brandSection = formatBrandGuide(brandGuideChunks);
    if (brandSection) sections.push(brandSection);
    const lessonsSection = formatContentLessons(lessons);
    if (lessonsSection) sections.push(lessonsSection);

    const contextBlock = sections.length > 0
        ? `## Content Context\n\n${sections.join('\n---\n\n')}`
        : '';

    return {
        contextBlock,
        similarContentCount: similarContent.length,
        brandGuideChunkCount: brandGuideChunks.length,
        lessonCount: lessons.length,
        retrievedAt: new Date().toISOString(),
    };
}

export async function ingestPublishedContent(params: {
    tenantId: string;
    botId?: string;
    contentTitle: string;
    documentType: ContentDocumentType;
    content: string;
    mimeType?: string;
    sourceUrl?: string;
    domain?: ContentDomain;
    performanceScore?: number;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const { tenantId, botId, contentTitle, documentType, content, mimeType, sourceUrl, domain, performanceScore, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enrichedContent = [
        `[Content Writer Published: ${contentTitle}]`,
        `Type: ${documentType}${domain ? ` | Domain: ${domain}` : ''}${performanceScore !== undefined ? ` | Performance: ${performanceScore}` : ''}`,
        '',
        normalizedContent,
    ].join('\n');

    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify({ tenantId, botId, content: enrichedContent, sourceUrl: sourceUrl ?? `urn:agentfarm:cw:published:${documentType}:${Date.now()}`, sourceType: 'cw_published_content' }),
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
