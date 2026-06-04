/**
 * Tester — RAG Retriever
 *
 * Before the Tester agent generates test cases, security reports, or bug
 * reproduction steps, this module retrieves relevant prior work to inject
 * into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior test suites — past test plans, bug reports, and test
 *      strategies that match the current feature/component
 *   2. Testing templates & checklists — regression checklists, security test
 *      frameworks, and test plan templates from the domain library
 *   3. Testing lessons — workspace-specific lessons from missed bugs, false
 *      positives, and coverage gaps (from tester-lesson-pipeline.ts)
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type TesterDocumentType =
    | 'test_plan'
    | 'test_cases'
    | 'bug_report'
    | 'security_report'
    | 'regression_suite'
    | 'exploratory_session'
    | 'performance_test'
    | 'accessibility_test';

export interface TesterRagQuery {
    tenantId: string;
    botId?: string;
    featureOrComponent: string;
    contextDescription: string;
    documentType: TesterDocumentType;
    testType?: 'unit' | 'integration' | 'e2e' | 'manual' | 'security' | 'performance' | 'accessibility';
    riskLevel?: 'low' | 'medium' | 'high' | 'critical';
    topKDocuments?: number;
    topKTemplates?: number;
    minSimilarity?: number;
}

export interface KbSearchResult { id: string; content: string; sourceUrl?: string; sourceType?: string; similarity: number; }
export interface TesterRagContext { contextBlock: string; similarTestCount: number; templateChunkCount: number; lessonCount: number; retrievedAt: string; }

async function searchKnowledgeBase(body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number }, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarTestSuites(query: TesterRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Type: ${query.documentType}`, `Feature: ${query.featureOrComponent}`, query.contextDescription, query.testType ? `Test type: ${query.testType}` : '', query.riskLevel ? `Risk: ${query.riskLevel}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'tester_checklist_template');
}

export async function retrieveTestingTemplates(query: TesterRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Testing template for: ${query.documentType}`, query.testType ?? '', query.riskLevel ? `Risk level: ${query.riskLevel}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKTemplates ?? 4, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'tester_checklist_template');
}

export async function retrieveTesterLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('tester:lesson:'));
    } catch { return []; }
}

export async function buildTesterRagContext(query: TesterRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<TesterRagContext> {
    const [similarTests, templateChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarTestSuites(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveTestingTemplates(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveTesterLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    if (similarTests.length > 0) {
        const lines = ['### Similar Prior Test Suites', 'Reference these past test suites. Reuse effective patterns and edge cases.', ''];
        for (const t of similarTests) { lines.push(`**Similarity ${Math.round(t.similarity * 100)}%${t.sourceUrl ? ` (${t.sourceUrl})` : ''}**`); lines.push(t.content.slice(0, 600) + (t.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (templateChunks.length > 0) {
        const lines = ['### Testing Checklists & Templates', 'Apply these testing standards and checklists.', ''];
        for (const t of templateChunks) { lines.push(t.content.slice(0, 800) + (t.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Testing Lessons', 'These lessons prevent repeated coverage gaps and missed regressions.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? `## Testing Context\n\n${sections.join('\n---\n\n')}` : '', similarTestCount: similarTests.length, templateChunkCount: templateChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestApprovedTestSuite(params: { tenantId: string; botId?: string; suiteTitle: string; documentType: TesterDocumentType; content: string; mimeType?: string; sourceUrl?: string; testType?: string; bugCount?: number; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, suiteTitle, documentType, content, mimeType, sourceUrl, testType, bugCount, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[Tester Approved: ${suiteTitle}]`, `Type: ${documentType}${testType ? ` | Test type: ${testType}` : ''}${bugCount !== undefined ? ` | Bugs found: ${bugCount}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:tester:approved:${documentType}:${Date.now()}`, sourceType: 'tester_approved_suite' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
