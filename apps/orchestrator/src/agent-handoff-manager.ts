import { randomUUID } from 'node:crypto';
import type { AgentHandoffRecord, AgentHandoffStatus } from '@agentfarm/shared-types';

type CreateHandoffInput = {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    fromBotId: string;
    toBotId: string;
    reason: string;
    correlationId: string;
    handoffContext?: Record<string, unknown>;
    contractVersion: string;
};

export class AgentHandoffManager {
    private readonly handoffs = new Map<string, AgentHandoffRecord>();

    createHandoff(input: CreateHandoffInput): AgentHandoffRecord {
        const timestamp = new Date().toISOString();
        const record: AgentHandoffRecord = {
            id: randomUUID(),
            contractVersion: input.contractVersion,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            taskId: input.taskId,
            fromBotId: input.fromBotId,
            toBotId: input.toBotId,
            reason: input.reason,
            status: 'requested',
            handoffContext: input.handoffContext,
            correlationId: input.correlationId,
            createdAt: timestamp,
            updatedAt: timestamp,
        };

        this.handoffs.set(record.id, record);
        return record;
    }

    listHandoffs(filter: {
        tenantId?: string;
        workspaceId?: string;
        status?: AgentHandoffStatus;
        limit?: number;
    }): AgentHandoffRecord[] {
        const limit = Math.max(1, Math.min(filter.limit ?? 50, 200));
        const items = Array.from(this.handoffs.values())
            .filter((item) => !filter.tenantId || item.tenantId === filter.tenantId)
            .filter((item) => !filter.workspaceId || item.workspaceId === filter.workspaceId)
            .filter((item) => !filter.status || item.status === filter.status)
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

        return items.slice(0, limit);
    }

    updateStatus(input: {
        handoffId: string;
        status: AgentHandoffStatus;
    }): AgentHandoffRecord | null {
        const existing = this.handoffs.get(input.handoffId);
        if (!existing) {
            return null;
        }

        const updated: AgentHandoffRecord = {
            ...existing,
            status: input.status,
            updatedAt: new Date().toISOString(),
        };
        this.handoffs.set(input.handoffId, updated);
        return updated;
    }
}
