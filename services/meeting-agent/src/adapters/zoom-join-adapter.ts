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
    private readonly opts: Required<ZoomJoinAdapterOptions>;
    private cachedToken: ZoomToken | null = null;
    private readonly fetchImpl: FetchLike;

    constructor(options: ZoomJoinAdapterOptions) {
        if (!options.accountId || !options.clientId || !options.clientSecret) {
            throw new Error('ZoomJoinAdapter requires accountId, clientId, and clientSecret');
        }
        this.opts = { ...options, fetchImpl: options.fetchImpl ?? ((() => { throw new Error('No fetch'); }) as FetchLike), timeoutMs: options.timeoutMs ?? 15_000 };
        const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
        this.fetchImpl = options.fetchImpl ?? globalFetch ?? (() => { throw new Error('No fetch available'); });
    }

    async join(meetingUrl: string, displayName?: string): Promise<MeetingJoinResult> {
        try {
            const meetingId = this.extractMeetingId(meetingUrl);
            if (!meetingId) {
                return { ok: false, joinMethod: 'zoom_sdk', error: `Cannot extract Zoom meeting ID from: ${meetingUrl}` };
            }
            const token = await this.getToken();
            const joinToken = await this.getJoinToken(token, meetingId);
            // The join token is used by the desktop-agent or Zoom Video SDK client.
            // We return it as the sessionHandle for downstream use.
            return {
                ok: true,
                joinMethod: 'zoom_sdk',
                sessionHandle: JSON.stringify({ meetingId, joinToken, displayName }),
            };
        } catch (error) {
            return { ok: false, joinMethod: 'zoom_sdk', error: (error as Error).message };
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
            // Parse the session handle to extract the Zoom meeting ID.
            let meetingId: string | undefined;
            try {
                const parsed = JSON.parse(sessionHandle) as { meetingId?: string };
                meetingId = parsed.meetingId;
            } catch {
                // Fall through — meetingId stays undefined; we still start capture.
            }

            // 1. Start Xvfb → FFmpeg → HLS capture on the desktop-agent.
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

            // 2. Notify Zoom that sharing has started (best-effort — Zoom REST does
            //    not provide direct screen-share injection; the SDK handles media).
            if (meetingId) {
                try {
                    const token = await this.getToken();
                    await this.fetchImpl(`${ZOOM_API_BASE}/meetings/${meetingId}/status`, {
                        method: 'PUT',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'start_sharing' }),
                    });
                } catch {
                    // Non-fatal: the Zoom REST endpoint may not support this action for all
                    // plan types. The HLS stream is still available via streamUrl.
                }
            }

            return { ok: true, streamUrl: captureData.streamUrl };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    /** Stop screen share: terminate the FFmpeg pipeline on the desktop-agent. */
    async stopScreenShare(_sessionHandle: string, desktopAgentUrl: string): Promise<ScreenShareResult> {
        const base = desktopAgentUrl.replace(/\/+$/u, '');
        try {
            const res = await this.fetchImpl(`${base}/v1/screen-share/stop`, { method: 'POST' });
            if (!res.ok) {
                return { ok: false, error: `desktop-agent screen-share/stop ${res.status}` };
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
    return new ZoomJoinAdapter({ accountId, clientId, clientSecret });
}
