/**
 * Speaking agent — voice cloning, synthesis, and listen/respond loop scaffold.
 *
 * Provides four lifecycle functions:
 *   cloneAgentVoice      → clone a voice sample and register it with the session
 *   speakResponse        → synthesize spoken audio from text
 *   listenAndRespond     → transcribe input audio, generate a reply, return spoken audio
 *   runSpeakingAgentLoop → scaffold entry point (real loop wiring comes later)
 */

import { VoiceboxClient } from './voicebox-client.js';
import { loadPersonaForBot } from './persona-context-loader.js';
import type { AgentPersonaRecord } from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const gatewayBase = (): string =>
    (process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/, '');

const anthropicApiKey = (): string =>
    process.env['ANTHROPIC_API_KEY'] ?? '';

// ---------------------------------------------------------------------------
// Anthropic response shape (subset)
// ---------------------------------------------------------------------------

type AnthropicTextBlock = { type: 'text'; text: string };
type AnthropicResponse = { content: AnthropicTextBlock[] };

// ---------------------------------------------------------------------------
// Gateway session shape (subset)
// ---------------------------------------------------------------------------

type MeetingSessionRecord = {
    agentVoiceId?: string | null;
    speakingEnabled?: boolean;
    resolvedLanguage?: string | null;
    tenantId?: string | null;
    agentId?: string | null;
    meetingPurpose?: string | null;
};

// ---------------------------------------------------------------------------
// Conversation history — per-meeting rolling buffer (last N turns)
// ---------------------------------------------------------------------------

type ChatTurn = { role: 'user' | 'assistant'; content: string };

const MAX_HISTORY_TURNS = 20;
const conversationHistory = new Map<string, ChatTurn[]>();

/** Reset the in-memory conversation history (for tests / new meeting). */
export function resetMeetingHistory(sessionId?: string): void {
    if (sessionId) {
        conversationHistory.delete(sessionId);
        workContextCache.delete(sessionId);
    } else {
        conversationHistory.clear();
        workContextCache.clear();
    }
}

function appendHistory(sessionId: string, turn: ChatTurn): void {
    const existing = conversationHistory.get(sessionId) ?? [];
    existing.push(turn);
    // Keep only the most recent MAX_HISTORY_TURNS turns
    if (existing.length > MAX_HISTORY_TURNS) {
        existing.splice(0, existing.length - MAX_HISTORY_TURNS);
    }
    conversationHistory.set(sessionId, existing);
}

// ---------------------------------------------------------------------------
// Recent work context — fetched once per meeting, cached per session
// ---------------------------------------------------------------------------

type RecentWorkRecord = {
    id: string;
    actionType: string;
    inputSummary: string;
    outputSummary: string | null;
    status: string;
    createdAt: string;
    completedAt: string | null;
};

const workContextCache = new Map<string, { value: string; expiresAt: number }>();
const WORK_CONTEXT_TTL_MS = 10 * 60 * 1000; // 10 minutes — re-fetch mid-meeting to catch newly-completed work

/**
 * Fetch the bot's recent ActionRecords from the gateway and format them into
 * a short plain-text block suitable for inclusion in the LLM system prompt.
 *
 * Returns an empty string if the gateway is unreachable or the bot has no
 * recent work — graceful degradation, never throws.
 */
