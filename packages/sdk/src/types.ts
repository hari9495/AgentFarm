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

// ── Task Queue types ───────────────────────────────────────────────────────────

export type TaskQueueEntryStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export interface TaskQueueEntry {
    id: string;
    agentId: string;
    workspaceId?: string;
    payload: unknown;
    status: TaskQueueEntryStatus;
    createdAt: string;
    updatedAt: string;
    startedAt?: string;
    completedAt?: string;
    outcome?: unknown;
    error?: string;
}

export interface TaskSubmitOptions {
    agentId: string;
    workspaceId?: string;
    payload: Record<string, unknown>;
}

export interface TaskListFilters {
    agentId?: string;
    workspaceId?: string;
    status?: TaskQueueEntryStatus;
}

export interface TaskListResult {
    entries: TaskQueueEntry[];
}

export interface TaskQueueStatusResult {
    pending: number;
    running: number;
    done: number;
    failed: number;
}

// ── Approvals types ────────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired';

export interface ApprovalEntry {
    id: string;
    workspaceId?: string;
    agentId?: string;
    actionSummary: string;
    status: ApprovalStatus;
    decidedBy?: string;
    decidedAt?: string;
    comment?: string;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
    evidence?: unknown;
    packet?: unknown;
}

export interface ApprovalIntakeOptions {
    agentId: string;
    workspaceId?: string;
    actionSummary: string;
    evidence?: Record<string, unknown>;
}

export interface ApprovalDecisionOptions {
    comment?: string;
}

export interface ApprovalListFilters {
    workspaceId?: string;
    agentId?: string;
    status?: ApprovalStatus;
}

export interface ApprovalListResult {
    approvals: ApprovalEntry[];
}

export interface BulkApproveResult {
    approved: string[];
    failed: string[];
}
