/**
 * Meeting transcription pipeline.
 *
 * Provides a full pipeline:
 *   startMeetingSession → transcribeMeeting → summarizeMeeting → distributeMeetingSummary
 *
 * Each step is a standalone export so callers can run individual steps
 * or the full orchestrated pipeline via runFullMeetingPipeline.
 */

import { VoiceboxClient } from '../../voicebox-client.js';
import { buildSystemPrompt } from '../../system-prompt-builder.js';
import { speakResponse, listenAndRespond } from '../../speaking-agent.js';
import { logMeetingEvent } from './meeting-audit-logger.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const gatewayBase = (): string =>
    (process.env['API_GATEWAY_URL'] ?? '').replace(/\/+$/, '');

const anthropicApiKey = (): string =>
    process.env['ANTHROPIC_API_KEY'] ?? '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeetingPlatform = 'teams' | 'zoom' | 'google_meet' | 'webex';

export type StartMeetingParams = {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    meetingUrl: string;
    platform: MeetingPlatform;
};

export type MeetingTranscriptResult = {
    transcript: string;
    language: string;
    confidence: number;
};

export type MeetingSummaryResult = {
    summary: string;
    actionItems: string[];
};

/**
 * Executor compatible with ProviderExecutor from provider-clients.ts.
 * Kept as a local alias so agent-runtime has no direct import from api-gateway.
 */
export type MeetingProviderExecutor = (input: {
    connectorType: string;
    actionType: string;
    payload: Record<string, unknown>;
    attempt: number;
    secretRefId: string | null;
}) => Promise<{ ok: boolean; resultSummary: string }>;

// ---------------------------------------------------------------------------
// Anthropic response shape (subset)
// ---------------------------------------------------------------------------

type AnthropicTextBlock = {
    type: 'text';
    text: string;
};
type AnthropicResponse = {
    content: AnthropicTextBlock[];
};

// ---------------------------------------------------------------------------
// Step 1 — Start session
// ---------------------------------------------------------------------------

/**
 * Create a MeetingSession record in the api-gateway and return the sessionId.
 */
export async function startMeetingSession(
    params: StartMeetingParams,
): Promise<{ sessionId: string }> {
    const base = gatewayBase();
    const response = await fetch(`${base}/v1/meetings`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-tenant-id': params.tenantId,
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(
            `[meeting] startMeetingSession failed with HTTP ${response.status}: ${errText}`,
        );
    }

    return response.json() as Promise<{ sessionId: string }>;
}

// ---------------------------------------------------------------------------
// Step 2 — Transcribe
// ---------------------------------------------------------------------------

/**
 * Transcribe a meeting audio buffer using VoiceboxClient, then record the
 * transcript on the gateway session.
 */
export async function transcribeMeeting(
    sessionId: string,
    audioBuffer: Buffer,
    tenantId?: string,
): Promise<MeetingTranscriptResult> {
    const voicebox = new VoiceboxClient();
    const result = await voicebox.transcribeAudio(audioBuffer, 'audio/wav');

    const base = gatewayBase();
    const patchResponse = await fetch(
        `${base}/v1/meetings/${encodeURIComponent(sessionId)}`,
        {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
                ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
            },
            body: JSON.stringify({
                status: 'transcribing',
                transcriptRaw: result.text,
                language: result.language,
            }),
            signal: AbortSignal.timeout(10_000),
        },
    );

    if (!patchResponse.ok) {
        const errText = await patchResponse.text().catch(() => '');
        throw new Error(
            `[meeting] transcribeMeeting PATCH failed with HTTP ${patchResponse.status}: ${errText}`,
        );
    }

    return {
        transcript: result.text,
        language: result.language,
        confidence: result.confidence,
    };
}

// ---------------------------------------------------------------------------
// Step 3 — Summarize
// ---------------------------------------------------------------------------

/**
 * Summarize a meeting transcript using the Anthropic API, then record the
 * summary and action items on the gateway session.
 */
export async function summarizeMeeting(
    sessionId: string,
    transcript: string,
    language: string,
    tenantId?: string,
): Promise<MeetingSummaryResult> {
    const key = anthropicApiKey();
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 1500,
            system: buildSystemPrompt({ basePrompt: 'You are a meeting assistant. Extract a concise summary and action items.', language }),
            messages: [
                {
                    role: 'user',
                    content: `Transcript:\n${transcript}\n\nRespond in ${language}. Return JSON only: { "summary": string, "actionItems": string[] }`,
                },
            ],
        }),
        signal: AbortSignal.timeout(60_000),
    });

    if (!anthropicResponse.ok) {
        const errText = await anthropicResponse.text().catch(() => '');
        throw new Error(
            `[meeting] Anthropic API failed with HTTP ${anthropicResponse.status}: ${errText}`,
        );
    }

    const raw = (await anthropicResponse.json()) as AnthropicResponse;
    const textContent = raw.content.find((b) => b.type === 'text');
    if (!textContent) {
        throw new Error('[meeting] Anthropic returned no text content block');
    }

    let parsed: { summary: string; actionItems: string[] };
    try {
        parsed = JSON.parse(textContent.text) as { summary: string; actionItems: string[] };
    } catch {
        throw new Error(`[meeting] Failed to parse Anthropic JSON response: ${textContent.text}`);
    }

    const { summary, actionItems } = parsed;

    const base = gatewayBase();
    const patchResponse = await fetch(
        `${base}/v1/meetings/${encodeURIComponent(sessionId)}`,
        {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
                ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
            },
            body: JSON.stringify({
                status: 'summarizing',
                summaryText: summary,
                actionItems: JSON.stringify(actionItems),
            }),
            signal: AbortSignal.timeout(10_000),
        },
    );

    if (!patchResponse.ok) {
        const errText = await patchResponse.text().catch(() => '');
        throw new Error(
            `[meeting] summarizeMeeting PATCH failed with HTTP ${patchResponse.status}: ${errText}`,
        );
    }

    return { summary, actionItems };
}

