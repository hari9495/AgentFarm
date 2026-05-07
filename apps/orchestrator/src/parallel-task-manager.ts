/**
 * Feature #8 — Parallel Task Slots
 * Frozen 2026-05-07
 *
 * Allows the orchestrator to run N concurrent tasks per workspace.
 * While one slot is blocked waiting for CI/approval/question, another slot
 * picks up the next queued task.
 *
 * Plan tier gate:
 *   free       → maxConcurrentTasks: 1
 *   pro        → maxConcurrentTasks: 3
 *   enterprise → maxConcurrentTasks: 10
 *
 * The ParallelTaskManager is a stateful coordinator — it does not replace
 * the TaskScheduler but sits above it, managing which tasks are in which slots.
 *
 * Integration point: the orchestrator's main loop calls
 *   parallelManager.tick(pendingTasks) on each wake cycle.
 */

import { randomUUID } from 'node:crypto';
import type {
    TaskSlot,
    TaskSlotStatus,
    ParallelConfig,
    SlotUnblockCondition,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

export type { TaskSlot, TaskSlotStatus, ParallelConfig, SlotUnblockCondition };

// ── Plan defaults ─────────────────────────────────────────────────────────────

export const PLAN_PARALLEL_CONFIGS: Record<string, ParallelConfig> = {
    free: { maxConcurrentTasks: 1, allowedWaitReasons: ['waiting_ci', 'waiting_approval', 'waiting_answer'] },
    pro: { maxConcurrentTasks: 3, allowedWaitReasons: ['waiting_ci', 'waiting_approval', 'waiting_answer'] },
    enterprise: { maxConcurrentTasks: 10, allowedWaitReasons: ['waiting_ci', 'waiting_approval', 'waiting_answer'] },
};

export function getParallelConfig(planTier: string): ParallelConfig {
    return PLAN_PARALLEL_CONFIGS[planTier] ?? PLAN_PARALLEL_CONFIGS['free']!;
}

// ── Slot factory ──────────────────────────────────────────────────────────────

function makeSlot(workspaceId: string, tenantId: string): TaskSlot {
    const now = new Date().toISOString();
    return {
        slotId: randomUUID(),
        contractVersion: CONTRACT_VERSIONS.TASK_SLOT,
        workspaceId,
        tenantId,
        status: 'idle',
        createdAt: now,
        updatedAt: now,
    };
}

// ── Parallel Task Manager ─────────────────────────────────────────────────────

export interface PendingTask {
    taskId: string;
    priority?: number;
}

export type TaskExecutorFn = (taskId: string, slotId: string) => Promise<void>;

export class ParallelTaskManager {
    private readonly slots: TaskSlot[];
    private readonly workspaceId: string;
    private readonly tenantId: string;
    private readonly config: ParallelConfig;

    constructor(
        workspaceId: string,
        tenantId: string,
        config: ParallelConfig,
        initialSlots?: TaskSlot[],
    ) {
        this.workspaceId = workspaceId;
        this.tenantId = tenantId;
        this.config = config;
        if (initialSlots && initialSlots.length > 0) {
            this.slots = initialSlots.slice(0, config.maxConcurrentTasks).map((slot) => ({ ...slot }));
            while (this.slots.length < config.maxConcurrentTasks) {
                this.slots.push(makeSlot(workspaceId, tenantId));
            }
        } else {
            this.slots = Array.from({ length: config.maxConcurrentTasks }, () =>
                makeSlot(workspaceId, tenantId),
            );
        }
    }

    // ── Slot accessors ──────────────────────────────────────────────────────────

    getSlots(): ReadonlyArray<TaskSlot> {
        return this.slots;
    }

    getActiveTaskIds(): string[] {
        return this.slots
            .filter((s) => s.currentTaskId && s.status !== 'idle')
            .map((s) => s.currentTaskId!);
    }

    countActiveSlots(): number {
        return this.slots.filter((s) => s.status === 'active').length;
    }

    countIdleSlots(): number {
        return this.slots.filter((s) => s.status === 'idle').length;
    }

    // ── Slot state transitions ──────────────────────────────────────────────────

    private updateSlot(slotId: string, patch: Partial<TaskSlot>): void {
        const slot = this.slots.find((s) => s.slotId === slotId);
        if (slot) {
            Object.assign(slot, patch, { updatedAt: new Date().toISOString() });
        }
    }

    /**
     * Park a slot that is blocked waiting for an external event.
     * The slot transitions from 'active' to 'waiting_*'.
     */
    parkSlot(
        slotId: string,
        reason: 'waiting_ci' | 'waiting_approval' | 'waiting_answer',
        unblockCondition: SlotUnblockCondition,
    ): void {
        this.updateSlot(slotId, { status: reason, blockedReason: reason, unblockCondition });
    }

    /**
     * Unblock a parked slot once its condition is satisfied.
     */
    unblockSlot(slotId: string): void {
        this.updateSlot(slotId, {
            status: 'active',
            blockedReason: undefined,
            unblockCondition: undefined,
        });
    }

    /**
     * Release a slot back to idle when its task completes or fails.
     */
    releaseSlot(slotId: string): void {
        this.updateSlot(slotId, {
            status: 'idle',
            currentTaskId: undefined,
            blockedReason: undefined,
            unblockCondition: undefined,
        });
    }

    // ── Main orchestrator integration ───────────────────────────────────────────

    /**
     * Called on each wake cycle.
     * Assigns pending tasks to idle slots up to maxConcurrentTasks.
     * Returns the list of (taskId, slotId) assignments started this cycle.
     */
    async tick(
        pendingTasks: PendingTask[],
        executor: TaskExecutorFn,
    ): Promise<Array<{ taskId: string; slotId: string }>> {
        const started: Array<{ taskId: string; slotId: string }> = [];
        const queue = [...pendingTasks].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        for (const slot of this.slots) {
            if (slot.status !== 'idle') continue;
            const next = queue.shift();
            if (!next) break;

            this.updateSlot(slot.slotId, { status: 'active', currentTaskId: next.taskId });
            started.push({ taskId: next.taskId, slotId: slot.slotId });

            // Fire and forget — the executor manages its own lifecycle.
            // Slot is released by the caller via releaseSlot() when complete.
            executor(next.taskId, slot.slotId).catch(() => {
                this.releaseSlot(slot.slotId);
            });
        }

        return started;
    }

    /**
     * Snapshot state for persistence (analogous to AgentHandoffManagerState).
     */
    snapshot(): ReadonlyArray<TaskSlot> {
        return this.slots.map((s) => ({ ...s }));
    }
}
