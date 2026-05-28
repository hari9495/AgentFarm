/**
 * Sarvam AI TTS client for the meeting agent.
 *
 * Implements the same `synthesize()` interface as {@link SupertonicClient} so
 * it can be passed as the `tts` option to {@link createMeetingAgentServer}.
 * Uses Sarvam AI Bulbul v1 — optimised for Indian languages.
 */

import type { SynthesizeResult } from './supertonic-client.js';

const SARVAM_TTS_URL = 'https://api.sarvam.ai/text-to-speech';

const SPEAKER_MAP: Record<string, string> = {
    'hi-IN': 'meera',
    'ta-IN': 'pavithra',
    'te-IN': 'arvind',
    'kn-IN': 'arvind',
    'ml-IN': 'arvind',
    'mr-IN': 'amol',
    'bn-IN': 'meera',
    'gu-IN': 'meera',
    'pa-IN': 'meera',
};

export interface SarvamMeetingTtsOptions {
    apiKey: string;
    /** BCP-47 language code (default `hi-IN`). */
    languageCode?: string;
    /** Per-request timeout in ms (default 15 000). */
    timeoutMs?: number;
}

export class SarvamMeetingTtsClient {
    private readonly apiKey: string;
    private readonly languageCode: string;
    private readonly timeoutMs: number;

    constructor(options: SarvamMeetingTtsOptions) {
        if (!options.apiKey) throw new Error('SarvamMeetingTtsClient: apiKey is required');
        this.apiKey = options.apiKey;
        this.languageCode = options.languageCode ?? 'hi-IN';
        this.timeoutMs = options.timeoutMs ?? 15_000;
    }

    async synthesize(text: string, options: { voice?: string } = {}): Promise<SynthesizeResult> {
        if (!text?.trim()) throw new Error('SarvamMeetingTtsClient.synthesize: text is required');
        const speaker = options.voice ?? SPEAKER_MAP[this.languageCode] ?? 'meera';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const startedAt = Date.now();
        try {
            const res = await fetch(SARVAM_TTS_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-subscription-key': this.apiKey,
                },
                body: JSON.stringify({
                    inputs: [text],
                    target_language_code: this.languageCode,
                    speaker,
                    model: 'bulbul:v1',
                }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new Error(
                    `SarvamMeetingTtsClient: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`,
                );
            }
            const data = await res.json() as { audios?: string[] };
            const b64 = data.audios?.[0];
            if (!b64) throw new Error('SarvamMeetingTtsClient: no audio in response');
            const buf = Buffer.from(b64, 'base64');
            const audio = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
            return { audio, contentType: 'audio/wav', durationMs: Date.now() - startedAt };
        } finally {
            clearTimeout(timer);
        }
    }
}
