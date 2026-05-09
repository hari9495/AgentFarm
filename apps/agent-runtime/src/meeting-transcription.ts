/**
 * Meeting transcription pipeline.
 *
 * Provides a full pipeline:
 *   startMeetingSession → transcribeMeeting → summarizeMeeting → distributeMeetingSummary
 *
 * Each step is a standalone export so callers can run individual steps
 * or the full orchestrated pipeline via runFullMeetingPipeline.
 */

import { VoiceboxClient } from './voicebox-client.js';
import { buildSystemPrompt } from './system-prompt-builder.js';
import { VoxCPM2Client } from './voxcpm2-client.js';

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
            model: 'claude-sonnet-4-20250514',
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

    // Fire-and-forget: synthesize audio version of the summary via VoxCPM2.
    // Failures are logged but must not block distribution.
    try {
        const voxcpm2 = new VoxCPM2Client();
        const audioBuffer = await voxcpm2.synthesize(summary, language);
        console.log(`[meeting] VoxCPM2 synthesized ${audioBuffer.byteLength} bytes for session ${sessionId}`);
    } catch (synthErr: unknown) {
        console.warn(`[meeting] VoxCPM2 synthesis failed (non-fatal): ${String(synthErr)}`);
    }

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

        const { transcript, language } = await transcribeMeeting(
            sessionId,
            audioBuffer,
            params.tenantId,
        );

        const { summary, actionItems } = await summarizeMeeting(
            sessionId,
            transcript,
            language,
            params.tenantId,
        );

        await distributeMeetingSummary(
            sessionId,
            summary,
            actionItems,
            language,
            params.tenantId,
            executor,
        );

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
        }
        throw err;
    }
}
