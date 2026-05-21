/**
 * CaptureController — drives the desktop-agent voice sidecar.
 *
 * The pipecat_sidecar.py service exposes two relevant endpoints:
 *
 *   POST /v1/capture/start  { session_id, callback_url, callback_token? }
 *   POST /v1/capture/stop   { session_id }
 *
 * When `/v1/sessions/:id/start` is hit on meeting-agent, the server calls
 * {@link CaptureController.start} so the sidecar begins listening on the
 * default PulseAudio monitor source and POSTs final utterances back to the
 * meeting-agent's own `/v1/sessions/:id/transcript/inbound` route.
 *
 * Failures are non-fatal: they're surfaced on the response and logged, but
 * never abort the meeting lifecycle. The FSM is the source of truth.
 */

export interface CaptureStartInput {
    sessionId: string;
    /** Absolute URL the sidecar should POST final utterances to. */
    callbackUrl: string;
    /** Optional bearer token the sidecar must send back on the callback. */
    callbackToken?: string;
}

export interface CaptureStopInput {
    sessionId: string;
}

export interface CaptureResult {
    ok: boolean;
    /** Identifier returned by the sidecar when capture is engaged. */
    captureId?: string;
    error?: string;
}

export interface CaptureController {
    start(input: CaptureStartInput): Promise<CaptureResult>;
    stop(input: CaptureStopInput): Promise<CaptureResult>;
}

/** Minimal subset of the global `fetch` API used by the controller. */
export type FetchLike = (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}>;

export interface HttpCaptureControllerOptions {
    /** Base URL of the pipecat sidecar, e.g. `http://desktop-agent:7800`. */
    endpoint: string;
    /** Bearer token the sidecar requires (PIPECAT_TOKEN). */
    authToken?: string;
    /** Per-request timeout (default 10s). */
    timeoutMs?: number;
    /** Override the global fetch (used by tests). */
    fetchImpl?: FetchLike;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class HttpCaptureController implements CaptureController {
    private readonly endpoint: string;
    private readonly authToken: string | undefined;
    private readonly timeoutMs: number;
    private readonly fetchImpl: FetchLike;

    constructor(options: HttpCaptureControllerOptions) {
        if (!options.endpoint) {
            throw new Error('HttpCaptureController requires endpoint');
        }
        this.endpoint = options.endpoint.replace(/\/+$/u, '');
        this.authToken = options.authToken || undefined;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
        const impl = options.fetchImpl ?? globalFetch;
        if (!impl) {
            throw new Error('HttpCaptureController: no fetch implementation available');
        }
        this.fetchImpl = impl;
    }

    async start(input: CaptureStartInput): Promise<CaptureResult> {
        return this.call('/v1/capture/start', {
            session_id: input.sessionId,
            callback_url: input.callbackUrl,
            callback_token: input.callbackToken,
        });
    }

    async stop(input: CaptureStopInput): Promise<CaptureResult> {
        return this.call('/v1/capture/stop', {
            session_id: input.sessionId,
        });
    }

    private async call(
        route: string,
        payload: Record<string, unknown>,
    ): Promise<CaptureResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (this.authToken) {
                headers['Authorization'] = `Bearer ${this.authToken}`;
            }
            const response = await this.fetchImpl(`${this.endpoint}${route}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            if (!response.ok) {
                let detail = '';
                try { detail = (await response.text()).slice(0, 256); } catch { /* ignore */ }
                return {
                    ok: false,
                    error: `sidecar_status_${response.status}${detail ? `: ${detail}` : ''}`,
                };
            }
            let parsed: unknown = {};
            try { parsed = await response.json(); } catch { /* empty body */ }
            const obj = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
            const captureId = typeof obj['capture_id'] === 'string'
                ? (obj['capture_id'] as string)
                : typeof obj['captureId'] === 'string'
                    ? (obj['captureId'] as string)
                    : undefined;
            return { ok: true, captureId };
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
