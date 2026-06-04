/**
 * Full-Stack Developer — RAG Retriever
 *
 * Before the FSD agent implements features, builds components, or makes
 * architecture decisions, this module retrieves relevant prior work to inject
 * into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior implementations — past components, API designs, and
 *      feature implementations that match the current task via cosine-similarity
 *   2. Design system & architecture patterns — component libraries, ADRs, and
 *      accessibility standards from the domain library
 *   3. Dev lessons — workspace-specific lessons from code review feedback,
 *      performance regressions, and security findings (from fsd-lesson-pipeline.ts)
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import { applyRagContextBudget } from '../shared/rag-context-limiter.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type FsdDocumentType =
    | 'component'
    | 'api_endpoint'
    | 'feature_implementation'
    | 'architecture_decision'
    | 'performance_audit'
    | 'accessibility_audit'
    | 'design_token'
    | 'database_schema'
    | 'integration'
    | 'refactor';

export type FsdStack = 'react' | 'nextjs' | 'vue' | 'angular' | 'node' | 'express' | 'fastify' | 'prisma' | 'postgres' | 'redis' | 'graphql' | 'rest';

export interface FsdRagQuery {
    tenantId: string;
    botId?: string;
    featureTitle: string;
    featureDescription: string;
    documentType: FsdDocumentType;
    stack?: FsdStack[];
    domain?: string;
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

export interface FsdRagContext {
    contextBlock: string;
    similarImplCount: number;
    patternChunkCount: number;
    lessonCount: number;
    retrievedAt: string;
}

async function searchKnowledgeBase(body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number }, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarImplementations(query: FsdRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Type: ${query.documentType}`, `Feature: ${query.featureTitle}`, query.featureDescription, query.stack?.length ? `Stack: ${query.stack.join(', ')}` : '', query.domain ? `Domain: ${query.domain}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'fsd_design_pattern');
}

export async function retrieveDesignPatterns(query: FsdRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Design pattern for: ${query.documentType}`, query.stack?.join(', ') ?? '', query.domain ?? ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKPatterns ?? 4, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'fsd_design_pattern');
}

export async function retrieveFsdLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('fsd:lesson:'));
    } catch { return []; }
}

export async function buildFsdRagContext(query: FsdRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<FsdRagContext> {
    const [similarImpls, patternChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarImplementations(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveDesignPatterns(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveFsdLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    if (similarImpls.length > 0) {
        const lines = ['### Similar Prior Implementations', 'Reference these past implementations for patterns, API shape, and component structure.', ''];
        for (const i of similarImpls) { lines.push(`**Similarity ${Math.round(i.similarity * 100)}%${i.sourceUrl ? ` (${i.sourceUrl})` : ''}**`); lines.push(i.content.slice(0, 600) + (i.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (patternChunks.length > 0) {
        const lines = ['### Design System & Architecture Patterns', 'Apply these patterns and constraints.', ''];
        for (const p of patternChunks) { lines.push(p.content.slice(0, 800) + (p.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Dev Lessons', 'These lessons prevent recurring code review failures. Apply proactively.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? applyRagContextBudget(`## Dev Context\n\n${sections.join('\n---\n\n')}`) : '', similarImplCount: similarImpls.length, patternChunkCount: patternChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestApprovedImplementation(params: { tenantId: string; botId?: string; implTitle: string; documentType: FsdDocumentType; content: string; mimeType?: string; sourceUrl?: string; stack?: FsdStack[]; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, implTitle, documentType, content, mimeType, sourceUrl, stack, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[FSD Approved: ${implTitle}]`, `Type: ${documentType}${stack?.length ? ` | Stack: ${stack.join(', ')}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:fsd:approved:${documentType}:${Date.now()}`, sourceType: 'fsd_approved_implementation' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
