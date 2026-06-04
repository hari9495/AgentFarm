/**
 * BrowserJoinAdapter — wraps the existing desktop-agent browser-based join.
 *
 * This is the universal fallback: every meeting platform has a web client,
 * so Playwright can join any of them. It is the slowest and most
 * resource-intensive path but requires no platform credentials.
 *
 * Used when:
 *   - No native SDK credentials are configured for the detected platform.
 *   - The platform is not Teams, Zoom, or Webex (e.g. Google Meet, Whereby).
 *   - All native adapters fail.
 */

import type { MeetingAdapterCapabilities, MeetingJoinAdapter, MeetingJoinResult, MeetingLeaveResult, ScreenShareResult } from './meeting-join-adapter.js';

/** Supported platforms extracted from a meeting URL (for inject hint). */
const PLATFORM_PATTERNS: Array<{ re: RegExp; platform: string }> = [
    { re: /teams\.microsoft\.com|teams\.live\.com/u, platform: 'teams' },
    { re: /zoom\.us/u,                               platform: 'zoom' },
    { re: /meet\.google\.com/u,                      platform: 'meet' },
    { re: /webex\.com/u,                             platform: 'webex' },
];

export type FetchLike = (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface BrowserJoinAdapterOptions {
    /** Base URL of the desktop-agent HTTP API, e.g. `http://desktop-agent:5003`. */
    desktopAgentUrl: string;
    /** Per-request timeout in ms (default: 15 s). */
    timeoutMs?: number;
    /** Override fetch (used by tests). */
    fetchImpl?: FetchLike;
}

export class BrowserJoinAdapter implements MeetingJoinAdapter {
    private readonly desktopAgentUrl: string;
    private readonly timeoutMs: number;
    private readonly fetchImpl: FetchLike;
    /** Stored after join() so startScreenShare() can reference the active session. */
    private lastMeetingUrl: string | undefined;
    private lastDisplayName: string | undefined;
    private lastPlatform: string | undefined;

    constructor(options: BrowserJoinAdapterOptions) {
        if (!options.desktopAgentUrl) throw new Error('BrowserJoinAdapter requires desktopAgentUrl');
        this.desktopAgentUrl = options.desktopAgentUrl.replace(/\/+$/u, '');
        this.timeoutMs = options.timeoutMs ?? 15_000;
        const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
        this.fetchImpl = options.fetchImpl ?? globalFetch ?? (() => { throw new Error('No fetch available'); });
    }

    async join(meetingUrl: string, displayName?: string): Promise<MeetingJoinResult> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const platform = this.detectPlatform(meetingUrl);
            const res = await this.fetchImpl(`${this.desktopAgentUrl}/v1/meeting/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: meetingUrl, displayName, platform }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                return { ok: false, joinMethod: 'browser', error: `desktop-agent ${res.status}: ${detail.slice(0, 200)}` };
            }
            const data = await res.json() as { pid?: number };
            // Store context so startScreenShare() can reference the active session.
            this.lastMeetingUrl = meetingUrl;
            this.lastDisplayName = displayName;
            this.lastPlatform = platform ?? undefined;
            return {
                ok: true,
                joinMethod: 'browser',
                sessionHandle: typeof data.pid === 'number' ? String(data.pid) : undefined,
            };
        } catch (error) {
            const msg = (error as Error).name === 'AbortError'
                ? `timeout after ${this.timeoutMs}ms`
                : (error as Error).message;
            return { ok: false, joinMethod: 'browser', error: msg };
        } finally {
            clearTimeout(timer);
        }
    }

    async leave(sessionHandle?: string): Promise<MeetingLeaveResult> {
        if (!sessionHandle) return { ok: true };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const res = await this.fetchImpl(`${this.desktopAgentUrl}/v1/meeting/leave`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pid: Number(sessionHandle) }),
                signal: controller.signal,
            });
            return { ok: res.ok, error: res.ok ? undefined : `desktop-agent ${res.status}` };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        } finally {
            clearTimeout(timer);
        }
    }

    getCapabilities(): MeetingAdapterCapabilities {
        return {
            chat: true,               // browser can type in chat
            screenShare: true,        // implemented via startScreenShare()
            attendeeList: true,       // visible on screen (via DOM)
            nativeAudioStream: false, // audio captured via PulseAudio sidecar, not SDK
        };
    }

    /**
     * Start screen share: kick off Xvfb→FFmpeg capture then trigger the
     * in-meeting Share button in the running Chromium via xdotool.
     *
     * The `desktopAgentUrl` parameter overrides the constructor value so this
     * method satisfies the MeetingJoinAdapter interface contract (where adapters
     * don't otherwise own the desktop-agent URL).
     */
    async startScreenShare(_sessionHandle: string, desktopAgentUrl: string): Promise<ScreenShareResult> {
        const base = desktopAgentUrl.replace(/\/+$/u, '');
        try {
            // 1. Start Xvfb → FFmpeg → HLS capture pipeline.
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

            // 2. Inject the screen-share keyboard shortcut into the running Chromium window.
            //    Chromium must be launched with --auto-select-desktop-capture-source=Entire screen
            //    (added to teams-join.mjs / zoom-join.mjs) so the picker is auto-approved.
            const injectRes = await this.fetchImpl(`${base}/v1/screen-share/inject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: this.lastPlatform ?? 'unknown' }),
            });
            if (!injectRes.ok) {
                // Non-fatal: FFmpeg capture is running even if the inject fails.
                const detail = await injectRes.text().catch(() => '');
                return {
                    ok: true,
                    streamUrl: captureData.streamUrl,
                    error: `FFmpeg started but browser inject failed (${injectRes.status}): ${detail.slice(0, 200)}`,
                };
            }

            return { ok: true, streamUrl: captureData.streamUrl };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    /** Stop the Xvfb→FFmpeg capture pipeline. */
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

    private detectPlatform(url: string): string | null {
        for (const { re, platform } of PLATFORM_PATTERNS) {
            if (re.test(url)) return platform;
        }
        return null;
    }
}
