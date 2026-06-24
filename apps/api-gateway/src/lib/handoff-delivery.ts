/**
 * Handoff delivery (H3) — pure builder.
 *
 * Recording a handoff (orchestrator) is bookkeeping; it does not make the target agent do
 * anything. Delivery turns a recorded handoff into real collaboration:
 *   1. an AgentMessage trail (from → to), so the handoff is durable + queryable, and
 *   2. a follow-on task enqueued for the target bot, so it actually picks up the work.
 *
 * This builder is pure — it constructs the message + queue entry from the handoff input.
 * The side effects (DB write, enqueue) are performed by the caller, which keeps the
 * shape/derivation logic unit-testable without a database or queue.
 */

export type HandoffDeliveryInput = {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    fromBotId: string;
    toBotId: string;
    reason: string;
    handoffContext?: Record<string, unknown>;
    correlationId?: string;
    now?: number;
};

export type HandoffMessage = {
    fromBotId: string;
    toBotId: string;
    messageType: 'HANDOFF_REQUEST';
    subject: string;
    body: string;
    status: 'PENDING';
};

export type HandoffTaskEntry = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string;
    priority: 'normal';
    payload: Record<string, unknown>;
    enqueuedAt: number;
};

export type HandoffDelivery = {
    message: HandoffMessage;
    task: HandoffTaskEntry;
};

/** Build the AgentMessage + follow-on task for a handoff. Deterministic given `now`. */
export const buildHandoffDelivery = (input: HandoffDeliveryInput): HandoffDelivery => {
    const now = input.now ?? Date.now();
    const correlationId = input.correlationId?.trim() || `handoff_${input.taskId}_${now}`;
    const reason = input.reason.trim();

    const contextSummary =
        input.handoffContext && Object.keys(input.handoffContext).length > 0
            ? `\n\nContext: ${JSON.stringify(input.handoffContext)}`
            : '';

    const message: HandoffMessage = {
        fromBotId: input.fromBotId,
        toBotId: input.toBotId,
        messageType: 'HANDOFF_REQUEST',
        subject: `Handoff: ${reason}`.slice(0, 200),
        body: `Task ${input.taskId} was handed off to you. Reason: ${reason}${contextSummary}`,
        status: 'PENDING',
    };

    const task: HandoffTaskEntry = {
        id: `handoff_task_${input.toBotId}_${now}`,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        botId: input.toBotId,
        priority: 'normal',
        payload: {
            _handoff: {
                from_bot_id: input.fromBotId,
                source_task_id: input.taskId,
                reason,
                correlation_id: correlationId,
            },
            ...(input.handoffContext ?? {}),
        },
        enqueuedAt: now,
    };

    return { message, task };
};
