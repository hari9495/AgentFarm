/**
 * Developer — RAG Retriever
 *
 * Before the Developer agent implements features, reviews code, or debugs
 * issues, this module retrieves relevant prior work and patterns to inject
 * into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior implementations — past approved code solutions, PR
 *      descriptions, and architectural decisions that match the current task
 *   2. Architecture patterns & standards — ADRs, coding standards, and
 *      security guidelines from the workspace library
 *   3. Dev lessons — workspace-specific lessons from past code review
 *      rejections and post-mortems (stored via developer-episodic-hooks.ts)
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

export type DevDocumentType =
    | 'feature_implementation'
    | 'bug_fix'
    | 'refactor'
    | 'code_review'
    | 'architecture_decision'
    | 'debugging_session'
    | 'security_audit'
    | 'dependency_update'
    | 'test_implementation'
    | 'performance_optimization';

export type DevLanguage =
    | 'typescript'
    | 'javascript'
    | 'python'
    | 'go'
    | 'rust'
    | 'java'
    | 'csharp'
    | 'ruby'
    | 'kotlin'
    | 'swift';

export interface DeveloperRagQuery {
    tenantId: string;
    botId?: string;
    taskTitle: string;
    taskDescription: string;
    documentType: DevDocumentType;
    language?: DevLanguage;
    framework?: string;
    affectedServices?: string[];
    topKDocuments?: number;
    topKPatterns?: number;
    minSimilarity?: number;
}

export interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

export interface DeveloperRagContext {
    contextBlock: string;
    similarImplCount: number;
    patternChunkCount: number;
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

export async function retrieveSimilarDevImplementations(
    query: DeveloperRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Type: ${query.documentType}`,
        `Task: ${query.taskTitle}`,
        query.taskDescription,
        query.language ? `Language: ${query.language}` : '',
        query.framework ? `Framework: ${query.framework}` : '',
        query.affectedServices?.length ? `Services: ${query.affectedServices.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 },
        gatewayBaseUrl,
        serviceToken,
    );
    return results.filter((r) => r.sourceType !== 'dev_architecture_pattern');
}

export async function retrieveArchitecturePatterns(
    query: DeveloperRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const queryText = [
        `Architecture pattern for: ${query.documentType}`,
        query.language ? `Language: ${query.language}` : '',
        query.framework ?? '',
        query.affectedServices?.join(', ') ?? '',
    ].filter(Boolean).join('\n');

    const results = await searchKnowledgeBase(
        { tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKPatterns ?? 4, minSimilarity: 0.55 },
        gatewayBaseUrl,
        serviceToken,
    );
    return results.filter((r) => r.sourceType === 'dev_architecture_pattern');
}

export async function retrieveDeveloperLessons(
    tenantId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
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
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        // dev: prefix used by developer-episodic-hooks.ts
        return (data.patterns ?? []).filter(
            (p) => typeof p.pattern === 'string' && (p.pattern.startsWith('dev:') || p.pattern.startsWith('developer:')),
        );
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatSimilarImpls(docs: KbSearchResult[]): string {
    if (docs.length === 0) return '';
    const lines = ['### Similar Prior Implementations', 'Reference these past approved implementations. Reuse patterns, naming, and structure where applicable.', ''];
    for (const doc of docs) {
        lines.push(`**Similarity ${Math.round(doc.similarity * 100)}%${doc.sourceUrl ? ` (${doc.sourceUrl})` : ''}**`);
        lines.push(doc.content.slice(0, 600) + (doc.content.length > 600 ? '…' : ''));
        lines.push('');
    }
    return lines.join('\n');
}

function formatArchPatterns(chunks: KbSearchResult[]): string {
    if (chunks.length === 0) return '';
    const lines = ['### Architecture Patterns & Standards', 'Apply these coding standards and architectural constraints.', ''];
    for (const c of chunks) { lines.push(c.content.slice(0, 800) + (c.content.length > 800 ? '…' : '')); lines.push(''); }
    return lines.join('\n');
}

function formatDevLessons(patterns: Array<{ pattern?: string; summary?: string; confidence?: number }>): string {
    if (patterns.length === 0) return '';
    const lines = ['### Workspace Dev Lessons', 'These lessons prevent repeated code review failures. Apply proactively.', ''];
    [...patterns].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((p) => {
        lines.push(`- ${p.summary ?? p.pattern ?? ''}${p.confidence !== undefined ? ` (confidence: ${Math.round(p.confidence * 100)}%)` : ''}`);
    });
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildDeveloperRagContext(
    query: DeveloperRagQuery,
    gatewayBaseUrl: string,
    serviceToken: string,
    workspaceId: string,
    config?: MemoryRetrievalConfig,
): Promise<DeveloperRagContext> {
    const [similarImpls, patternChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarDevImplementations(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveArchitecturePatterns(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveDeveloperLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    const s1 = formatSimilarImpls(similarImpls); if (s1) sections.push(s1);
    const s2 = formatArchPatterns(patternChunks); if (s2) sections.push(s2);
    const s3 = formatDevLessons(lessons); if (s3) sections.push(s3);

    return {
        contextBlock: sections.length > 0 ? `## Developer Context\n\n${sections.join('\n---\n\n')}` : '',
        similarImplCount: similarImpls.length,
        patternChunkCount: patternChunks.length,
        lessonCount: lessons.length,
        retrievedAt: new Date().toISOString(),
    };
}

export async function ingestApprovedImplementation(params: {
    tenantId: string;
    botId?: string;
    implTitle: string;
    documentType: DevDocumentType;
    content: string;
    mimeType?: string;
    sourceUrl?: string;
    language?: DevLanguage;
    framework?: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const { tenantId, botId, implTitle, documentType, content, mimeType, sourceUrl, language, framework, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [
        `[Developer Approved: ${implTitle}]`,
        `Type: ${documentType}${language ? ` | Language: ${language}` : ''}${framework ? ` | Framework: ${framework}` : ''}`,
        '',
        normalizedContent,
    ].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` },
            body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:dev:approved:${documentType}:${Date.now()}`, sourceType: 'dev_approved_implementation' }),
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch {
        return false;
    }
}
