// ── SDK public types ──────────────────────────────────────────────────────────

export type BotStatus = 'created' | 'provisioning' | 'active' | 'paused' | 'error' | 'deleted';

export interface Agent {
    id: string;
    workspaceId: string;
    role: string;
    status: BotStatus;
    createdAt: string;
    updatedAt: string;
}

export interface AgentListResult {
    bots: Agent[];
}

export interface AgentPerformanceResult {
    tenantId: string;
    from: string;
    to: string;
    taskCount: number;
    successCount: number;
    successRate: number | null;
    totalCostUsd: number;
    avgLatencyMs: number;
    weeklyTrend: Array<{
        weekStart: string;
        taskCount: number;
        successCount: number;
        totalCostUsd: number;
    }>;
}

export interface CostSummaryResult {
    tenantId: string;
    from: string;
    to: string;
    taskCount: number;
    totalCostUsd: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    successRate: number | null;
    byProvider: Array<{
        provider: string;
        taskCount: number;
        totalCostUsd: number;
        avgLatencyMs: number;
    }>;
    weeklyTrend: Array<{
        weekStart: string;
        taskCount: number;
        successCount: number;
        totalCostUsd: number;
    }>;
}

export interface NotificationLogEntry {
    id: string;
    tenantId: string;
    workspaceId: string | null;
    channel: string;
    eventTrigger: string;
    status: string;
    error: string | null;
    sentAt: string;
}

export interface NotificationListResult {
    notifications: NotificationLogEntry[];
}

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
}

export interface AgentFarmClientOptions {
    /** Base URL of the AgentFarm API Gateway. Default: http://localhost:3000 */
    baseUrl?: string;
    /** Bearer token for authentication. */
    token?: string;
    /** Timeout in ms for HTTP requests. Default: 15000 */
    timeoutMs?: number;
}
