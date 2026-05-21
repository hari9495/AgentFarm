/**
 * Voice injection client.
 *
 * After {@link SupertonicClient} synthesises a TTS payload, the audio bytes
 * need to land on the meeting client's microphone. Inside the desktop-agent
 * container that is handled by `pipecat_sidecar.py` (port 7800 by default),
 * which exposes `POST /v1/inject` accepting any audio container ffmpeg can
 * decode and writing the PCM stream to the PulseAudio AgentMic sink.
 *
 * This module is intentionally narrow: it does not own the FSM, does not
 * persist anything, and never throws — failures are surfaced as
 * `{ ok: false, error }` so the /say handler can record the attempt without
 * tearing down the meeting session.
 */

export interface VoiceInjectInput {
    /** Audio bytes to inject (mp3/wav/opus/flac — anything ffmpeg can decode). */
    audio: ArrayBuffer | Uint8Array | Buffer;
    /** MIME type for the audio body (e.g. `audio/mpeg`, `audio/wav`). */
    contentType: string;
    /** Meeting-agent session id (forwarded for sidecar-side correlation). */
    sessionId: string;
    /** Optional PulseAudio sink override (defaults to `AgentMic`). */
    sink?: string;
}

export interface VoiceInjectResult {
    ok: boolean;
    bytesPlayed?: number;
    sink?: string;
    error?: string;
}

export interface VoiceInjector {
    inject(input: VoiceInjectInput): Promise<VoiceInjectResult>;
}

/** Minimal subset of the global `fetch` API used by the injector. */
export type FetchLike = (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | Buffer | Uint8Array;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}>;

export interface HttpVoiceInjectorOptions {
    /** Base URL of the desktop-agent voice sidecar, e.g. `http://desktop-agent:7800`. */
    endpoint: string;
    /** Optional bearer token enforced by the sidecar (`PIPECAT_TOKEN`). */
    authToken?: string;
    /** Per-request timeout in milliseconds (default 15s). */
    timeoutMs?: number;
    /** Override the global `fetch` implementation (used by tests). */
    fetchImpl?: FetchLike;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export class HttpVoiceInjector implements VoiceInjector {
    private readonly endpoint: string;
    private readonly authToken: string | undefined;
    private readonly timeoutMs: number;
    private readonly fetchImpl: FetchLike;

    constructor(options: HttpVoiceInjectorOptions) {
        if (!options.endpoint) {
            throw new Error('HttpVoiceInjector requires endpoint');
        }
        // Strip trailing slash so we can append `/v1/inject` deterministically.
        this.endpoint = options.endpoint.replace(/\/+$/, '');
        this.authToken = options.authToken || undefined;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
        const impl = options.fetchImpl ?? globalFetch;
        if (!impl) {
            throw new Error('HttpVoiceInjector: no fetch implementation available');
        }
        this.fetchImpl = impl;
    }

    async inject(input: VoiceInjectInput): Promise<VoiceInjectResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const headers: Record<string, string> = {
                'Content-Type': input.contentType || 'application/octet-stream',
                'X-Session-Id': input.sessionId,
            };
            if (input.sink) {
                headers['X-Pulse-Sink'] = input.sink;
            }
            if (this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }
            const body = toRequestBody(input.audio);
            const response = await this.fetchImpl(`${this.endpoint}/v1/inject`, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal,
            });
            if (!response.ok) {
                let detail = '';
                try { detail = (await response.text()).slice(0, 256); } catch { /* swallow */ }
                return {
                    ok: false,
                    error: `sidecar_status_${response.status}${detail ? `: ${detail}` : ''}`,
                };
            }
            let parsed: unknown = {};
            try { parsed = await response.json(); } catch { /* sidecar may return empty body */ }
            const obj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
            const bytesPlayed = typeof obj['bytes_played'] === 'number'
                ? (obj['bytes_played'] as number)
                : typeof obj['bytesPlayed'] === 'number'
                    ? (obj['bytesPlayed'] as number)
                    : undefined;
            const sink = typeof obj['sink'] === 'string' ? (obj['sink'] as string) : undefined;
            return { ok: true, bytesPlayed, sink };
        } catch (error) {
            const message = (error as Error).name === 'AbortError'
                ? `timeout after ${this.timeoutMs}ms`
                : (error as Error).message;
            return { ok: false, error: message };
        } finally {
            clearTimeout(timer);
        }
    }
}

function toRequestBody(
    audio: ArrayBuffer | Uint8Array | Buffer,
): BodyInit | Buffer | Uint8Array {
    if (audio instanceof ArrayBuffer) {
        return new Uint8Array(audio);
    }
    return audio;
}
