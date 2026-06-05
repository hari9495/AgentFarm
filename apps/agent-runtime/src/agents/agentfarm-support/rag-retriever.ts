/**
 * AgentFarm Support — RAG Retriever
 *
 * Before the support agent responds to an issue, this module retrieves relevant
 * prior resolutions, support templates, and workspace-specific lessons to inject
 * into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior case resolutions — past issues with matching symptoms
 *   2. Support templates & runbooks — fix playbooks and escalation guides
 *   3. Support lessons — workspace-specific lessons from closed issues
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import { applyRagContextBudget } from '../shared/rag-context-limiter.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type SupportDocumentType =
    | 'case_resolution'
    | 'config_fix'
    | 'code_fix'
    | 'infra_fix'
    | 'escalation_report'
    | 'support_template';

export interface SupportRagQuery {
    tenantId: string;
    botId?: string;
    issueDescription: string;
    issueCategory?: string;
    documentType: SupportDocumentType;
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

export interface SupportRagContext {
    contextBlock: string;
    similarCaseCount: number;
    templateChunkCount: number;
    lessonCount: number;
    retrievedAt: string;
}

async function searchKnowledgeBase(
    body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number },
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarCases(query: SupportRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Document type: ${query.documentType}`, query.issueDescription, query.issueCategory ? `Category: ${query.issueCategory}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'support_template');
}

export async function retrieveSupportTemplates(query: SupportRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Support template for: ${query.documentType}`, query.issueDescription, query.issueCategory ?? ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKTemplates ?? 5, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'support_template');
}

export async function retrieveSupportLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('support:lesson:'));
    } catch { return []; }
}

export async function buildSupportRagContext(query: SupportRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<SupportRagContext> {
    const [similarCases, templateChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarCases(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveSupportTemplates(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveSupportLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    if (similarCases.length > 0) {
        const lines = ['### Similar Prior Case Resolutions', 'Reference these past resolutions to guide diagnosis and remediation.', ''];
        for (const a of similarCases) { lines.push(`**Similarity ${Math.round(a.similarity * 100)}%${a.sourceUrl ? ` (${a.sourceUrl})` : ''}**`); lines.push(a.content.slice(0, 600) + (a.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (templateChunks.length > 0) {
        const lines = ['### Support Playbooks & Templates', 'Apply the following runbooks and escalation guides.', ''];
        for (const t of templateChunks) { lines.push(t.content.slice(0, 800) + (t.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Support Lessons', 'These lessons prevent repeated issues. Apply before every diagnosis and fix attempt.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? applyRagContextBudget(`## Support Context\n\n${sections.join('\n---\n\n')}`) : '', similarCaseCount: similarCases.length, templateChunkCount: templateChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestApprovedCase(params: { tenantId: string; botId?: string; caseTitle: string; documentType: SupportDocumentType; content: string; mimeType?: string; sourceUrl?: string; issueCategory?: string; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, caseTitle, documentType, content, mimeType, sourceUrl, issueCategory, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[Support Approved: ${caseTitle}]`, `Type: ${documentType}${issueCategory ? ` | Category: ${issueCategory}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:support:approved:${documentType}:${Date.now()}`, sourceType: 'support_approved_case' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
