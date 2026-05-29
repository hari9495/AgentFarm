/**
 * Customer Support Executive — RAG Retriever
 *
 * Before the Customer Support agent composes ticket responses, escalates issues,
 * or drafts refund decisions, this module retrieves relevant prior work and
 * product knowledge to inject into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar resolved tickets — past successful ticket resolutions that match
 *      the current issue via cosine-similarity search
 *   2. Product knowledge base — product docs, FAQ articles, and known-issue
 *      workarounds from the domain library
 *   3. Support lessons — workspace-specific lessons from CSAT failures,
 *      escalation patterns, and SLA breaches (from customer-support-lesson-pipeline.ts)
 */

export type SupportDocumentType =
    | 'ticket_response'
    | 'escalation_summary'
    | 'refund_decision'
    | 'knowledge_article'
    | 'satisfaction_survey'
    | 'kpi_report'
    | 'call_script';

export type SupportTier = 'tier1' | 'tier2' | 'tier3' | 'vip';

export interface SupportRagQuery {
    tenantId: string;
    botId?: string;
    issueTitle: string;
    issueDescription: string;
    documentType: SupportDocumentType;
    productArea?: string;
    tier?: SupportTier;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    topKResolutions?: number;
    topKKnowledge?: number;
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
    similarResolutionCount: number;
    knowledgeChunkCount: number;
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

export async function retrieveSimilarResolutions(query: SupportRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Issue type: ${query.documentType}`, `Issue: ${query.issueTitle}`, query.issueDescription, query.productArea ? `Product area: ${query.productArea}` : '', query.priority ? `Priority: ${query.priority}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKResolutions ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'support_knowledge_article');
}

export async function retrieveProductKnowledge(query: SupportRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Product knowledge for: ${query.issueTitle}`, query.productArea ? `Product area: ${query.productArea}` : '', query.issueDescription.slice(0, 300)].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKKnowledge ?? 5, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'support_knowledge_article');
}

export async function retrieveSupportLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('cs:lesson:'));
    } catch { return []; }
}

export async function buildSupportRagContext(query: SupportRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string): Promise<SupportRagContext> {
    const [similarResolutions, knowledgeChunks, lessons] = await Promise.all([
        retrieveSimilarResolutions(query, gatewayBaseUrl, serviceToken),
        retrieveProductKnowledge(query, gatewayBaseUrl, serviceToken),
        retrieveSupportLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken),
    ]);

    const sections: string[] = [];
    if (similarResolutions.length > 0) {
        const lines = ['### Similar Resolved Tickets', 'Reference these past successful resolutions. Adapt the solution to the current customer context.', ''];
        for (const r of similarResolutions) { lines.push(`**Similarity ${Math.round(r.similarity * 100)}%${r.sourceUrl ? ` (${r.sourceUrl})` : ''}**`); lines.push(r.content.slice(0, 600) + (r.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (knowledgeChunks.length > 0) {
        const lines = ['### Product Knowledge', 'Use the following product information to inform your response. Cite relevant docs when helpful.', ''];
        for (const k of knowledgeChunks) { lines.push(k.content.slice(0, 800) + (k.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Support Lessons', 'These lessons prevent repeated CSAT failures and SLA breaches. Apply proactively.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? `## Support Context\n\n${sections.join('\n---\n\n')}` : '', similarResolutionCount: similarResolutions.length, knowledgeChunkCount: knowledgeChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestResolvedTicket(params: { tenantId: string; botId?: string; issueTitle: string; documentType: SupportDocumentType; content: string; sourceUrl?: string; productArea?: string; csatScore?: number; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, issueTitle, documentType, content, sourceUrl, productArea, csatScore, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const enriched = [`[Support Resolved: ${issueTitle}]`, `Type: ${documentType}${productArea ? ` | Product: ${productArea}` : ''}${csatScore !== undefined ? ` | CSAT: ${csatScore}` : ''}`, '', content].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:cs:resolved:${documentType}:${Date.now()}`, sourceType: 'support_resolved_ticket' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
