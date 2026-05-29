/**
 * Project Manager / Scrum Master — RAG Retriever
 *
 * Before the PM agent drafts charters, risk registers, sprint plans, or status
 * reports, this module retrieves relevant prior work and project patterns to
 * inject into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior project artifacts — past approved charters, risk registers,
 *      and status reports that match the current project via cosine-similarity
 *   2. PM methodology templates — sprint frameworks, risk matrices, and ceremony
 *      guides from the domain library
 *   3. PM lessons — workspace-specific lessons from delivery failures, retro
 *      insights, and stakeholder rejections (from project-manager-lesson-pipeline.ts)
 *
 * APIs used:
 *   POST /v1/knowledge-base/search  — cosine-similarity search
 *   GET  /v1/workspaces/:id/memory/patterns — long-term lesson patterns
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';

export type PmDocumentType =
    | 'project_charter'
    | 'status_report'
    | 'risk_register'
    | 'dependency_map'
    | 'sprint_plan'
    | 'retrospective'
    | 'milestone_plan'
    | 'change_request'
    | 'velocity_report'
    | 'budget_forecast';

export type PmMethodology = 'scrum' | 'kanban' | 'waterfall' | 'safe' | 'hybrid';

export interface PmRagQuery {
    tenantId: string;
    botId?: string;
    projectTitle: string;
    projectDescription: string;
    documentType: PmDocumentType;
    methodology?: PmMethodology;
    teamSize?: number;
    domain?: string;
    topKDocuments?: number;
    topKTemplates?: number;
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface PmRagContext {
    contextBlock: string;
    similarDocCount: number;
    templateChunkCount: number;
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

export async function retrieveSimilarPmArtifacts(
    query: PmRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Document type: ${query.documentType}`,
        `Project: ${query.projectTitle}`,
        query.projectDescription,
        query.methodology ? `Methodology: ${query.methodology}` : '',
        query.domain ? `Domain: ${query.domain}` : '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 },
        gatewayBaseUrl,
        serviceToken,
    );
    return results.filter((r) => r.sourceType !== 'pm_methodology_template');
}

export async function retrievePmTemplates(
    query: PmRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `PM template for: ${query.documentType}`,
        query.methodology ? `Methodology: ${query.methodology}` : '',
        query.domain ?? '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKTemplates ?? 4, minSimilarity: 0.55 },
        gatewayBaseUrl,
        serviceToken,
    );
    return results.filter((r) => r.sourceType === 'pm_methodology_template');
}

export async function retrievePmLessons(
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
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('pm:lesson:'));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatSimilarArtifacts(docs: KbSearchResult[]): string {
    if (docs.length === 0) return '';
    const lines: string[] = ['### Similar Prior Project Artifacts', 'Reference these past approved artifacts. Adapt timelines, risks, and structure to the current project.', ''];
    for (const doc of docs) {
        const pct = Math.round(doc.similarity * 100);
        lines.push(`**Similarity ${pct}%${doc.sourceUrl ? ` (${doc.sourceUrl})` : ''}**`);
        lines.push(doc.content.slice(0, 600) + (doc.content.length > 600 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatTemplates(chunks: KbSearchResult[]): string {
    if (chunks.length === 0) return '';
    const lines: string[] = ['### PM Methodology Templates', 'Apply the following methodology frameworks and templates.', ''];
    for (const chunk of chunks) {
        lines.push(chunk.content.slice(0, 800) + (chunk.content.length > 800 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatPmLessons(patterns: Array<{ pattern?: string; summary?: string; confidence?: number }>): string {
    if (patterns.length === 0) return '';
    const lines: string[] = ['### Workspace Project Lessons', 'These lessons prevent repeated delivery failures. Apply them proactively.', ''];
    [...patterns].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((p) => {
        const conf = p.confidence !== undefined ? ` (confidence: ${Math.round(p.confidence * 100)}%)` : '';
        lines.push(`- ${p.summary ?? p.pattern ?? ''}${conf}`);
    });
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildPmRagContext(
    query: PmRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
): Promise<PmRagContext> {
    const [similarDocs, templateChunks, lessons] = await Promise.all([
        retrieveSimilarPmArtifacts(query, gatewayBaseUrl, serviceToken),
        retrievePmTemplates(query, gatewayBaseUrl, serviceToken),
        retrievePmLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken),
    ]);

    const sections: string[] = [];
    const s1 = formatSimilarArtifacts(similarDocs); if (s1) sections.push(s1);
    const s2 = formatTemplates(templateChunks); if (s2) sections.push(s2);
    const s3 = formatPmLessons(lessons); if (s3) sections.push(s3);

    return {
        contextBlock: sections.length > 0 ? `## Project Context\n\n${sections.join('\n---\n\n')}` : '',
        similarDocCount: similarDocs.length,
        templateChunkCount: templateChunks.length,
        lessonCount: lessons.length,
        retrievedAt: new Date().toISOString(),
    };
}

export async function ingestApprovedPmArtifact(params: {
    tenantId: string;
    botId?: string;
    artifactTitle: string;
    documentType: PmDocumentType;
    content: string;
    mimeType?: string;
    sourceUrl?: string;
    methodology?: PmMethodology;
    domain?: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const { tenantId, botId, artifactTitle, documentType, content, mimeType, sourceUrl, methodology, domain, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enrichedContent = [
        `[PM Approved Artifact: ${artifactTitle}]`,
        `Type: ${documentType}${methodology ? ` | Methodology: ${methodology}` : ''}${domain ? ` | Domain: ${domain}` : ''}`,
        '',
        normalizedContent,
    ].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify({ tenantId, botId, content: enrichedContent, sourceUrl: sourceUrl ?? `urn:agentfarm:pm:approved:${documentType}:${Date.now()}`, sourceType: 'pm_approved_artifact' }),
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