export async function fetchRecentWorkContext(
    botId: string,
    sinceHours = 24,
    limit = 15,
): Promise<string> {
    const base = gatewayBase();
    if (!base) return '';

    try {
        const url = `${base}/v1/agents/${encodeURIComponent(botId)}/recent-work?sinceHours=${sinceHours}&limit=${limit}`;
        const res = await fetch(url, {
            method: 'GET',
            headers: { 'content-type': 'application/json' },
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return '';

        const body = (await res.json()) as { records?: RecentWorkRecord[] };
        const records = body.records ?? [];
        if (records.length === 0) return '';

        const completed = records.filter((r) => r.status === 'completed');
        const inProgress = records.filter((r) => r.status === 'pending' || r.status === 'in_progress');
        const failed = records.filter((r) => r.status === 'failed' || r.status === 'error');

        const fmt = (r: RecentWorkRecord) =>
            `  - [${r.actionType}] ${r.inputSummary}${r.outputSummary ? ` → ${r.outputSummary}` : ''}`;

        const sections: string[] = [];
        if (completed.length > 0) {
            sections.push(`Completed in the last ${sinceHours}h:\n${completed.slice(0, 8).map(fmt).join('\n')}`);
        }
        if (inProgress.length > 0) {
            sections.push(`In progress:\n${inProgress.slice(0, 5).map(fmt).join('\n')}`);
        }
        if (failed.length > 0) {
            sections.push(`Failed / blocked:\n${failed.slice(0, 5).map(fmt).join('\n')}`);
        }
        return sections.join('\n\n');
    } catch (err) {
        console.warn(`[speaking-agent] fetchRecentWorkContext failed for ${botId}: ${String(err)}`);
        return '';
    }
}

// ---------------------------------------------------------------------------
// shouldRespond — gate to prevent the agent from being an annoying interrupter
// ---------------------------------------------------------------------------

/**
 * Decide whether the agent should respond to a transcribed turn.
 *
 * Rules:
 *   - Empty / whitespace-only transcripts (silence, noise) → false
 *   - standup / interview_assistant → always respond (round-robin / 1:1)
 *   - interactive_qa → respond to questions, direct commands, or address by name
 *   - Otherwise: respond when addressed by name or a question is asked
 */
export function shouldRespond(
    transcribedText: string,
    displayName: string | null | undefined,
    meetingPurpose?: string | null,
): boolean {
    const text = (transcribedText ?? '').trim();
    if (!text) return false;
    if (text.length < 3) return false; // Filter out noise tokens like "um", "ah"

    // Modes that always respond
    if (meetingPurpose === 'standup') return true;
    if (meetingPurpose === 'interview_assistant') return true;

    const lower = text.toLowerCase();
    const name = (displayName ?? '').trim().toLowerCase();

    // Addressed by name
    if (name && lower.includes(name)) return true;

    // Any question
    if (text.includes('?')) return true;

    // Direct commands / invitations that don't use a name or question mark
    if (/\b(tell me|explain|describe|introduce|walk me through|show me|help me|can you|please|what do you|how do you|what did you|what have you|what are you)\b/i.test(lower)) return true;

    return false;
}

// ---------------------------------------------------------------------------
// buildSystemPrompt — wire persona/role into the LLM call
// ---------------------------------------------------------------------------

/**
 * Build the system prompt that gives the agent its identity, role, and
 * meeting-appropriate behaviour rules.
 */
export function buildSystemPrompt(
    persona: AgentPersonaRecord | null,
    meetingPurpose: string | null | undefined,
    recentWork?: string,
): string {
    const name = persona?.displayName?.trim() || 'the agent';
    const email = persona?.emailAddress?.trim() || '';
    const style = persona?.communicationStyle?.trim() || 'professional';
    const disclosure = persona?.disclosureStatement?.trim() || 'You are an AI agent.';
    const purpose = (meetingPurpose ?? '').trim() || 'a team meeting';

    const purposeGuidance =
        purpose === 'standup'
            ? `This is a daily standup. When it is your turn, give a concise update in three parts: (1) what you completed since the last standup, (2) what you plan to work on today, (3) any blockers. Keep it under 30 seconds of speech.`
            : `You are participating in ${purpose}. Listen carefully, only speak when addressed by name or asked a direct question, and keep responses concise and professional.`;

    const styleGuidance: Record<string, string> = {
        professional: 'Use professional, clear, business-appropriate language.',
        friendly: 'Use a warm, approachable tone while remaining respectful.',
        concise: 'Be brief and to the point. Prefer short sentences.',
        formal: 'Use formal, precise language and avoid contractions.',
    };

    const sections = [
        `You are ${name}${email ? ` (${email})` : ''}, a developer on the team.`,
        `${disclosure}`,
        `Communication style: ${styleGuidance[style] ?? styleGuidance['professional']}`,
        purposeGuidance,
    ];

    if (recentWork && recentWork.trim().length > 0) {
        sections.push(
            `Here is a factual summary of your recent work — use ONLY this data when describing what you have done. Do not invent tasks, PR numbers, or outcomes:\n${recentWork}`,
        );
    }

    sections.push(
        `Do not narrate or repeat what others said. Speak as a peer engineer. Never pretend to be human if asked directly.`,
    );

    return sections.join('\n');
}

// ---------------------------------------------------------------------------
// cloneAgentVoice
// ---------------------------------------------------------------------------

/**
 * Clone a voice from an audio sample, register the resulting voiceId with the
 * meeting session via the API gateway, and return the voiceId.
 */
export async function cloneAgentVoice(
    sessionId: string,
    audioSampleBuffer: Buffer,
): Promise<string> {
    const voicebox = new VoiceboxClient();
    const voiceId = await voicebox.cloneVoice(audioSampleBuffer, `agent-${sessionId}`, 'en');

    const base = gatewayBase();
    await fetch(
        `${base}/v1/meetings/${encodeURIComponent(sessionId)}/speaking-agent`,
        {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ agentVoiceId: voiceId }),
            signal: AbortSignal.timeout(10_000),
        },
    );

    return voiceId;
}

