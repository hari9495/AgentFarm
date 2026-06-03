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

import type { MeetingAdapterCapabilities, MeetingJoinAdapter, MeetingJoinResult, MeetingLeaveResult } from './meeting-join-adapter.js';

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
            const res = await this.fetchImpl(`${this.desktopAgentUrl}/v1/meeting/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: meetingUrl, displayName }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => '');
                return { ok: false, joinMethod: 'browser', error: `desktop-agent ${res.status}: ${detail.slice(0, 200)}` };
            }
            const data = await res.json() as { pid?: number };
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
            chat: true,           // browser can type in chat
            screenShare: true,    // browser can share a tab
            attendeeList: true,   // visible on screen (via DOM)
            nativeAudioStream: false, // audio captured via PulseAudio sidecar, not SDK
        };
    }
}
