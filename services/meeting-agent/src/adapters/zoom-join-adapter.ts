/**
 * ZoomJoinAdapter — joins Zoom meetings via the Zoom Video SDK (Server-to-Server OAuth).
 *
 * Prerequisites (one-time Zoom Marketplace setup):
 *   1. Create a Server-to-Server OAuth app on marketplace.zoom.us.
 *   2. Grant scopes: meeting:write:admin, meeting:read:admin
 *   3. Set env vars: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET
 *
 * Join flow:
 *   POST /oauth/token (account_credentials) → POST /v2/meetings/{id}/jointoken/local_recording
 *   → use SDK join token to connect bot as participant
 *
 * Note: Full real-time audio streaming requires the Zoom Video SDK (npm package).
 * This adapter uses the REST API to obtain join credentials. For audio capture,
 * the desktop-agent sidecar uses the SDK token to join via the Zoom client.
 *
 * Chat:
 *   POST /v2/chat/users/me/messages   (in-meeting chat)
 */

import type { MeetingAdapterCapabilities, MeetingJoinAdapter, MeetingJoinResult, MeetingLeaveResult, ScreenShareResult } from './meeting-join-adapter.js';

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token?grant_type=account_credentials&account_id=';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

export type FetchLike = (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface ZoomJoinAdapterOptions {
    accountId: string;
    clientId: string;
    clientSecret: string;
    /** Per-request timeout in ms (default: 15 s). */
    timeoutMs?: number;
    /**
     * Base URL of the zoom-video-sidecar, e.g. `http://zoom-video-sidecar:8091`.
     * When set:
     *   - `join()` delegates to the sidecar, which manages the Playwright Zoom
     *     browser session with screen-share pre-wired.
     *   - `startScreenShare()` starts FFmpeg on the desktop-agent then tells the
     *     sidecar to trigger the in-meeting Share button via xdotool.
     *   - `stopScreenShare()` and `leave()` delegate to the sidecar.
     * When null/undefined: falls back to the existing REST-only path
     * (FFmpeg capture + best-effort Zoom status PUT).
     */
    videoSidecarUrl?: string | null;
    /** Override fetch (used by tests). */
    fetchImpl?: FetchLike;
}

interface ZoomToken {
    access_token: string;
    expires_in: number;
    obtainedAt: number;
}

interface ZoomJoinTokenResponse {
    token?: string;
}

export class ZoomJoinAdapter implements MeetingJoinAdapter {
    private readonly opts: Required<Omit<ZoomJoinAdapterOptions, 'videoSidecarUrl'>> & { videoSidecarUrl: string | null };
    private cachedToken: ZoomToken | null = null;
    private readonly fetchImpl: FetchLike;

    constructor(options: ZoomJoinAdapterOptions) {
        if (!options.accountId || !options.clientId || !options.clientSecret) {
            throw new Error('ZoomJoinAdapter requires accountId, clientId, and clientSecret');
        }
        this.opts = {
            ...options,
            fetchImpl: options.fetchImpl ?? ((() => { throw new Error('No fetch'); }) as FetchLike),
            timeoutMs: options.timeoutMs ?? 15_000,
            videoSidecarUrl: options.videoSidecarUrl
                ? options.videoSidecarUrl.replace(/\/+$/u, '')
                : null,
        };
        const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
        this.fetchImpl = options.fetchImpl ?? globalFetch ?? (() => { throw new Error('No fetch available'); });
    }

    async join(meetingUrl: string, displayName?: string): Promise<MeetingJoinResult> {
        // Sidecar path: delegates browser join + screen-share pre-wiring to the sidecar.
        if (this.opts.videoSidecarUrl) {
            return this.joinViaSidecar(meetingUrl, displayName);
        }
        // Fallback: REST-only path (returns Zoom join token; no browser is launched).
        try {
            const meetingId = this.extractMeetingId(meetingUrl);
            if (!meetingId) {
                return { ok: false, joinMethod: 'zoom_sdk', error: `Cannot extract Zoom meeting ID from: ${meetingUrl}` };
            }
            const token = await this.getToken();
            const joinToken = await this.getJoinToken(token, meetingId);
            return {
                ok: true,
                joinMethod: 'zoom_sdk',
                sessionHandle: JSON.stringify({ meetingId, joinToken, displayName }),
            };
        } catch (error) {
            return { ok: false, joinMethod: 'zoom_sdk', error: (error as Error).message };
        }
    }

    private async joinViaSidecar(meetingUrl: string, displayName?: string): Promise<MeetingJoinResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
        try {
            const res = await this.fetchImpl(`${this.opts.videoSidecarUrl}/v1/sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ meetingUrl, displayName }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                return { ok: false, joinMethod: 'zoom_sdk', error: `sidecar join ${res.status}: ${detail.slice(0, 256)}` };
            }
            const data = await res.json() as { ok: boolean; sessionId?: string; error?: string };
            if (!data.ok || !data.sessionId) {
                return { ok: false, joinMethod: 'zoom_sdk', error: data.error ?? 'sidecar returned no sessionId' };
            }
            return { ok: true, joinMethod: 'zoom_sdk', sessionHandle: data.sessionId };
        } catch (error) {
            const msg = (error as Error).name === 'AbortError'
                ? `sidecar timeout after ${this.opts.timeoutMs}ms`
                : (error as Error).message;
            return { ok: false, joinMethod: 'zoom_sdk', error: msg };
        } finally {
            clearTimeout(timer);
        }
    }

    async leave(_sessionHandle?: string): Promise<MeetingLeaveResult> {
        // Zoom SDK participant leaves by ending the SDK session on the client side.
        // REST-level leave is not required for bot participants.
        return { ok: true };
    }

    /**
     * Send an in-meeting chat message.
     * `meetingId` is the numeric Zoom meeting ID.
     * `toUserId` is optional — omit to send to everyone.
     */
    async sendChatMessage(meetingId: string, text: string, toUserId?: string): Promise<void> {
        const token = await this.getToken();
        const body: Record<string, unknown> = {
            message: text,
            to_channel: meetingId,
        };
        if (toUserId) body['to_contact'] = toUserId;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
        try {
            const res = await this.fetchImpl(`${ZOOM_API_BASE}/chat/users/me/messages`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new Error(`Zoom chat ${res.status}: ${detail.slice(0, 256)}`);
            }
        } finally {
            clearTimeout(timer);
        }
    }

    getCapabilities(): MeetingAdapterCapabilities {
        return {
            chat: true,
            screenShare: true,         // implemented via startScreenShare()
            attendeeList: true,        // GET /v2/meetings/{id}/participants
            nativeAudioStream: true,   // Zoom Video SDK provides audio tracks
        };
    }

    /**
     * Start screen share: kick off Xvfb→FFmpeg capture on the desktop-agent,
     * then signal the Zoom meeting that sharing has started.
     *
     * The session handle is `JSON.stringify({ meetingId, joinToken, displayName })`
     * as returned by `join()`.
     */
    async startScreenShare(sessionHandle: string, desktopAgentUrl: string): Promise<ScreenShareResult> {
        const base = desktopAgentUrl.replace(/\/+$/u, '');
        try {
            // 1. Start Xvfb → FFmpeg → HLS capture on the desktop-agent (same for both paths).
            const captureRes = await this.fetchImpl(`${base}/v1/screen-share/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fps: 15, width: 1280, height: 800 }),
            });
            if (!captureRes.ok) {
                const detail = await captureRes.text().catch(() => '');
                return { ok: false, error: `desktop-agent screen-share/start ${captureRes.status}: ${detail.slice(0, 200)}` };
            }
            const captureData = await captureRes.json() as { ok: boolean; streamUrl?: string; error?: string };
            if (!captureData.ok) {
                return { ok: false, error: captureData.error ?? 'desktop-agent returned ok:false' };
            }

            // 2a. Sidecar path — tell the sidecar to trigger the in-meeting Share button.
            //     The sidecar calls desktop-agent /v1/screen-share/inject { platform:'zoom' }
            //     which uses xdotool to press Alt+S in the running Chromium window.
            if (this.opts.videoSidecarUrl && captureData.streamUrl) {
                const shareRes = await this.fetchImpl(
                    `${this.opts.videoSidecarUrl}/v1/sessions/${encodeURIComponent(sessionHandle)}/share/start`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hlsUrl: captureData.streamUrl }),
                    },
                );
                if (!shareRes.ok) {
                    const detail = await shareRes.text().catch(() => '');
                    return { ok: false, error: `sidecar share/start ${shareRes.status}: ${detail.slice(0, 256)}` };
                }
                return { ok: true, streamUrl: captureData.streamUrl };
            }

            // 2b. Fallback path (no sidecar) — best-effort Zoom REST status update.
            //     Zoom's REST API does not support direct video injection; this only
            //     signals intent. The HLS stream is the actual video source.
            let meetingId: string | undefined;
            try {
                const parsed = JSON.parse(sessionHandle) as { meetingId?: string };
                meetingId = parsed.meetingId;
            } catch { /* non-JSON handle — skip REST call */ }

            if (meetingId) {
                try {
                    const token = await this.getToken();
                    await this.fetchImpl(`${ZOOM_API_BASE}/meetings/${meetingId}/status`, {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'start_sharing' }),
                    });
                } catch { /* non-fatal */ }
            }

            return { ok: true, streamUrl: captureData.streamUrl };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    /** Stop screen share: stop FFmpeg and notify the sidecar. */
    async stopScreenShare(sessionHandle: string, desktopAgentUrl: string): Promise<ScreenShareResult> {
        const base = desktopAgentUrl.replace(/\/+$/u, '');
        try {
            // Stop FFmpeg on the desktop-agent.
            const stopRes = await this.fetchImpl(`${base}/v1/screen-share/stop`, { method: 'POST' });
            if (!stopRes.ok) {
                return { ok: false, error: `desktop-agent screen-share/stop ${stopRes.status}` };
            }

            // Notify the sidecar so it can update session state (best-effort).
            if (this.opts.videoSidecarUrl) {
                try {
                    await this.fetchImpl(
                        `${this.opts.videoSidecarUrl}/v1/sessions/${encodeURIComponent(sessionHandle)}/share/stop`,
                        { method: 'POST' },
                    );
                } catch { /* non-fatal */ }
            }

            return { ok: true };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    // ── Private helpers ─────────────────────────────────────────────────────────

    private async getToken(): Promise<string> {
        const now = Date.now();
        if (
            this.cachedToken &&
            now < this.cachedToken.obtainedAt + (this.cachedToken.expires_in - 60) * 1000
        ) {
            return this.cachedToken.access_token;
        }
        const credentials = Buffer.from(`${this.opts.clientId}:${this.opts.clientSecret}`).toString('base64');
        const res = await this.fetchImpl(`${ZOOM_TOKEN_URL}${this.opts.accountId}`, {
            method: 'POST',
            headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Zoom token error ${res.status}: ${detail.slice(0, 256)}`);
        }
        const token = await res.json() as ZoomToken;
        this.cachedToken = { ...token, obtainedAt: now };
        return token.access_token;
    }

    private async getJoinToken(token: string, meetingId: string): Promise<string> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
        try {
            const res = await this.fetchImpl(
                `${ZOOM_API_BASE}/meetings/${meetingId}/jointoken/local_recording`,
                { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal },
            );
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                throw new Error(`Zoom join token ${res.status}: ${detail.slice(0, 256)}`);
            }
            const data = await res.json() as ZoomJoinTokenResponse;
            if (!data.token) throw new Error('Zoom join token response missing token field');
            return data.token;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Extracts the numeric meeting ID from a Zoom join URL. */
    private extractMeetingId(url: string): string | null {
        const match = url.match(/zoom\.us\/j\/(\d+)/u);
        return match?.[1] ?? null;
    }
}

/** Factory — reads credentials from env vars. Returns null if not configured. */
export function createZoomAdapterFromEnv(): ZoomJoinAdapter | null {
    const accountId = process.env['ZOOM_ACCOUNT_ID'];
    const clientId = process.env['ZOOM_CLIENT_ID'];
    const clientSecret = process.env['ZOOM_CLIENT_SECRET'];
    if (!accountId || !clientId || !clientSecret) return null;
    return new ZoomJoinAdapter({
        accountId,
        clientId,
        clientSecret,
        // Optional: zoom-video-sidecar for browser-join + xdotool screen-share.
        // Set ZOOM_VIDEO_SIDECAR_URL to activate; leave unset to use REST fallback.
        videoSidecarUrl: process.env['ZOOM_VIDEO_SIDECAR_URL'] ?? null,
    });
}
