import type { NotificationChannelConfig, NotificationDispatchResult, NotificationRecord } from '@agentfarm/shared-types';

/**
 * Builds a VoxCPM-compatible TTS + voice-call request payload.
 * The design mirrors VoxCPM's OpenAI-compatible `/v1/audio/speech` endpoint
 * plus a lightweight `/v1/calls/initiate` envelope for delivery.
 * Exported for unit testing without network access.
 */
export function buildVoiceRequest(
    toNumber: string,
    fromNumber: string,
    text: string,
    ttsModel = 'voxcpm-tts-1',
    voiceId = 'nova',
): { url: string; body: Record<string, unknown> } {
    return {
        url: '/v1/calls/initiate',
        body: {
            to: toNumber,
            from: fromNumber,
            tts: {
                model: ttsModel,
                voice: voiceId,
                input: text,
            },
        },
    };
}

/**
 * Sends a voice-call notification via a configurable SIP/VoIP provider
 * (e.g. VoxCPM, Twilio, or any webhook-compatible voice API).
 *
 * Required keys in `channelConfig.config`:
 *   - voiceApiUrl   – base URL of the voice API (e.g. https://api.voxcpm.io)
 *   - toNumber      – E.164 destination number or SIP URI
 *   - fromNumber    – caller ID / originating number
 *   - apiKey        – bearer token for the voice provider
 *
 * Optional:
 *   - ttsModel      – TTS model identifier (default: voxcpm-tts-1)
 *   - voiceId       – voice persona (default: nova)
 */
export async function sendVoice(
    record: NotificationRecord,
    channelConfig: NotificationChannelConfig,
    fetcher: (url: string, body: Record<string, unknown>, apiKey: string) => Promise<string | undefined> = _defaultFetch,
): Promise<NotificationDispatchResult> {
    const { voiceApiUrl, toNumber, fromNumber, apiKey, ttsModel, voiceId } = channelConfig.config;

    if (!voiceApiUrl || !toNumber || !fromNumber || !apiKey) {
        return {
            notificationId: record.id,
            channel: 'voice',
            success: false,
            errorMessage: 'voice: missing voiceApiUrl, toNumber, fromNumber, or apiKey in channel config',
        };
    }

    const text = `${record.title}. ${record.body}`;
    const req = buildVoiceRequest(toNumber, fromNumber, text, ttsModel, voiceId);

    try {
        const callSid = await fetcher(`${voiceApiUrl}${req.url}`, req.body, apiKey);
        return {
            notificationId: record.id,
            channel: 'voice',
            success: true,
            platformMessageId: callSid,
        };
    } catch (err) {
        return {
            notificationId: record.id,
            channel: 'voice',
            success: false,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}

async function _defaultFetch(
    url: string,
    body: Record<string, unknown>,
    apiKey: string,
): Promise<string | undefined> {
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`voice: HTTP ${res.status}`);
    const json = (await res.json()) as { callSid?: string; call_sid?: string };
    return json.callSid ?? json.call_sid;
}
