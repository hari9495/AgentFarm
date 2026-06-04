/**
 * Meeting Agent — RAG Retriever
 *
 * Before the Meeting Agent transcribes, summarises, or distributes meeting
 * notes, this module retrieves relevant prior meeting context to inject into
 * the LLM prompt.
 *
 * Three retrieval paths run in parallel:
 *   1. Similar prior meetings — past meeting summaries and decisions that match
 *      the current meeting topic via cosine-similarity
 *   2. Meeting templates — agenda templates and summary formats from the library
 *   3. Meeting lessons — workspace-specific lessons from missed action items,
 *      poor summaries, and distribution failures (from meeting-agent-lesson-pipeline.ts)
 */

import { normalizeIngestContent } from '../shared/rag-ingest-normalizer.js';
import type { MemoryRetrievalConfig } from '@agentfarm/memory-service';

export type MeetingDocumentType =
    | 'meeting_summary'
    | 'action_items'
    | 'decision_log'
    | 'agenda'
    | 'follow_up_email'
    | 'transcript_summary';

export type MeetingType =
    | 'standup'
    | 'sprint_planning'
    | 'retrospective'
    | 'stakeholder_review'
    | 'executive_briefing'
    | 'client_call'
    | 'team_sync'
    | 'one_on_one';

export interface MeetingRagQuery {
    tenantId: string;
    botId?: string;
    meetingTitle: string;
    meetingDescription: string;
    documentType: MeetingDocumentType;
    meetingType?: MeetingType;
    participants?: string[];
    topKDocuments?: number;
    topKTemplates?: number;
    minSimilarity?: number;
}

export interface KbSearchResult { id: string; content: string; sourceUrl?: string; sourceType?: string; similarity: number; }
export interface MeetingRagContext { contextBlock: string; similarMeetingCount: number; templateChunkCount: number; lessonCount: number; retrievedAt: string; }

async function searchKnowledgeBase(body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number }, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/search`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: Array<{ id?: string; content?: string; sourceUrl?: string; sourceType?: string; similarity?: number }> };
        return (data.results ?? []).filter((r) => r.id && r.content).map((r) => ({ id: r.id ?? '', content: r.content ?? '', sourceUrl: r.sourceUrl, sourceType: r.sourceType, similarity: r.similarity ?? 0 }));
    } catch { return []; }
}

export async function retrieveSimilarMeetings(query: MeetingRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Type: ${query.documentType}`, `Meeting: ${query.meetingTitle}`, query.meetingDescription, query.meetingType ? `Meeting type: ${query.meetingType}` : '', query.participants?.length ? `Participants: ${query.participants.slice(0, 5).join(', ')}` : ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKDocuments ?? 3, minSimilarity: query.minSimilarity ?? 0.65 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType !== 'meeting_summary_template');
}

export async function retrieveMeetingTemplates(query: MeetingRagQuery, gatewayBaseUrl: string, serviceToken: string): Promise<KbSearchResult[]> {
    const queryText = [`Meeting template for: ${query.documentType}`, query.meetingType ?? ''].filter(Boolean).join('\n');
    const results = await searchKnowledgeBase({ tenantId: query.tenantId, botId: query.botId, queryText, topK: query.topKTemplates ?? 3, minSimilarity: 0.55 }, gatewayBaseUrl, serviceToken);
    return results.filter((r) => r.sourceType === 'meeting_summary_template');
}

export async function retrieveMeetingLessons(tenantId: string, workspaceId: string, gatewayBaseUrl: string, serviceToken: string): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`, { method: 'GET', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}`, 'x-tenant-id': tenantId }, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return [];
        const data = (await res.json()) as { patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }> };
        return (data.patterns ?? []).filter((p) => typeof p.pattern === 'string' && p.pattern.startsWith('meeting:lesson:'));
    } catch { return []; }
}

export async function buildMeetingRagContext(query: MeetingRagQuery, gatewayBaseUrl: string, serviceToken: string, workspaceId: string, config?: MemoryRetrievalConfig): Promise<MeetingRagContext> {
    const [similarMeetings, templateChunks, lessons] = await Promise.all([
        config?.usePriorWork !== false ? retrieveSimilarMeetings(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useTemplates !== false ? retrieveMeetingTemplates(query, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
        config?.useLessons   !== false ? retrieveMeetingLessons(query.tenantId, workspaceId, gatewayBaseUrl, serviceToken) : Promise.resolve([]),
    ]);

    const sections: string[] = [];
    if (similarMeetings.length > 0) {
        const lines = ['### Similar Prior Meetings', 'Reference these past meeting summaries for context, recurring decisions, and open action items.', ''];
        for (const m of similarMeetings) { lines.push(`**Similarity ${Math.round(m.similarity * 100)}%${m.sourceUrl ? ` (${m.sourceUrl})` : ''}**`); lines.push(m.content.slice(0, 600) + (m.content.length > 600 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (templateChunks.length > 0) {
        const lines = ['### Meeting Summary Templates', 'Apply these summary structures and formats.', ''];
        for (const t of templateChunks) { lines.push(t.content.slice(0, 800) + (t.content.length > 800 ? '…' : '')); lines.push(''); }
        sections.push(lines.join('\n'));
    }
    if (lessons.length > 0) {
        const lines = ['### Workspace Meeting Lessons', 'These lessons prevent missed action items and summary failures.', ''];
        [...lessons].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0)).slice(0, 10).forEach((l) => { lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`); });
        sections.push(lines.join('\n'));
    }

    return { contextBlock: sections.length > 0 ? `## Meeting Context\n\n${sections.join('\n---\n\n')}` : '', similarMeetingCount: similarMeetings.length, templateChunkCount: templateChunks.length, lessonCount: lessons.length, retrievedAt: new Date().toISOString() };
}

export async function ingestMeetingSummary(params: { tenantId: string; botId?: string; meetingTitle: string; documentType: MeetingDocumentType; content: string; mimeType?: string; sourceUrl?: string; meetingType?: MeetingType; gatewayBaseUrl: string; serviceToken: string }): Promise<boolean> {
    const { tenantId, botId, meetingTitle, documentType, content, mimeType, sourceUrl, meetingType, gatewayBaseUrl, serviceToken } = params;
    const base = gatewayBaseUrl.replace(/\/+$/, '');
    const normalizedContent = await normalizeIngestContent(content, mimeType);
    const enriched = [`[Meeting Summary: ${meetingTitle}]`, `Type: ${documentType}${meetingType ? ` | Meeting type: ${meetingType}` : ''}`, '', normalizedContent].join('\n');
    try {
        const res = await fetch(`${base}/v1/knowledge-base/write`, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceToken}` }, body: JSON.stringify({ tenantId, botId, content: enriched, sourceUrl: sourceUrl ?? `urn:agentfarm:meeting:summary:${documentType}:${Date.now()}`, sourceType: 'meeting_approved_summary' }), signal: AbortSignal.timeout(15_000) });
        return res.ok;
    } catch { return false; }
}