// ---------------------------------------------------------------------------
// Step 4 — Distribute
// ---------------------------------------------------------------------------

/**
 * Send the meeting summary to Slack via ProviderExecutor, then mark session done.
 */
export async function distributeMeetingSummary(
    sessionId: string,
    summary: string,
    actionItems: string[],
    language: string,
    tenantId: string,
    executor: MeetingProviderExecutor,
): Promise<void> {
    const message =
        `📋 *Meeting Summary*\n${summary}\n\n*Action Items:*\n` +
        actionItems.map((i) => `• ${i}`).join('\n');

    // Fire-and-forget: synthesize audio version of the summary via the speaking agent.
    // Failures are logged but must not block distribution.
    speakResponse(summary, '', language ?? 'en').catch((synthErr: unknown) => {
        console.warn(`[meeting] speaking-agent synthesis failed (non-fatal): ${String(synthErr)}`);
    });

    await executor({
        connectorType: 'slack',
        actionType: 'send_message',
        payload: {
            text: message,
            language,
        },
        attempt: 1,
        secretRefId: null,
    });

    const base = gatewayBase();
    const patchResponse = await fetch(
        `${base}/v1/meetings/${encodeURIComponent(sessionId)}`,
        {
            method: 'PATCH',
            headers: {
                'content-type': 'application/json',
                'x-tenant-id': tenantId,
            },
            body: JSON.stringify({
                status: 'done',
                endedAt: new Date().toISOString(),
            }),
            signal: AbortSignal.timeout(10_000),
        },
    );

    if (!patchResponse.ok) {
        const errText = await patchResponse.text().catch(() => '');
        throw new Error(
            `[meeting] distributeMeetingSummary PATCH failed with HTTP ${patchResponse.status}: ${errText}`,
        );
    }
}

// ---------------------------------------------------------------------------
// Full orchestrated pipeline
// ---------------------------------------------------------------------------

export type RunFullMeetingPipelineParams = StartMeetingParams & {
    audioBuffer: Buffer;
};

/**
 * Orchestrates all 4 steps end-to-end.
 * On any error, patches meeting status to "error" then rethrows.
 */
