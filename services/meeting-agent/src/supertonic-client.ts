/**
 * Supertonic TTS client — speaks via an OpenAI-compatible
 * `/v1/audio/speech` endpoint. Designed to be drop-in compatible with VoxCPM
 * and any other server that follows the same request shape (see
 * https://platform.openai.com/docs/api-reference/audio/createSpeech).
 *
 * The client exposes a `synthesize` method returning an
 * {@link ArrayBuffer} that callers can write to an audio sink (typically a
 * PulseAudio loopback) so the meeting client picks it up as microphone
 * input.
 */

import { buildVoxCpmRequest } from './voice-pipeline.js';

/** Minimal subset of the global `fetch` API used by the client. */
export type FetchLike = (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
}>;

export interface SupertonicClientOptions {
    /** Base URL, e.g. `http://supertonic:8000`. */
    endpoint: string;
    /** Model identifier passed in the request body. */
    model?: string;
    /** Optional bearer token for the Authorization header. */
    apiKey?: string;
    /** Override the global `fetch` implementation (used by tests). */
    fetchImpl?: FetchLike;
    /** Per-request timeout in milliseconds (default 15s). */
    timeoutMs?: number;
}

export interface SynthesizeOptions {
    /** Voice profile / voice id to use (when supported by the server). */
    voice?: string;
    /** Output container — defaults to `mp3`. */
    response_format?: 'mp3' | 'wav' | 'opus' | 'flac';
}

export interface SynthesizeResult {
    audio: ArrayBuffer;
    contentType: string | undefined;
    durationMs: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MODEL = 'supertonic';

export class SupertonicClient {
    private readonly endpoint: string;
    private readonly model: string;
    private readonly apiKey?: string;
    private readonly fetchImpl: FetchLike;
    private readonly timeoutMs: number;

    constructor(options: SupertonicClientOptions) {
        if (!options.endpoint) {
            throw new Error('SupertonicClient: endpoint is required');
        }
        this.endpoint = options.endpoint.replace(/\/+$/u, '');
        this.model = options.model ?? DEFAULT_MODEL;
        this.apiKey = options.apiKey;
        this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    }

    /** POST text to `/v1/audio/speech` and return the synthesised audio. */
    async synthesize(text: string, options: SynthesizeOptions = {}): Promise<SynthesizeResult> {
        if (!text || !text.trim()) {
            throw new Error('SupertonicClient.synthesize: text is required');
        }

        const body = buildVoxCpmRequest(text, this.model, options.voice);
        if (options.response_format) {
            body.response_format = options.response_format;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const startedAt = Date.now();

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                Accept: 'audio/*',
            };
            if (this.apiKey) {
                headers['Authorization'] = `Bearer ${this.apiKey}`;
            }
            const response = await this.fetchImpl(`${this.endpoint}/v1/audio/speech`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!response.ok) {
                const detail = await safeReadText(response);
                throw new Error(
                    `SupertonicClient.synthesize: ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ''}`,
                );
            }

            const audio = await response.arrayBuffer();
            return {
                audio,
                contentType: undefined, // headers not exposed by FetchLike
                durationMs: Date.now() - startedAt,
            };
        } finally {
            clearTimeout(timer);
        }
    }
}

async function safeReadText(response: { text: () => Promise<string> }): Promise<string> {
    try {
        const text = await response.text();
        return text.slice(0, 256);
    } catch {
        return '';
    }
}
