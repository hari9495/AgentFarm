/**
 * Meeting RAG client — thin HTTP wrapper for the api-gateway knowledge-base
 * and memory-patterns endpoints used by the live meeting brain.
 *
 * This is intentionally self-contained (pure fetch calls, no cross-package
 * imports) so the meeting-agent service stays independent from agent-runtime.
 * The matching RAG retriever in apps/agent-runtime covers the post-meeting
 * transcription flow; this module covers the real-time brain.think() path.
 *
 * Endpoints used:
 *   POST /v1/knowledge-base/search  — cosine-similarity search for prior meetings
 *   GET  /v1/workspaces/:id/memory/patterns — workspace meeting lessons
 *   POST /v1/knowledge-base/write   — ingest post-session summary
 */

interface KbSearchResult {
    id: string;
    content: string;
    sourceUrl?: string;
    sourceType?: string;
    similarity: number;
}

/** Fetch cosine-similar documents from the knowledge base. */
async function searchKnowledgeBase(
    body: { tenantId: string; botId?: string; queryText: string; topK?: number; minSimilarity?: number },
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<KbSearchResult[]> {
    try {
        const res = await fetch(`${gatewayBaseUrl}/v1/knowledge-base/search`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { results?: KbSearchResult[] };
        return data.results ?? [];
    } catch { return []; }
}

/** Fetch workspace meeting lessons from long-term memory. */
async function fetchMeetingLessons(
    tenantId: string,
    workspaceId: string,
    gatewayBaseUrl: string,
    serviceToken: string,
): Promise<Array<{ pattern?: string; summary?: string; confidence?: number }>> {
    try {
        const res = await fetch(
            `${gatewayBaseUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns`,
            {
                method: 'GET',
                headers: {
                    'content-type': 'application/json',
                    Authorization: `Bearer ${serviceToken}`,
                    'x-tenant-id': tenantId,
                },
                signal: AbortSignal.timeout(10_000),
            },
        );
        if (!res.ok) return [];
        const data = (await res.json()) as {
            patterns?: Array<{ pattern?: string; summary?: string; confidence?: number }>;
        };
        return (data.patterns ?? []).filter(
            (p) => typeof p.pattern === 'string' && p.pattern.startsWith('meeting:lesson:'),
        );
    } catch { return []; }
}

export interface MeetingRagContext {
    contextBlock: string;
    similarMeetingCount: number;
    lessonCount: number;
}

/**
 * Build a RAG context block for the live meeting brain.
 *
 * Runs three retrieval paths in parallel:
 *  1. Similar prior meeting summaries (cosine similarity ≥ 0.65)
 *  2. Meeting summary templates (cosine similarity ≥ 0.55)
 *  3. Workspace meeting lessons (prefixed `meeting:lesson:`)
 *
 * Returns the combined `## Meeting Context` block ready for injection into
 * the brain system prompt. Returns an empty string when nothing is retrieved.
 */
export async function buildMeetingBrainRagContext(opts: {
    tenantId: string;
    botId?: string;
    workspaceId: string;
    meetingId: string;
    mode: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<MeetingRagContext> {
    const { tenantId, botId, workspaceId, meetingId, mode, gatewayBaseUrl, serviceToken } = opts;
    const queryText = `${mode} meeting: ${meetingId}`;

    const [similarMeetings, templateChunks, lessons] = await Promise.all([
        searchKnowledgeBase(
            { tenantId, botId, queryText, topK: 3, minSimilarity: 0.65 },
            gatewayBaseUrl, serviceToken,
        ),
        searchKnowledgeBase(
            { tenantId, botId, queryText: `meeting summary template ${mode}`, topK: 2, minSimilarity: 0.55 },
            gatewayBaseUrl, serviceToken,
        ),
        fetchMeetingLessons(tenantId, workspaceId, gatewayBaseUrl, serviceToken),
    ]);

    const sections: string[] = [];

    if (similarMeetings.length > 0) {
        const lines = [
            '### Similar Prior Meetings',
            'Reference these past meeting summaries for context, recurring decisions, and open action items.',
            '',
        ];
        for (const m of similarMeetings) {
            lines.push(`**Similarity ${Math.round(m.similarity * 100)}%${m.sourceUrl ? ` (${m.sourceUrl})` : ''}**`);
            lines.push(m.content.slice(0, 600) + (m.content.length > 600 ? '…' : ''));
            lines.push('');
        }
        sections.push(lines.join('\n'));
    }

    if (templateChunks.length > 0) {
        const lines = ['### Meeting Summary Templates', 'Apply these formats when summarising or taking notes.', ''];
        for (const t of templateChunks) {
            lines.push(t.content.slice(0, 600) + (t.content.length > 600 ? '…' : ''));
            lines.push('');
        }
        sections.push(lines.join('\n'));
    }

    if (lessons.length > 0) {
        const lines = ['### Workspace Meeting Lessons', 'Prevent these recurring issues.', ''];
        [...lessons]
            .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
            .slice(0, 8)
            .forEach((l) => {
                lines.push(`- ${l.summary ?? l.pattern ?? ''}${l.confidence !== undefined ? ` (confidence: ${Math.round(l.confidence * 100)}%)` : ''}`);
            });
        sections.push(lines.join('\n'));
    }

    return {
        contextBlock: sections.length > 0
            ? `## Meeting Context\n\n${sections.join('\n---\n\n')}`
            : '',
        similarMeetingCount: similarMeetings.length,
        lessonCount: lessons.length,
    };
}

/**
 * Ingest a meeting transcript summary into the knowledge base after a session
 * ends so future sessions can retrieve it via RAG.
 */
export async function ingestMeetingSessionSummary(opts: {
    tenantId: string;
    botId?: string;
    meetingId: string;
    mode: string;
    transcript: string;
    gatewayBaseUrl: string;
    serviceToken: string;
}): Promise<boolean> {
    const { tenantId, botId, meetingId, mode, transcript, gatewayBaseUrl, serviceToken } = opts;
    if (!transcript.trim()) return false;

    const enriched = [
        `[Meeting Summary: ${meetingId}]`,
        `Type: meeting_summary | Meeting type: ${mode}`,
        '',
        transcript,
    ].join('\n');

    try {
        const res = await fetch(`${gatewayBaseUrl}/v1/knowledge-base/write`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${serviceToken}`,
            },
            body: JSON.stringify({
                tenantId,
                botId,
                content: enriched,
                sourceUrl: `urn:agentfarm:meeting:summary:meeting_summary:${Date.now()}`,
                sourceType: 'meeting_approved_summary',
            }),
            signal: AbortSignal.timeout(15_000),
        });
        return res.ok;
    } catch { return false; }
}
