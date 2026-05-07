import { randomUUID } from 'node:crypto';

export type ActionDecision = {
    taskId: string;
    actionType: string;
    riskLevel: 'medium' | 'high';
    payload: Record<string, unknown>;
};

export type ApprovalBatchRecord = {
    batchId: string;
    taskId: string;
    workspaceId: string;
    actions: ActionDecision[];
    totalCount: number;
    status: 'pending' | 'approved_all' | 'rejected_all' | 'partial';
    decision?: 'approve_all' | 'reject_all' | 'review_individually';
    decidedBy?: string;
    decidedAt?: string;
    reason?: string;
    createdAt: string;
    updatedAt: string;
};

export function shouldBatch(actions: ActionDecision[]): boolean {
    return actions.length > 3 && actions.every((action) => action.taskId === actions[0]?.taskId);
}

export class InMemoryApprovalBatcher {
    private readonly batches = new Map<string, ApprovalBatchRecord>();
    private readonly auditEvents: Array<{
        action: string;
        actorEmail: string;
        tenantId: string;
        workspaceId: string;
        metadata: Record<string, unknown>;
        occurredAt: string;
    }> = [];

    private writeAuditEvent(event: {
        action: string;
        actorEmail: string;
        tenantId: string;
        workspaceId: string;
        metadata: Record<string, unknown>;
    }): void {
        this.auditEvents.push({
            ...event,
            occurredAt: new Date().toISOString(),
        });
        if (this.auditEvents.length > 1000) {
            this.auditEvents.shift();
        }
    }

    async createApprovalBatch(actions: ActionDecision[], workspaceId: string): Promise<ApprovalBatchRecord> {
        if (actions.length === 0) {
            throw new Error('actions is required');
        }

        const now = new Date().toISOString();
        const record: ApprovalBatchRecord = {
            batchId: randomUUID(),
            taskId: actions[0]?.taskId ?? 'unknown',
            workspaceId,
            actions,
            totalCount: actions.length,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };

        this.batches.set(record.batchId, record);
        this.writeAuditEvent({
            action: 'approval_batch_created',
            actorEmail: 'agent@system',
            tenantId: 'unknown_tenant',
            workspaceId,
            metadata: {
                batchId: record.batchId,
                totalCount: record.totalCount,
            },
        });
        return record;
    }

    async decideBatch(
        batchId: string,
        decision: 'approve_all' | 'reject_all' | 'review_individually',
        reason?: string,
        actor?: string,
    ): Promise<ApprovalBatchRecord> {
        const existing = this.batches.get(batchId);
        if (!existing) {
            throw new Error('batch_not_found');
        }

        const status =
            decision === 'approve_all'
                ? 'approved_all'
                : decision === 'reject_all'
                    ? 'rejected_all'
                    : 'partial';

        const updated: ApprovalBatchRecord = {
            ...existing,
            status,
            decision,
            reason,
            decidedBy: actor,
            decidedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        this.batches.set(batchId, updated);
        return updated;
    }

    async getBatch(batchId: string): Promise<ApprovalBatchRecord | null> {
        return this.batches.get(batchId) ?? null;
    }
}
