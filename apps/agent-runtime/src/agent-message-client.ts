/**
 * AgentMessageClient — typed HTTP client for sending and receiving messages
 * between agents via the AgentFarm API Gateway.
 *
 * Reads configuration from:
 *   API_GATEWAY_URL                    — base URL of the API gateway (default: http://localhost:3000)
 *   AGENTFARM_RUNTIME_TASK_SHARED_TOKEN — bearer token for runtime-to-gateway calls
 */

const resolveBase = (): string =>
    (process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '');

const resolveToken = (): string | null =>
    process.env['AGENTFARM_RUNTIME_TASK_SHARED_TOKEN'] ?? null;

export type AgentMessageType =
    | 'QUESTION'
    | 'ANSWER'
    | 'RESULT'
    | 'STATUS_UPDATE'
    | 'HANDOFF_REQUEST'
    | 'HANDOFF_ACCEPT'
    | 'HANDOFF_REJECT'
    | 'BROADCAST';

export type AgentMessageStatus = 'PENDING' | 'DELIVERED' | 'READ' | 'REPLIED' | 'EXPIRED';

export interface AgentMessage {
    id: string;
    fromBotId: string;
    toBotId: string;
    threadId: string | null;
    messageType: AgentMessageType;
    subject: string | null;
    body: string;
    metadata: unknown;
    status: AgentMessageStatus;
    readAt: string | null;
    repliedAt: string | null;
    replyToId: string | null;
    createdAt: string;
    expiresAt: string | null;
}

export interface SendMessageOptions {
    toBotId: string;
    messageType: AgentMessageType;
    body: string;
    subject?: string;
    threadId?: string;
    metadata?: Record<string, unknown>;
    expiresAt?: string;
}

export interface GetMessagesOptions {
    status?: AgentMessageStatus;
    limit?: number;
    threadId?: string;
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function gatewayFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = resolveToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined ?? {}),
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${resolveBase()}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(15_000),
    });

    return response;
}

// ── sendMessage ───────────────────────────────────────────────────────────────

/**
 * Send a message from `fromBotId` to another agent.
 */
export async function sendMessage(
    fromBotId: string,
    options: SendMessageOptions,
): Promise<AgentMessage> {
    const response = await gatewayFetch(`/v1/agents/${fromBotId}/messages/send`, {
        method: 'POST',
        body: JSON.stringify(options),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`[agent-message-client] sendMessage failed with HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as { message: AgentMessage };
    return data.message;
}

// ── getInbox ──────────────────────────────────────────────────────────────────

/**
 * Get messages received by `botId`.
 */
export async function getInbox(
    botId: string,
    options: GetMessagesOptions = {},
): Promise<AgentMessage[]> {
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.threadId) params.set('threadId', options.threadId);

    const qs = params.toString();
    const response = await gatewayFetch(
        `/v1/agents/${botId}/messages/inbox${qs ? `?${qs}` : ''}`,
    );

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`[agent-message-client] getInbox failed with HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as { messages: AgentMessage[] };
    return data.messages;
}

// ── getSent ───────────────────────────────────────────────────────────────────

/**
 * Get messages sent by `botId`.
 */
export async function getSent(
    botId: string,
    options: GetMessagesOptions = {},
): Promise<AgentMessage[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.threadId) params.set('threadId', options.threadId);

    const qs = params.toString();
    const response = await gatewayFetch(
        `/v1/agents/${botId}/messages/sent${qs ? `?${qs}` : ''}`,
    );

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`[agent-message-client] getSent failed with HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as { messages: AgentMessage[] };
    return data.messages;
}

// ── markRead ──────────────────────────────────────────────────────────────────

/**
 * Mark a received message as READ.
 */
export async function markRead(botId: string, messageId: string): Promise<AgentMessage> {
    const response = await gatewayFetch(
        `/v1/agents/${botId}/messages/${messageId}/status`,
        {
            method: 'PATCH',
            body: JSON.stringify({ status: 'READ' }),
        },
    );

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`[agent-message-client] markRead failed with HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as { message: AgentMessage };
    return data.message;
}

// ── replyToMessage ────────────────────────────────────────────────────────────

/**
 * Reply to a message from `botId`.
 */
export async function replyToMessage(
    botId: string,
    messageId: string,
    body: string,
    messageType: AgentMessageType = 'ANSWER',
    metadata?: Record<string, unknown>,
): Promise<AgentMessage> {
    const response = await gatewayFetch(
        `/v1/agents/${botId}/messages/${messageId}/reply`,
        {
            method: 'POST',
            body: JSON.stringify({ body, messageType, metadata }),
        },
    );

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`[agent-message-client] replyToMessage failed with HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as { message: AgentMessage };
    return data.message;
}

// ── getThread ─────────────────────────────────────────────────────────────────

/**
 * Get all messages in a thread that `botId` is party to.
 */
export async function getThread(
    botId: string,
    threadId: string,
    limit = 100,
): Promise<AgentMessage[]> {
    const response = await gatewayFetch(
        `/v1/agents/${botId}/messages/thread/${threadId}?limit=${limit}`,
    );

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`[agent-message-client] getThread failed with HTTP ${response.status}: ${errText}`);
    }

    const data = (await response.json()) as { messages: AgentMessage[] };
    return data.messages;
}
