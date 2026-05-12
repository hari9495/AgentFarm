import { AgentFarmError, AgentFarmAuthError, AgentFarmNotFoundError } from './errors.js';
import type {
    Agent,
    AgentListResult,
    AgentPerformanceResult,
    CostSummaryResult,
    NotificationListResult,
    AgentMessage,
    SendMessageOptions,
    AgentMessageStatus,
    AgentFarmClientOptions,
} from './types.js';

// ── AgentFarmClient ───────────────────────────────────────────────────────────

/**
 * AgentFarmClient — typed HTTP client for the AgentFarm API Gateway.
 *
 * @example
 * ```ts
 * const client = new AgentFarmClient({ baseUrl: 'http://localhost:3000', token: 'af_...' });
 * const { bots } = await client.agents.list({ tenantId: 'tenant-1' });
 * ```
 */
export class AgentFarmClient {
    private readonly baseUrl: string;
    private readonly token: string | null;
    private readonly timeoutMs: number;

    public readonly agents: AgentsNamespace;
    public readonly analytics: AnalyticsNamespace;
    public readonly notifications: NotificationsNamespace;
    public readonly messages: MessagesNamespace;

    constructor(options: AgentFarmClientOptions = {}) {
        this.baseUrl = (options.baseUrl ?? 'http://localhost:3000').replace(/\/+$/, '');
        this.token = options.token ?? null;
        this.timeoutMs = options.timeoutMs ?? 15_000;

        this.agents = new AgentsNamespace(this);
        this.analytics = new AnalyticsNamespace(this);
        this.notifications = new NotificationsNamespace(this);
        this.messages = new MessagesNamespace(this);
    }

    /** @internal Perform an authenticated fetch against the API gateway. */
    async _fetch(path: string, init: RequestInit = {}): Promise<Response> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(init.headers as Record<string, string> | undefined ?? {}),
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            ...init,
            headers,
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        return response;
    }

    /** @internal Parse response or throw a typed AgentFarmError. */
    async _parseOrThrow<T>(response: Response): Promise<T> {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (response.status === 401) throw new AgentFarmAuthError(String(body['message'] ?? 'Unauthorized.'));
        if (response.status === 404) throw new AgentFarmNotFoundError(String(body['message'] ?? 'Not found.'));
        if (!response.ok) {
            throw new AgentFarmError(
                String(body['message'] ?? `Request failed with HTTP ${response.status}`),
                response.status,
                String(body['error'] ?? null),
            );
        }
        return body as T;
    }
}

// ── Agents namespace ──────────────────────────────────────────────────────────

export class AgentsNamespace {
    constructor(private readonly client: AgentFarmClient) { }

    /** List bots for a workspace (optionally filtered). */
    async list(params: { workspaceId?: string } = {}): Promise<AgentListResult> {
        const qs = params.workspaceId ? `?workspaceId=${encodeURIComponent(params.workspaceId)}` : '';
        const res = await this.client._fetch(`/v1/agents${qs}`);
        return this.client._parseOrThrow<AgentListResult>(res);
    }

    /** Get a single bot by ID. */
    async get(botId: string): Promise<Agent> {
        const res = await this.client._fetch(`/v1/agents/${encodeURIComponent(botId)}`);
        const body = await this.client._parseOrThrow<{ bot: Agent }>(res);
        return body.bot;
    }

    /** Create a new bot in a workspace. */
    async create(workspaceId: string, role: string): Promise<Agent> {
        const res = await this.client._fetch('/v1/agents', {
            method: 'POST',
            body: JSON.stringify({ workspaceId, role }),
        });
        const body = await this.client._parseOrThrow<{ bot: Agent }>(res);
        return body.bot;
    }

    /** Pause a bot. */
    async pause(botId: string): Promise<void> {
        const res = await this.client._fetch(`/v1/agents/${encodeURIComponent(botId)}/pause`, { method: 'POST' });
        await this.client._parseOrThrow<unknown>(res);
    }

    /** Resume a paused bot. */
    async resume(botId: string): Promise<void> {
        const res = await this.client._fetch(`/v1/agents/${encodeURIComponent(botId)}/resume`, { method: 'POST' });
        await this.client._parseOrThrow<unknown>(res);
    }
}

// ── Analytics namespace ───────────────────────────────────────────────────────

export class AnalyticsNamespace {
    constructor(private readonly client: AgentFarmClient) { }

    /** Get agent performance metrics. */
    async agentPerformance(params: {
        tenantId: string;
        from?: string;
        to?: string;
        workspaceId?: string;
    }): Promise<AgentPerformanceResult> {
        const qs = new URLSearchParams({ tenantId: params.tenantId });
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        if (params.workspaceId) qs.set('workspaceId', params.workspaceId);
        const res = await this.client._fetch(`/v1/analytics/agent-performance?${qs.toString()}`);
        return this.client._parseOrThrow<AgentPerformanceResult>(res);
    }

