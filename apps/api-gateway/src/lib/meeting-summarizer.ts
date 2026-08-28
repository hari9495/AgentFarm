/**
 * Meeting transcript summarizer — async meeting intelligence (Phase 1).
 *
 * Turns a raw meeting transcript into { summary, actionItems } via an
 * OpenAI-compatible chat/completions endpoint. Reads AF_OPENAI_API_KEY /
 * OPENAI_API_KEY (+ AF_OPENAI_BASE_URL, AF_OPENAI_MODEL), mirroring the
 * policy-doc rule extractor so the gateway uses one LLM config convention.
 *
 * Returns null (never throws) when unconfigured or on any error, so callers
 * can degrade gracefully. NOTE (Phase 3): this LLM hop should move to the
 * agent-runtime meeting pipeline (summarizeMeeting) via task dispatch; it lives
 * in the gateway here to keep the transcript→summary path a single testable hop.
 */

export type MeetingSummary = { summary: string; actionItems: string[] };

export type SummarizeTranscriptFn = (
    transcript: string,
    language?: string,
) => Promise<MeetingSummary | null>;

const SUMMARY_SYSTEM_PROMPT =
    'You are a meeting assistant. Read the meeting transcript and produce concise, useful ' +
    'meeting intelligence. Extract a short summary (3-6 sentences) and a list of concrete, ' +
    'actionable items. Each action item must be a single actionable sentence; when the transcript ' +
    'names an owner, start the item with "Owner: ". Respond as JSON only: ' +
    '{"summary": string, "actionItems": string[]}.';

export function createMeetingSummarizer(
    env: NodeJS.ProcessEnv = process.env,
): SummarizeTranscriptFn {
    return async (transcript, language = 'en') => {
        const apiKey = env['AF_OPENAI_API_KEY'] || env['OPENAI_API_KEY'];
        if (!apiKey || !transcript.trim()) return null;
        const baseUrl = (env['AF_OPENAI_BASE_URL'] || 'https://api.openai.com/v1').replace(/\/$/, '');
        const model = env['AF_OPENAI_MODEL'] || 'gpt-4o-mini';
        try {
            const res = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                    model,
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                    messages: [
                        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
                        {
                            role: 'user',
                            content: `Transcript:\n\n${transcript.slice(0, 48_000)}\n\nRespond in ${language}. Return {"summary": string, "actionItems": string[]}.`,
                        },
                    ],
                }),
                signal: AbortSignal.timeout(60_000),
            });
            if (!res.ok) return null;
            const body = (await res.json()) as {
                choices?: { message?: { content?: string } }[];
            };
            const content = body.choices?.[0]?.message?.content ?? '';
            if (!content) return null;
            const parsed = JSON.parse(content) as { summary?: unknown; actionItems?: unknown };
            const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
            const actionItems = Array.isArray(parsed.actionItems)
                ? parsed.actionItems.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
                : [];
            if (!summary && actionItems.length === 0) return null;
            return { summary, actionItems };
        } catch {
            return null;
        }
    };
}