// ---------------------------------------------------------------------------
// speakResponse
// ---------------------------------------------------------------------------

/**
 * Synthesize speech from `text` using the given `voiceId` and `language`.
 * Returns the raw WAV audio buffer.
 */
export async function speakResponse(
    text: string,
    voiceId: string,
    language: string,
): Promise<Buffer> {
    const voicebox = new VoiceboxClient();
    return voicebox.synthesizeSpeech(text, language, voiceId || undefined);
}

// ---------------------------------------------------------------------------
// listenAndRespond
// ---------------------------------------------------------------------------

/**
 * Transcribe `audioInput`, decide whether to respond, generate a persona- and
 * history-aware reply via Anthropic, and return the spoken audio buffer of
 * the response.
 *
 * Returns a zero-length Buffer when the agent decides not to respond (silence,
 * not addressed, etc.) — the caller should skip the speak() POST in that case.
 */
export async function listenAndRespond(
    sessionId: string,
    audioInput: Buffer,
    resolvedLanguage: string,
): Promise<Buffer> {
    const base = gatewayBase();

    // Fetch the session to obtain the cloned voiceId + tenant/agent context
    const sessionResponse = await fetch(
        `${base}/v1/meetings/${encodeURIComponent(sessionId)}`,
        {
            method: 'GET',
            headers: { 'content-type': 'application/json' },
            signal: AbortSignal.timeout(10_000),
        },
    );
    const sessionRecord = (await sessionResponse.json()) as MeetingSessionRecord;
    const voiceId = sessionRecord.agentVoiceId ?? '';

    // Transcribe the incoming audio
    const voicebox = new VoiceboxClient();
    const transcribed = await voicebox.transcribeAudio(audioInput, 'audio/wav');
    const transcribedText = (transcribed.text ?? '').trim();

    // Load persona for identity, role, communication style
    let persona: AgentPersonaRecord | null = null;
    if (sessionRecord.agentId && sessionRecord.tenantId) {
        try {
            persona = await loadPersonaForBot(
                sessionRecord.agentId,
                sessionRecord.tenantId,
            );
        } catch (err) {
            console.warn(
                `[speaking-agent] persona load failed for ${sessionRecord.agentId}: ${String(err)}`,
            );
        }
    }

    // Gate: should we even respond to this turn?
    if (!shouldRespond(transcribedText, persona?.displayName, sessionRecord.meetingPurpose)) {
        // Still record what was said so we have context for later turns
        if (transcribedText) {
            appendHistory(sessionId, { role: 'user', content: transcribedText });
        }
        return Buffer.alloc(0);
    }

    // For standup meetings, fetch the bot's recent work once per session so the
    // agent can give a factually grounded update instead of hallucinating.
    let recentWork = '';
    if (sessionRecord.meetingPurpose === 'standup' && sessionRecord.agentId) {
        const cached = workContextCache.get(sessionId);
        if (cached !== undefined && cached.expiresAt > Date.now()) {
            recentWork = cached.value;
        } else {
            recentWork = await fetchRecentWorkContext(sessionRecord.agentId);
            workContextCache.set(sessionId, {
                value: recentWork,
                expiresAt: Date.now() + WORK_CONTEXT_TTL_MS,
            });
        }
    }

    // Build conversation messages with rolling history
    appendHistory(sessionId, { role: 'user', content: transcribedText });
    const history = conversationHistory.get(sessionId) ?? [];

    // Generate a reply via Anthropic, with system prompt + multi-turn history
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': anthropicApiKey(),
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            system: buildSystemPrompt(persona, sessionRecord.meetingPurpose, recentWork),
            messages: history,
        }),
        signal: AbortSignal.timeout(30_000),
    });

    if (!anthropicResponse.ok) {
        const errText = await anthropicResponse.text().catch(() => '');
        throw new Error(
            `[speaking-agent] Anthropic API failed: ${anthropicResponse.status} ${errText}`,
        );
    }

    const raw = (await anthropicResponse.json()) as AnthropicResponse;
    const textBlock = raw.content.find((b) => b.type === 'text');
    const responseText = (textBlock?.text ?? '').trim();

    if (!responseText) {
        return Buffer.alloc(0);
    }

    // Record assistant turn for future context
    appendHistory(sessionId, { role: 'assistant', content: responseText });

    return speakResponse(responseText, voiceId, resolvedLanguage);
}