    /** Get cost summary. */
    async costSummary(params: {
        tenantId: string;
        from?: string;
        to?: string;
    }): Promise<CostSummaryResult> {
        const qs = new URLSearchParams({ tenantId: params.tenantId });
        if (params.from) qs.set('from', params.from);
        if (params.to) qs.set('to', params.to);
        const res = await this.client._fetch(`/v1/analytics/cost-summary?${qs.toString()}`);
        return this.client._parseOrThrow<CostSummaryResult>(res);
    }
}

// ── Notifications namespace ───────────────────────────────────────────────────

export class NotificationsNamespace {
    constructor(private readonly client: AgentFarmClient) { }

    /** List notifications for a tenant. */
    async list(params: { tenantId?: string; limit?: number } = {}): Promise<NotificationListResult> {
        const qs = new URLSearchParams();
        if (params.tenantId) qs.set('tenantId', params.tenantId);
        if (params.limit !== undefined) qs.set('limit', String(params.limit));
        const q = qs.toString();
        const res = await this.client._fetch(`/v1/notifications${q ? `?${q}` : ''}`);
        return this.client._parseOrThrow<NotificationListResult>(res);
    }
}

// ── Messages namespace ────────────────────────────────────────────────────────

export class MessagesNamespace {
    constructor(private readonly client: AgentFarmClient) { }

    /** Send a message from `fromBotId` to another agent. */
    async send(fromBotId: string, options: SendMessageOptions): Promise<AgentMessage> {
        const res = await this.client._fetch(`/v1/agents/${encodeURIComponent(fromBotId)}/messages/send`, {
            method: 'POST',
            body: JSON.stringify(options),
        });
        const body = await this.client._parseOrThrow<{ message: AgentMessage }>(res);
        return body.message;
    }

    /** Get inbox messages for a bot. */
    async inbox(botId: string, params: { status?: AgentMessageStatus; limit?: number; threadId?: string } = {}): Promise<AgentMessage[]> {
        const qs = new URLSearchParams();
        if (params.status) qs.set('status', params.status);
        if (params.limit !== undefined) qs.set('limit', String(params.limit));
        if (params.threadId) qs.set('threadId', params.threadId);
        const q = qs.toString();
        const res = await this.client._fetch(`/v1/agents/${encodeURIComponent(botId)}/messages/inbox${q ? `?${q}` : ''}`);
        const body = await this.client._parseOrThrow<{ messages: AgentMessage[] }>(res);
        return body.messages;
    }

    /** Get sent messages for a bot. */
    async sent(botId: string, params: { limit?: number; threadId?: string } = {}): Promise<AgentMessage[]> {
        const qs = new URLSearchParams();
        if (params.limit !== undefined) qs.set('limit', String(params.limit));
        if (params.threadId) qs.set('threadId', params.threadId);
        const q = qs.toString();
        const res = await this.client._fetch(`/v1/agents/${encodeURIComponent(botId)}/messages/sent${q ? `?${q}` : ''}`);
        const body = await this.client._parseOrThrow<{ messages: AgentMessage[] }>(res);
        return body.messages;
    }

    /** Mark a message as read. */
    async markRead(botId: string, messageId: string): Promise<AgentMessage> {
        const res = await this.client._fetch(
            `/v1/agents/${encodeURIComponent(botId)}/messages/${encodeURIComponent(messageId)}/status`,
            { method: 'PATCH', body: JSON.stringify({ status: 'READ' }) },
        );
        const body = await this.client._parseOrThrow<{ message: AgentMessage }>(res);
        return body.message;
    }

    /** Reply to a message. */
    async reply(botId: string, messageId: string, body: string, messageType: SendMessageOptions['messageType'] = 'ANSWER'): Promise<AgentMessage> {
        const res = await this.client._fetch(
            `/v1/agents/${encodeURIComponent(botId)}/messages/${encodeURIComponent(messageId)}/reply`,
            { method: 'POST', body: JSON.stringify({ body, messageType }) },
        );
        const data = await this.client._parseOrThrow<{ message: AgentMessage }>(res);
        return data.message;
    }

    /** Get all messages in a thread. */
    async thread(botId: string, threadId: string, limit = 100): Promise<AgentMessage[]> {
        const res = await this.client._fetch(
            `/v1/agents/${encodeURIComponent(botId)}/messages/thread/${encodeURIComponent(threadId)}?limit=${limit}`,
        );
        const body = await this.client._parseOrThrow<{ messages: AgentMessage[] }>(res);
        return body.messages;
    }
}
