/**
 * Sarvam AI Real-Time STT client.
 *
 * Connects to wss://api.sarvam.ai/speech-to-text/transcribe/ws and streams
 * binary audio chunks. Emits partial and final transcript callbacks.
 *
 * The WebSocket constructor is injectable so unit tests can supply a mock.
 */

const SARVAM_REALTIME_STT_URL = 'wss://api.sarvam.ai/speech-to-text/transcribe/ws';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SarvamRealtimeSttCallbacks = {
    onPartialTranscript: (text: string) => void;
    onFinalTranscript: (text: string, languageCode: string) => void;
    onError?: (err: Error) => void;
};

/** Minimal WebSocket surface needed — matches both `ws` and native WebSocket. */
export interface WsLike {
    readonly readyState: number;
    onopen:    ((event: unknown) => void) | null;
    onmessage: ((event: { data: unknown }) => void) | null;
    onclose:   ((event: unknown) => void) | null;
    onerror:   ((event: unknown) => void) | null;
    send(data: string | ArrayBuffer | Buffer | Uint8Array): void;
    close(code?: number, reason?: string): void;
}

export type WsFactory = (url: string) => WsLike;

export interface SarvamRealtimeSttOptions {
    apiKey: string;
    /** BCP-47 language code (default `hi-IN`). */
    languageCode?: string;
    /** STT model (default `saarika:v2`). */
    model?: string;
    /** Maximum reconnect attempts (default 3). */
    maxRetries?: number;
    callbacks: SarvamRealtimeSttCallbacks;
    /** Inject a custom WS constructor for testing. */
    wsFactory?: WsFactory;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SarvamRealtimeSttClient {
    private readonly apiKey: string;
    private readonly languageCode: string;
    private readonly model: string;
    private readonly maxRetries: number;
    private readonly callbacks: SarvamRealtimeSttCallbacks;
    private readonly wsFactory: WsFactory;

    private ws: WsLike | null = null;
    private retries = 0;
    private closed = false;

    constructor(options: SarvamRealtimeSttOptions) {
        if (!options.apiKey) throw new Error('SarvamRealtimeSttClient: apiKey is required');
        this.apiKey = options.apiKey;
        this.languageCode = options.languageCode ?? 'hi-IN';
        this.model = options.model ?? 'saarika:v2';
        this.maxRetries = options.maxRetries ?? 3;
        this.callbacks = options.callbacks;
        this.wsFactory = options.wsFactory ?? defaultWsFactory;
    }

    startSession(): void {
        if (this.ws && this.ws.readyState < 2 /* CLOSING */) return;
        this.closed = false;
        this._connect();
    }

    sendAudioChunk(chunk: ArrayBuffer | Buffer | Uint8Array): void {
        if (!this.ws || this.ws.readyState !== 1 /* OPEN */) return;
        this.ws.send(chunk instanceof ArrayBuffer ? chunk : Buffer.from(chunk));
    }

    endSession(): void {
        this.closed = true;
        this.ws?.close(1000, 'session ended');
        this.ws = null;
    }

    private _connect(): void {
        const url = `${SARVAM_REALTIME_STT_URL}?api-subscription-key=${encodeURIComponent(this.apiKey)}&language_code=${encodeURIComponent(this.languageCode)}&model=${encodeURIComponent(this.model)}`;
        const ws = this.wsFactory(url);
        this.ws = ws;

        ws.onopen = () => {
            this.retries = 0;
        };

        ws.onmessage = (event) => {
            const raw = event.data;
            let payload: string;
            if (typeof raw === 'string') {
                payload = raw;
            } else if (raw instanceof Buffer || raw instanceof Uint8Array) {
                payload = Buffer.from(raw).toString('utf8');
            } else {
                return;
            }

            let msg: Record<string, unknown>;
            try { msg = JSON.parse(payload) as Record<string, unknown>; } catch { return; }

            const transcript = typeof msg['transcript'] === 'string' ? msg['transcript'] : '';
            if (!transcript) return;

            if (msg['is_final'] === true) {
                const detectedLang = typeof msg['language_code'] === 'string'
                    ? msg['language_code']
                    : this.languageCode;
                this.callbacks.onFinalTranscript(transcript, detectedLang);
            } else {
                this.callbacks.onPartialTranscript(transcript);
            }
        };

        ws.onerror = () => {
            const err = new Error('SarvamRealtimeSttClient: WebSocket error');
            this.callbacks.onError?.(err);
        };

        ws.onclose = () => {
            if (this.closed) return;
            if (this.retries < this.maxRetries) {
                this.retries++;
                const delay = Math.min(1_000 * 2 ** (this.retries - 1), 8_000);
                setTimeout(() => { if (!this.closed) this._connect(); }, delay);
            } else {
                this.callbacks.onError?.(new Error('SarvamRealtimeSttClient: max retries exceeded'));
            }
        };
    }
}

// ---------------------------------------------------------------------------
// Default factory — uses native WebSocket (Node.js 22+)
// ---------------------------------------------------------------------------

function defaultWsFactory(url: string): WsLike {
    // Node.js 22 ships native WebSocket in globalThis
    const WsConstructor = (globalThis as Record<string, unknown>)['WebSocket'] as
        | (new (url: string) => WsLike)
        | undefined;
    if (!WsConstructor) {
        throw new Error(
            'SarvamRealtimeSttClient: WebSocket not available in this environment. ' +
            'Pass a wsFactory that returns a ws.WebSocket instance.',
        );
    }
    return new WsConstructor(url);
}