// ---------------------------------------------------------------------------
// runSpeakingAgentLoop
// ---------------------------------------------------------------------------

const MAX_CONSECUTIVE_FAILURES = 5;
const FAILURE_BACKOFF_MS = 2_000;
const SPEAKING_ENABLED_RECHECK_INTERVAL = 20; // re-poll speakingEnabled every N turns

/**
 * Canonical capture-respond-speak loop for a live meeting session.
 *
 * Each turn:
 *   1. Capture audio from the desktop VM
 *   2. Transcribe + generate a persona-aware reply via listenAndRespond
 *   3. Play the response audio back into the meeting
 *
 * Graceful shutdown: pass an AbortSignal, or let the operator toggle
 * speakingEnabled off in the gateway — the loop re-polls every
 * SPEAKING_ENABLED_RECHECK_INTERVAL turns and exits cleanly.
 *
 * Error resilience: up to MAX_CONSECUTIVE_FAILURES failures per phase are
 * tolerated with FAILURE_BACKOFF_MS backoff before the loop exits.
 */
export async function runSpeakingAgentLoop(
    sessionId: string,
    resolvedLanguage: string,
    options: {
        desktopSessionId: string;
        maxTurns?: number;
        captureDurationSeconds?: number;
        signal?: AbortSignal;
    },
): Promise<void> {
    const base = gatewayBase();
    const { desktopSessionId, maxTurns = 200, captureDurationSeconds = 10, signal } = options;

    // Initial session check
    const response = await fetch(
        `${base}/v1/meetings/${encodeURIComponent(sessionId)}`,
        { method: 'GET', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000) },
    );

    if (!response.ok) {
        console.warn(`[speaking-agent] Failed to fetch session ${sessionId}: HTTP ${response.status}`);
        return;
    }

    const session = (await response.json()) as MeetingSessionRecord;
    if (!session.speakingEnabled) {
        return;
    }

    console.log(`[speaking-agent] Speaking agent ready for session ${sessionId} (language: ${resolvedLanguage})`);

    let consecutiveFailures = 0;

    for (let turn = 0; turn < maxTurns; turn++) {
        // Graceful shutdown via AbortSignal
        if (signal?.aborted) {
            console.log(`[speaking-agent] Shutdown signal received — stopping after ${turn} turns`);
            break;
        }

        // Periodic re-poll of speakingEnabled so the operator can stop the loop
        // without needing an AbortSignal (e.g. dashboard toggle mid-meeting)
        if (turn > 0 && turn % SPEAKING_ENABLED_RECHECK_INTERVAL === 0) {
            try {
                const recheckRes = await fetch(
                    `${base}/v1/meetings/${encodeURIComponent(sessionId)}`,
                    { method: 'GET', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(5_000) },
                );
                if (recheckRes.ok) {
                    const recheckSession = (await recheckRes.json()) as MeetingSessionRecord;
                    if (!recheckSession.speakingEnabled) {
                        console.log(`[speaking-agent] speakingEnabled turned off — stopping loop after ${turn} turns`);
                        break;
                    }
                }
            } catch {
                // Non-fatal — continue even if the recheck fails
            }
        }

        // ── Capture audio from desktop VM ────────────────────────────────────
        let audioBuffer: Buffer;
        try {
            const captureRes = await fetch(
                `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/capture-audio`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ durationSeconds: captureDurationSeconds }),
                    signal: AbortSignal.timeout((captureDurationSeconds + 15) * 1_000),
                },
            );

            if (!captureRes.ok) {
                console.warn(`[speaking-agent] capture-audio HTTP ${captureRes.status} on turn ${turn}`);
                if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    console.error(`[speaking-agent] ${consecutiveFailures} consecutive failures — stopping loop`);
                    break;
                }
                continue;
            }

            const captured = (await captureRes.json()) as { audioBase64?: string };
            if (!captured.audioBase64) {
                consecutiveFailures = 0; // silence is not a failure
                continue;
            }
            audioBuffer = Buffer.from(captured.audioBase64, 'base64');
        } catch (captureErr: unknown) {
            console.warn(`[speaking-agent] capture-audio error on turn ${turn}: ${String(captureErr)}`);
            if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.error(`[speaking-agent] ${consecutiveFailures} consecutive failures — stopping loop`);
                break;
            }
            await new Promise<void>((r) => setTimeout(r, FAILURE_BACKOFF_MS));
            continue;
        }

        // ── Transcribe + generate LLM reply ──────────────────────────────────
        let responseAudio: Buffer;
        try {
            responseAudio = await listenAndRespond(sessionId, audioBuffer, resolvedLanguage);
        } catch (respondErr: unknown) {
            console.warn(`[speaking-agent] listenAndRespond failed on turn ${turn}: ${String(respondErr)}`);
            if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.error(`[speaking-agent] ${consecutiveFailures} consecutive failures — stopping loop`);
                break;
            }
            await new Promise<void>((r) => setTimeout(r, FAILURE_BACKOFF_MS));
            continue;
        }

        consecutiveFailures = 0; // reset on any successful capture+respond turn

        // Zero-length buffer means the gate decided not to speak this turn
        if (responseAudio.length === 0) {
            continue;
        }

        // ── Play response audio back into the meeting ─────────────────────────
        try {
            const speakRes = await fetch(
                `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/speak`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ audioBase64: responseAudio.toString('base64'), format: 'wav' }),
                    signal: AbortSignal.timeout(30_000),
                },
            );
            if (!speakRes.ok) {
                console.warn(`[speaking-agent] speak HTTP ${speakRes.status} on turn ${turn}`);
            }
        } catch (speakErr: unknown) {
            // Non-fatal — a failed playback does not stop the loop
            console.warn(`[speaking-agent] speak error on turn ${turn}: ${String(speakErr)}`);
        }
    }
}
