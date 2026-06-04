/**
 * Meeting transcription pipeline.
 *
 * Provides a full pipeline:
 *   startMeetingSession → transcribeMeeting → summarizeMeeting → distributeMeetingSummary
 *
 * Each step is a standalone export so callers can run individual steps
 * or the full orchestrated pipeline via runFullMeetingPipeline.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';
import { callAnthropic, extractText } from '../../infrastructure/anthropic-caller.js';
import { VoiceboxClient } from '../../voicebox-client.js';
import { buildSystemPrompt } from '../../system-prompt-builder.js';
import { speakResponse, listenAndRespond, runSpeakingAgentLoop } from '../../speaking-agent.js';
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

/** Distribution target for meeting summaries — one entry per channel to notify. */
export type MeetingDistributionChannel =
    | { type: 'slack'; channel?: string }
    | { type: 'teams'; webhookUrl: string }
    | { type: 'email'; address: string };

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
    persona?: AgentPersonaRecord,
    ragOptions?: { workspaceId: string; botId?: string; meetingTitle?: string; serviceToken?: string },
): Promise<MeetingSummaryResult> {
    const key = anthropicApiKey();
    void key; // used by anthropic-caller internally

    // RAG pre-flight — retrieve similar prior meeting summaries and templates
    let ragContextBlock = '';
    if (ragOptions?.workspaceId && tenantId) {
        try {
            const { buildMeetingRagContext } = await import('./meeting-agent-rag-retriever.js');
            const base = gatewayBase();
            const svcToken = ragOptions.serviceToken ?? process.env['RUNTIME_TASK_SHARED_TOKEN'] ?? '';
            if (base && svcToken) {
                const { deriveMemoryConfig } = await import('@agentfarm/memory-service');
                const ragCtx = await buildMeetingRagContext(
                    {
                        tenantId,
                        botId: ragOptions.botId,
                        meetingTitle: ragOptions.meetingTitle ?? sessionId,
                        meetingDescription: transcript.slice(0, 500),
                        documentType: 'meeting_summary',
                    },
                    base, svcToken, ragOptions.workspaceId, deriveMemoryConfig('meeting_summary'),
                );
                ragContextBlock = ragCtx.contextBlock;
            }
        } catch { /* non-fatal */ }
    }

    const basePrompt = ragContextBlock
        ? `You are a meeting assistant. Extract a concise summary and action items.\n\n${ragContextBlock}`
        : 'You are a meeting assistant. Extract a concise summary and action items.';

    const { content: blocks } = await callAnthropic({
        tier: 'balanced',
        system: buildSystemPrompt({
            basePrompt,
            language,
            persona,
            role: 'meeting assistant',
        }),
        messages: [
            {
                role: 'user',
                content: `Transcript:\n${transcript}\n\nRespond in ${language}. Return JSON only: { "summary": string, "actionItems": string[] }`,
            },
        ],
        maxTokens: 1500,
        signal: AbortSignal.timeout(60_000),
    });
    const textContent = extractText(blocks);
    if (!textContent) {
        throw new Error('[meeting] Anthropic returned no text content block');
    }

    let parsed: { summary: string; actionItems: string[] };
    try {
        parsed = JSON.parse(textContent) as { summary: string; actionItems: string[] };
    } catch {
        throw new Error(`[meeting] Failed to parse Anthropic JSON response: ${textContent}`);
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
 * Send the meeting summary to one or more channels via ProviderExecutor,
 * then mark session done.
 *
 * Defaults to a Slack broadcast when no channels are specified (backward-compatible).
 */
export async function distributeMeetingSummary(
    sessionId: string,
    summary: string,
    actionItems: string[],
    language: string,
    tenantId: string,
    executor: MeetingProviderExecutor,
    channels?: MeetingDistributionChannel[],
): Promise<void> {
    const message =
        `📋 *Meeting Summary*\n${summary}\n\n*Action Items:*\n` +
        actionItems.map((i) => `• ${i}`).join('\n');

    // Fire-and-forget: synthesize audio version of the summary via the speaking agent.
    // Failures are logged but must not block distribution.
    speakResponse(summary, '', language ?? 'en').catch((synthErr: unknown) => {
        console.warn(`[meeting] speaking-agent synthesis failed (non-fatal): ${String(synthErr)}`);
    });

    // Default to a single Slack broadcast when no channels are configured.
    const targets: MeetingDistributionChannel[] = channels?.length ? channels : [{ type: 'slack' }];

    for (const ch of targets) {
        if (ch.type === 'slack') {
            await executor({
                connectorType: 'slack',
                actionType: 'send_message',
                payload: { text: message, language, ...(ch.channel ? { channel: ch.channel } : {}) },
                attempt: 1,
                secretRefId: null,
            });
        } else if (ch.type === 'teams') {
            await executor({
                connectorType: 'teams',
                actionType: 'send_message',
                payload: { text: message, language, webhook_url: ch.webhookUrl },
                attempt: 1,
                secretRefId: null,
            });
        } else if (ch.type === 'email') {
            await executor({
                connectorType: 'email',
                actionType: 'send_email',
                payload: { to: ch.address, subject: 'Meeting Summary', body: message, language },
                attempt: 1,
                secretRefId: null,
            });
        }
    }

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
    /** Agent persona — passed to summarizeMeeting so the LLM summarises in role context. */
    persona?: AgentPersonaRecord;
    /** Channels to distribute the summary to. Defaults to Slack when omitted. */
    distributionChannels?: MeetingDistributionChannel[];
};

/**
 * Orchestrates all 4 steps end-to-end.
 * On any error, patches meeting status to "error" then rethrows.
 */
export async function runFullMeetingPipeline(
    params: RunFullMeetingPipelineParams,
    executor: MeetingProviderExecutor,
): Promise<{ sessionId: string; summary: string; actionItems: string[] }> {
    const { audioBuffer, persona, distributionChannels, ...startParams } = params;

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
            persona,
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
            distributionChannels,
        );

        const channelNames = distributionChannels?.map((c) => c.type).join(', ') ?? 'slack';
        await logMeetingEvent({
            meetingSessionId: sessionId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            agentId: params.agentId,
            platform: params.platform,
            eventType: 'summary_distributed',
            summary: `Meeting summary distributed to ${channelNames}`,
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
    /** Optional signal for graceful shutdown — passed through to runSpeakingAgentLoop. */
    signal?: AbortSignal;
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
        signal,
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

    // Step 3 — Delegate the capture → respond → speak loop to the canonical
    // runSpeakingAgentLoop, which adds graceful shutdown and error resilience.
    await runSpeakingAgentLoop(meetingSessionId, language, {
        desktopSessionId,
        maxTurns,
        captureDurationSeconds,
        signal,
    });

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

// ---------------------------------------------------------------------------
// Post-decision hooks — call after summary is approved / feedback received
// ---------------------------------------------------------------------------

export async function onMeetingSummaryApproved(params: {
    tenantId: string; botId?: string; workspaceId: string; meetingTitle: string;
    content: string; meetingType?: import('./meeting-agent-rag-retriever.js').MeetingType;
    serviceToken?: string;
}): Promise<void> {
    try {
        const { ingestMeetingSummary } = await import('./meeting-agent-rag-retriever.js');
        const base = gatewayBase();
        const svcToken = params.serviceToken ?? process.env['RUNTIME_TASK_SHARED_TOKEN'] ?? '';
        if (!base || !svcToken) return;
        await ingestMeetingSummary({
            tenantId: params.tenantId,
            botId: params.botId,
            meetingTitle: params.meetingTitle,
            documentType: 'meeting_summary',
            content: params.content,
            meetingType: params.meetingType,
            gatewayBaseUrl: base,
            serviceToken: svcToken,
        });
    } catch { /* non-fatal */ }
}

export async function onMeetingFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string;
    feedbackReasons: string[];
    serviceToken?: string;
}): Promise<void> {
    try {
        const { ingestMeetingFeedback, GatewayMeetingLessonStore } = await import('./meeting-agent-lesson-pipeline.js');
        const base = gatewayBase();
        const svcToken = params.serviceToken ?? process.env['RUNTIME_TASK_SHARED_TOKEN'] ?? '';
        if (!base || !svcToken) return;
        const store = new GatewayMeetingLessonStore(base, svcToken);
        await ingestMeetingFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
