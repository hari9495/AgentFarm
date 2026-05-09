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
import { VoxCPM2Client } from './voxcpm2-client.js';

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
};

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
    const vox = new VoxCPM2Client();
    const voiceId = await vox.cloneVoice(audioSampleBuffer, `agent-${sessionId}`, 'en');

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
    const vox = new VoxCPM2Client();
    return vox.synthesize(text, language, { voiceId });
}

// ---------------------------------------------------------------------------
// listenAndRespond
// ---------------------------------------------------------------------------

/**
 * Transcribe `audioInput`, generate an AI reply via Anthropic, and return
 * the spoken audio buffer of the response.
 */
export async function listenAndRespond(
    sessionId: string,
    audioInput: Buffer,
    resolvedLanguage: string,
): Promise<Buffer> {
    const base = gatewayBase();

    // Fetch the session to obtain the cloned voiceId
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

    // Generate a reply via Anthropic
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': anthropicApiKey(),
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{ role: 'user', content: transcribed.text }],
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
    const responseText = textBlock?.text ?? '';

    return speakResponse(responseText, voiceId, resolvedLanguage);
}

// ---------------------------------------------------------------------------
// runSpeakingAgentLoop
// ---------------------------------------------------------------------------

/**
 * Scaffold entry point for the speaking agent loop.
 *
 * Fetches the session to check `speakingEnabled`.  Returns early when disabled.
 * Real audio I/O loop wiring is deferred to a future prompt.
 */
export async function runSpeakingAgentLoop(
    sessionId: string,
    resolvedLanguage: string,
): Promise<void> {
    const base = gatewayBase();

    const response = await fetch(
        `${base}/v1/meetings/${encodeURIComponent(sessionId)}`,
        {
            method: 'GET',
            headers: { 'content-type': 'application/json' },
            signal: AbortSignal.timeout(10_000),
        },
    );

    if (!response.ok) {
        console.warn(
            `[speaking-agent] Failed to fetch session ${sessionId}: HTTP ${response.status}`,
        );
        return;
    }

    const session = (await response.json()) as MeetingSessionRecord;

    if (!session.speakingEnabled) {
        return;
    }

    console.log(
        `[speaking-agent] Speaking agent ready for session ${sessionId} (language: ${resolvedLanguage})`,
    );
}