export async function runFullMeetingPipeline(
    params: RunFullMeetingPipelineParams,
    executor: MeetingProviderExecutor,
): Promise<{ sessionId: string; summary: string; actionItems: string[] }> {
    const { audioBuffer, ...startParams } = params;

    let sessionId = '';
    try {
        ({ sessionId } = await startMeetingSession(startParams));

        await logMeetingEvent({
            meetingSessionId: sessionId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            agentId: params.agentId,
            platform: params.platform,
            eventType: 'joined',
            summary: `Agent joined ${params.platform} meeting at ${params.meetingUrl}`,
            payload: { meetingUrl: params.meetingUrl },
        });

        const { transcript, language } = await transcribeMeeting(
            sessionId,
            audioBuffer,
            params.tenantId,
        );

        await logMeetingEvent({
            meetingSessionId: sessionId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            agentId: params.agentId,
            platform: params.platform,
            eventType: 'transcribed',
            summary: `Transcription complete — ${transcript.length} chars, language: ${language}`,
            payload: { charCount: transcript.length, language },
        });

        const { summary, actionItems } = await summarizeMeeting(
            sessionId,
            transcript,
            language,
            params.tenantId,
        );

        await logMeetingEvent({
            meetingSessionId: sessionId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            agentId: params.agentId,
            platform: params.platform,
            eventType: 'summarised',
            summary: `Summary generated — ${actionItems.length} action items`,
            payload: { actionItemCount: actionItems.length },
        });

        await distributeMeetingSummary(
            sessionId,
            summary,
            actionItems,
            language,
            params.tenantId,
            executor,
        );

        await logMeetingEvent({
            meetingSessionId: sessionId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            agentId: params.agentId,
            platform: params.platform,
            eventType: 'summary_distributed',
            summary: 'Meeting summary distributed to Slack',
        });

        await logMeetingEvent({
            meetingSessionId: sessionId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            agentId: params.agentId,
            platform: params.platform,
            eventType: 'left',
            summary: `Agent completed and left ${params.platform} meeting`,
        });

        return { sessionId, summary, actionItems };
    } catch (err: unknown) {
        if (sessionId) {
            const base = gatewayBase();
            await fetch(`${base}/v1/meetings/${encodeURIComponent(sessionId)}`, {
                method: 'PATCH',
                headers: {
                    'content-type': 'application/json',
                    'x-tenant-id': params.tenantId,
                },
                body: JSON.stringify({ status: 'error' }),
                signal: AbortSignal.timeout(5_000),
            }).catch(() => {
                // Best-effort; never mask the original error
            });

            await logMeetingEvent({
                meetingSessionId: sessionId,
                tenantId: params.tenantId,
                workspaceId: params.workspaceId,
                agentId: params.agentId,
                platform: params.platform,
                eventType: 'error',
                severity: 'error',
                summary: `Meeting pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
                payload: { errorMessage: err instanceof Error ? err.message : String(err) },
            });
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Live participation loop
// ---------------------------------------------------------------------------

export type MeetingParticipationParams = {
    tenantId: string;
    workspaceId: string;
    agentId: string;
    /** Desktop VM session ID (from POST /v1/desktop-sessions). */
    desktopSessionId: string;
    meetingUrl: string;
    platform: MeetingPlatform;
    language?: string;
    /** Maximum capture-respond turns before exiting. Default 200. */
    maxTurns?: number;
    /** Seconds of audio to capture per turn. Default 10. */
    captureDurationSeconds?: number;
};

/**
 * Join a video meeting via the desktop-agent, then participate in a
 * capture → transcribe → respond → speak loop for up to maxTurns turns.
 *
 * Returns the created meeting session ID so callers can retrieve the full
 * transcript and summary afterwards.
 */
export async function runMeetingParticipation(
    params: MeetingParticipationParams,
): Promise<{ meetingSessionId: string }> {
    const {
        tenantId,
        workspaceId,
        agentId,
        desktopSessionId,
        meetingUrl,
        platform,
        language = 'en',
        maxTurns = 200,
        captureDurationSeconds = 10,
    } = params;

    const base = gatewayBase();

    // Step 1 — Instruct desktop-agent to navigate to and join the meeting.
    const joinRes = await fetch(
        `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/join-meeting`,
        {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ meetingUrl, platform }),
            signal: AbortSignal.timeout(60_000),
        },
    );
    if (!joinRes.ok) {
        const errText = await joinRes.text().catch(() => '');
        throw new Error(`[meeting] join-meeting failed with HTTP ${joinRes.status}: ${errText}`);
    }

    // Step 2 — Create a MeetingSession record in the gateway.
    const { sessionId: meetingSessionId } = await startMeetingSession({
        tenantId,
        workspaceId,
        agentId,
        meetingUrl,
        platform,
    });

    await logMeetingEvent({
        meetingSessionId,
        tenantId,
        workspaceId,
        agentId,
        platform,
        eventType: 'joined',
        summary: `Agent joined ${platform} meeting at ${meetingUrl}`,
        payload: { meetingUrl, desktopSessionId },
    });

    // Step 3 — Participation loop: capture → respond → speak.
    for (let turn = 0; turn < maxTurns; turn++) {
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
            console.warn(`[meeting] capture-audio HTTP ${captureRes.status} — skipping turn ${turn}`);
            continue;
        }

        const captured = (await captureRes.json()) as { audioBase64?: string };
        if (!captured.audioBase64) {
            continue;
        }

        const audioBuffer = Buffer.from(captured.audioBase64, 'base64');

        // listenAndRespond transcribes the audio, generates a reply via LLM,
        // and synthesises it with the agent's cloned voice.  Returns a WAV Buffer.
        let responseAudio: Buffer;
        try {
            responseAudio = await listenAndRespond(meetingSessionId, audioBuffer, language);
        } catch (respondErr: unknown) {
            console.warn(`[meeting] listenAndRespond failed on turn ${turn}: ${String(respondErr)}`);
            continue;
        }

        // Zero-length buffer means the gate decided not to respond on this turn
        // (silence, not addressed, etc.) — skip speaking and listen on next turn.
        if (responseAudio.length === 0) {
            continue;
        }

        // Play the response audio into the virtual PulseAudio sink so meeting
        // participants hear the agent speak.
        const speakRes = await fetch(
            `${base}/v1/desktop-sessions/${encodeURIComponent(desktopSessionId)}/speak`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    audioBase64: responseAudio.toString('base64'),
                    format: 'wav',
                }),
                signal: AbortSignal.timeout(30_000),
            },
        );
        if (!speakRes.ok) {
            console.warn(`[meeting] speak HTTP ${speakRes.status} on turn ${turn}`);
        }
    }

    await logMeetingEvent({
        meetingSessionId,
        tenantId,
        workspaceId,
        agentId,
        platform,
        eventType: 'left',
        summary: `Agent completed ${maxTurns}-turn participation and left ${platform} meeting`,
    });

    return { meetingSessionId };
}
