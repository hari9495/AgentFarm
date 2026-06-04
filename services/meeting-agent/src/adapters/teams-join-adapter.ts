/**
 * TeamsJoinAdapter — joins Microsoft Teams meetings as a bot via the
 * Microsoft Graph API Real-time Media Platform.
 *
 * Prerequisites (one-time Azure AD setup):
 *   1. Register an Azure AD app with a client secret.
 *   2. Grant application permissions:
 *        Calls.JoinGroupCall.All
 *        Calls.JoinGroupCallAsGuest.All
 *        OnlineMeetings.ReadWrite.All
 *   3. Set env vars: TEAMS_TENANT_ID, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET
 *
 * Join flow:
 *   GET token (client_credentials) → POST /communications/calls → call ID
 *
 * Chat:
 *   GET /communications/calls/{id} → chatInfo.threadId
 *   POST /chats/{threadId}/messages
 *
 * Docs: https://learn.microsoft.com/en-us/graph/api/application-post-calls
 */

import type { MeetingAdapterCapabilities, MeetingJoinAdapter, MeetingJoinResult, MeetingLeaveResult, ScreenShareResult } from './meeting-join-adapter.js';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_ENDPOINT_TEMPLATE = 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token';

export type FetchLike = (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | URLSearchParams;
    signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface TeamsJoinAdapterOptions {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    /** Bot display name shown in the meeting (default: 'AgentFarm Bot'). */
    botDisplayName?: string;
    /** Bot's Microsoft app ID (same as clientId for simple registrations). */
    botId?: string;
    /** Per-request timeout in ms (default: 20 s). */
    timeoutMs?: number;
    /** Override fetch (used by tests). */
    fetchImpl?: FetchLike;
}

interface GraphToken {
    access_token: string;
    expires_in: number;
    obtainedAt: number;
}

interface GraphCallResponse {
    id?: string;
    chatInfo?: { threadId?: string };
}

interface ResolvedTeamsOptions {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    botDisplayName: string;
    botId: string;
    timeoutMs: number;
}

export class TeamsJoinAdapter implements MeetingJoinAdapter {
    private readonly opts: ResolvedTeamsOptions;
    private cachedToken: GraphToken | null = null;
    private readonly fetchImpl: FetchLike;

    constructor(options: TeamsJoinAdapterOptions) {
        if (!options.tenantId || !options.clientId || !options.clientSecret) {
            throw new Error('TeamsJoinAdapter requires tenantId, clientId, and clientSecret');
        }
        this.opts = {
            tenantId: options.tenantId,
            clientId: options.clientId,
            clientSecret: options.clientSecret,
            botDisplayName: options.botDisplayName ?? 'AgentFarm Bot',
            botId: options.botId ?? options.clientId,
            timeoutMs: options.timeoutMs ?? 20_000,
        };
        const globalFetch = (globalThis as { fetch?: FetchLike }).fetch;
        this.fetchImpl = options.fetchImpl ?? globalFetch ?? (() => { throw new Error('No fetch available'); });
    }

    // ── Public API ──────────────────────────────────────────────────────────────

    async join(meetingUrl: string, displayName?: string): Promise<MeetingJoinResult> {
        try {
            const token = await this.getToken();
            const callId = await this.createCall(token, meetingUrl, displayName ?? this.opts.botDisplayName);
            return { ok: true, joinMethod: 'teams_sdk', sessionHandle: callId };
        } catch (error) {
            return { ok: false, joinMethod: 'teams_sdk', error: (error as Error).message };
        }
    }

    async leave(sessionHandle?: string): Promise<MeetingLeaveResult> {
        if (!sessionHandle) return { ok: true };
        try {
            const token = await this.getToken();
            const res = await this.graphRequest(
                token,
                'DELETE',
                `/communications/calls/${sessionHandle}`,
            );
            return { ok: res.ok, error: res.ok ? undefined : `Graph DELETE ${res.status}` };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    /**
     * Send a message to the meeting's chat thread.
     * `threadId` can be obtained from `getThreadId(callId)`.
     */
    async sendChatMessage(threadId: string, text: string): Promise<void> {
        const token = await this.getToken();
        const res = await this.graphRequest(token, 'POST', `/chats/${encodeURIComponent(threadId)}/messages`, {
            body: { content: text },
        });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Teams chat ${res.status}: ${detail.slice(0, 256)}`);
        }
    }

    /**
     * Retrieves the chat threadId for an active call.
     * Used to send chat messages after joining.
     */
    async getThreadId(callId: string): Promise<string | null> {
        try {
            const token = await this.getToken();
            const res = await this.graphRequest(token, 'GET', `/communications/calls/${callId}`);
            if (!res.ok) return null;
            const data = await res.json() as GraphCallResponse;
            return data.chatInfo?.threadId ?? null;
        } catch {
            return null;
        }
    }

    getCapabilities(): MeetingAdapterCapabilities {
        return {
            chat: true,
            screenShare: true,       // implemented via startScreenShare()
            attendeeList: true,      // GET /communications/calls/{id}/participants
            nativeAudioStream: true, // real-time audio via Graph Calling API
        };
    }

    /**
     * Start screen share: kick off Xvfb→FFmpeg capture on the desktop-agent,
     * then PATCH the call to add the `video` modality so Teams streams it.
     */
    async startScreenShare(sessionHandle: string, desktopAgentUrl: string): Promise<ScreenShareResult> {
        const base = desktopAgentUrl.replace(/\/+$/u, '');
        try {
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

            // 2. PATCH the active Teams call to add the video modality.
            const token = await this.getToken();
            const patchRes = await this.graphRequest(
                token, 'PATCH', `/communications/calls/${sessionHandle}`,
                { body: { requestedModalities: ['audio', 'video'] } },
            );
            if (!patchRes.ok) {
                const detail = await patchRes.text().catch(() => '');
                return { ok: false, error: `Graph PATCH requestedModalities ${patchRes.status}: ${detail.slice(0, 256)}` };
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
        const url = TOKEN_ENDPOINT_TEMPLATE.replace('{tenantId}', this.opts.tenantId);
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.opts.clientId,
            client_secret: this.opts.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
        });
        const res = await this.fetchImpl(url, { method: 'POST', body });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Teams token error ${res.status}: ${detail.slice(0, 256)}`);
        }
        const token = await res.json() as GraphToken;
        this.cachedToken = { ...token, obtainedAt: now };
        return token.access_token;
    }

    private async createCall(token: string, meetingUrl: string, displayName: string): Promise<string> {
        const payload = {
            '@odata.type': '#microsoft.graph.call',
            callbackUri: `https://bot.agentfarm.internal/api/calls`, // must be registered in Azure
            tenantId: this.opts.tenantId,
            meetingInfo: {
                '@odata.type': '#microsoft.graph.joinMeetingIdMeetingInfo',
                joinWebUrl: meetingUrl,
            },
            mediaConfig: {
                '@odata.type': '#microsoft.graph.serviceHostedMediaConfig',
            },
            requestedModalities: ['audio'],
            source: {
                '@odata.type': '#microsoft.graph.participantInfo',
                identity: {
                    '@odata.type': '#microsoft.graph.identitySet',
                    application: {
                        '@odata.type': '#microsoft.graph.identity',
                        displayName,
                        id: this.opts.botId,
                    },
                },
            },
        };

        const res = await this.graphRequest(token, 'POST', '/communications/calls', { body: payload });
        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Graph POST /communications/calls ${res.status}: ${detail.slice(0, 256)}`);
        }
        const data = await res.json() as GraphCallResponse;
        if (!data.id) throw new Error('Teams call created but no call ID returned');
        return data.id;
    }

    private async graphRequest(
        token: string,
        method: string,
        path: string,
        opts: { body?: unknown } = {},
    ): Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
        try {
            const headers: Record<string, string> = {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            const res = await this.fetchImpl(`${GRAPH_BASE}${path}`, {
                method,
                headers,
                body: opts.body ? JSON.stringify(opts.body) : undefined,
                signal: controller.signal,
            });
            return res;
        } finally {
            clearTimeout(timer);
        }
    }
}

/** Factory — reads credentials from env vars. Returns null if not configured. */
export function createTeamsAdapterFromEnv(): TeamsJoinAdapter | null {
    const tenantId = process.env['TEAMS_TENANT_ID'];
    const clientId = process.env['TEAMS_CLIENT_ID'];
    const clientSecret = process.env['TEAMS_CLIENT_SECRET'];
    if (!tenantId || !clientId || !clientSecret) return null;
    return new TeamsJoinAdapter({
        tenantId,
        clientId,
        clientSecret,
        botDisplayName: process.env['TEAMS_BOT_DISPLAY_NAME'] ?? 'AgentFarm Bot',
    });
}
