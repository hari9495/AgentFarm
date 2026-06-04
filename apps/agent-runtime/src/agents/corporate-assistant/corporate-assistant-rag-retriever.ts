/**
 * Corporate Assistant — RAG Retriever
 *
 * Before the Corporate Assistant agent composes emails, prepares documents, or
 * routes escalations, this module retrieves relevant prior work and communication
 * patterns to inject into the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior communications — past approved emails, memos, and briefs
 *      that match the current context via cosine-similarity
 *   2. Communication templates & protocols — email templates, escalation paths,
 *      and tone guidelines from the domain library
 *   3. Communication lessons — workspace-specific lessons from misdirected emails,
 *      tone complaints, and missed escalations (from corporate-assistant-lesson-pipeline.ts)
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import { applyRagContextBudget } from '../shared/rag-context-limiter.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type CorporateDocumentType =
    | 'email'
    | 'memo'
    | 'meeting_summary'
    | 'escalation_brief'
    | 'document_prep'
    | 'calendar_invite'
    | 'status_update'
    | 'briefing_note';

export interface CorporateRagQuery {
    tenantId: string;
    botId?: string;
    subject: string;
    contextDescription: string;
    documentType: CorporateDocumentType;
    recipientRole?: string;
    urgency?: 'routine' | 'urgent' | 'critical';
    topKDocuments?: number;
    topKTemplates?: number;
    minSimilarity?: number;
}

export interface KbSearchResult { id: string; content: string; sourceUrl?: string; sourceType?: string; similarity: number; }
export interface CorporateRagContext { contextBlock: string; similarDocCount: number; templateChunkCount: number; lessonCount: number; retrievedAt: string; }

async function searchKnowledgeBase(body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number }, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarCommunications(query: CorporateRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Type: ${query.documentType}`, `Subject: ${query.subject}`, query.contextDescription, query.recipientRole ? `Recipient: ${query.recipientRole}` : '', query.urgency ? `Urgency: ${query.urgency}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'ca_communication_template');
}

export async function retrieveCommunicationTemplates(query: CorporateRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Communication template for: ${query.documentType}`, query.recipientRole ?? '', query.urgency ?? ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKTemplates ?? 3, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'ca_communication_template');
}

export async function retrieveCorporateLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('ca:lesson:'));
    } catch { return []; }
}

export async function buildCorporateRagContext(query: CorporateRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<CorporateRagContext> {
    const [similarDocs, templateChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarCommunications(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveCommunicationTemplates(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveCorporateLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    if (similarDocs.length > 0) {
        const lines = ['### Similar Prior Communications', 'Reference these past approved communications. Mirror tone, structure, and level of detail.', ''];
        for (const d of similarDocs) { lines.push(`**Similarity ${Math.round(d.similarity * 100)}%${d.sourceUrl ? ` (${d.sourceUrl})` : ''}**`); lines.push(d.content.slice(0, 600) + (d.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (templateChunks.length > 0) {
        const lines = ['### Communication Templates & Protocols', 'Apply these templates and communication guidelines.', ''];
        for (const t of templateChunks) { lines.push(t.content.slice(0, 800) + (t.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Communication Lessons', 'These lessons prevent repeated communication failures. Apply proactively.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? applyRagContextBudget(`## Communication Context\n\n${sections.join('\n---\n\n')}`) : '', similarDocCount: similarDocs.length, templateChunkCount: templateChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestApprovedCommunication(params: { tenantId: string; botId?: string; subject: string; documentType: CorporateDocumentType; content: string; mimeType?: string; sourceUrl?: string; recipientRole?: string; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, subject, documentType, content, mimeType, sourceUrl, recipientRole, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[Corporate Approved: ${subject}]`, `Type: ${documentType}${recipientRole ? ` | Recipient: ${recipientRole}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:ca:approved:${documentType}:${Date.now()}`, sourceType: 'ca_approved_communication' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
