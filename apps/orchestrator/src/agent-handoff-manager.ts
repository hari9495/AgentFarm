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
    escalateOnTimeoutMs?: number;
    contractVersion: string;
};

export type AgentHandoffManagerState = {
    handoffs: AgentHandoffRecord[];
};

export class AgentHandoffManager {
    private readonly handoffs = new Map<string, AgentHandoffRecord>();

    constructor(initialState?: AgentHandoffManagerState) {
        if (initialState) {
            for (const record of initialState.handoffs) {
                this.handoffs.set(record.id, record);
            }
        }
    }

    exportState(): AgentHandoffManagerState {
        return {
            handoffs: Array.from(this.handoffs.values()),
        };
    }

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
            status: 'pending',
            handoffContext: input.handoffContext,
            escalateOnTimeoutMs: input.escalateOnTimeoutMs ?? 3_600_000,
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

    checkAndTimeoutHandoffs(asOf: Date = new Date()): AgentHandoffRecord[] {
        const timedOut: AgentHandoffRecord[] = [];

        for (const handoff of this.handoffs.values()) {
            if (handoff.status !== 'pending' || typeof handoff.escalateOnTimeoutMs !== 'number') {
                continue;
            }

            const expiresAt = Date.parse(handoff.createdAt) + handoff.escalateOnTimeoutMs;
            if (expiresAt > asOf.getTime()) {
                continue;
            }

            const updated: AgentHandoffRecord = {
                ...handoff,
                status: 'timed_out',
                updatedAt: asOf.toISOString(),
            };
            this.handoffs.set(handoff.id, updated);
            timedOut.push(updated);
        }

        return timedOut;
    }
}
