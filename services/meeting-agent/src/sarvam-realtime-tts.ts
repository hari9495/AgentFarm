/**
 * Sarvam AI Real-Time (streaming) TTS client.
 *
 * POST /text-to-speech/convert-stream returns a chunked audio stream.
 * Each yielded ArrayBuffer contains a fragment of the audio data.
 *
 * The fetch implementation is injectable for unit testing.
 */

const SARVAM_STREAMING_TTS_URL = 'https://api.sarvam.ai/text-to-speech/convert-stream';

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FetchLike = (url: string, init?: RequestInit) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    body: ReadableStream<Uint8Array> | null;
    text: () => Promise<string>;
}>;

export interface SarvamRealtimeTtsOptions {
    apiKey: string;
    /** Per-request timeout in ms (default 30 000). */
    timeoutMs?: number;
    /** Inject a custom fetch for testing. */
    fetch?: FetchLike;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SarvamRealtimeTtsClient {
    private readonly apiKey: string;
    private readonly timeoutMs: number;
    private readonly fetchFn: FetchLike;

    constructor(options: SarvamRealtimeTtsOptions) {
        if (!options.apiKey) throw new Error('SarvamRealtimeTtsClient: apiKey is required');
        this.apiKey = options.apiKey;
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.fetchFn = options.fetch ?? (fetch as unknown as FetchLike);
    }

    async *synthesizeStream(text: string, languageCode: string): AsyncIterable<ArrayBuffer> {
        if (!text?.trim()) throw new Error('SarvamRealtimeTtsClient.synthesizeStream: text is required');

        const speaker = SPEAKER_MAP[languageCode] ?? 'meera';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        let res: Awaited<ReturnType<FetchLike>>;
        try {
            res = await this.fetchFn(SARVAM_STREAMING_TTS_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-subscription-key': this.apiKey,
                },
                body: JSON.stringify({
                    inputs: [text],
                    target_language_code: languageCode,
                    speaker,
                    model: 'bulbul:v1',
                }),
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(
                `SarvamRealtimeTtsClient: ${res.status} ${res.statusText}` +
                (detail ? ` — ${detail.slice(0, 200)}` : ''),
            );
        }

        if (!res.body) {
            throw new Error('SarvamRealtimeTtsClient: response has no body');
        }

        const reader = res.body.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value && value.byteLength > 0) {
                    yield value.buffer.slice(
                        value.byteOffset,
                        value.byteOffset + value.byteLength,
                    ) as ArrayBuffer;
                }
            }
        } finally {
            reader.releaseLock();
        }
    }
}
