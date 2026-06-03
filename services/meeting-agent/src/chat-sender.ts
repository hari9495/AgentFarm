/**
 * ChatSender — sends in-meeting chat messages via the platform's native API.
 *
 * Each implementation targets one platform. The `NullChatSender` is a safe
 * no-op used when no platform integration is configured.
 *
 * Usage from the server:
 *   POST /v1/sessions/:id/chat  { text: "Hello everyone" }
 *   → ctx.chatSender?.send(session.platform, session.chatHandle, text)
 */

import type { TeamsJoinAdapter } from './adapters/teams-join-adapter.js';
import type { ZoomJoinAdapter } from './adapters/zoom-join-adapter.js';

export interface ChatSendResult {
    ok: boolean;
    platform: string;
    error?: string;
}

/**
 * Unified chat sender interface.
 * `handle` is platform-specific:
 *   - Teams: Graph API thread ID (chatInfo.threadId from call record)
 *   - Zoom:  numeric meeting ID string
 */
export interface ChatSender {
    send(platform: string, handle: string, text: string): Promise<ChatSendResult>;
}

// ── Teams ──────────────────────────────────────────────────────────────────────

export class TeamsChatSender implements ChatSender {
    constructor(private readonly adapter: TeamsJoinAdapter) {}

    async send(_platform: string, threadId: string, text: string): Promise<ChatSendResult> {
        try {
            await this.adapter.sendChatMessage(threadId, text);
            return { ok: true, platform: 'teams' };
        } catch (error) {
            return { ok: false, platform: 'teams', error: (error as Error).message };
        }
    }
}

// ── Zoom ──────────────────────────────────────────────────────────────────────

export class ZoomChatSender implements ChatSender {
    constructor(private readonly adapter: ZoomJoinAdapter) {}

    async send(_platform: string, meetingId: string, text: string): Promise<ChatSendResult> {
        try {
            await this.adapter.sendChatMessage(meetingId, text);
            return { ok: true, platform: 'zoom' };
        } catch (error) {
            return { ok: false, platform: 'zoom', error: (error as Error).message };
        }
    }
}

// ── Null (no-op fallback) ─────────────────────────────────────────────────────

export class NullChatSender implements ChatSender {
    async send(platform: string, _handle: string, _text: string): Promise<ChatSendResult> {
        return {
            ok: false,
            platform,
            error: `chat not supported for platform "${platform}" — no SDK adapter configured`,
        };
    }
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * PlatformChatSender dispatches to the right implementation based on the
 * platform string.
 */
export class PlatformChatSender implements ChatSender {
    private readonly senders = new Map<string, ChatSender>();
    private readonly fallback = new NullChatSender();

    register(platform: string, sender: ChatSender): this {
        this.senders.set(platform, sender);
        return this;
    }

    async send(platform: string, handle: string, text: string): Promise<ChatSendResult> {
        const sender = this.senders.get(platform) ?? this.fallback;
        return sender.send(platform, handle, text);
    }
}
