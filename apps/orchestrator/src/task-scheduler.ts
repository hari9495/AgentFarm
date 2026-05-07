/**
 * Epic B1: Heartbeat Wake Model with Coalescing
 * Stabilizes execution loops by standardizing wake triggers and deduplication behavior.
 * 
 * Wake sources: timer, assignment, on_demand, automation
 * Coalescing: duplicate wakeups within dedupeKey are collapsed into single run
 */

import type { RunRecord, WakeSource, RunStatus } from '@agentfarm/shared-types';
import { randomUUID } from 'crypto';
import {
    type TaskSlot,
    type SlotUnblockCondition,
} from '@agentfarm/shared-types';
import {
    ParallelTaskManager,
    getParallelConfig,
    type PendingTask,
    type TaskExecutorFn,
} from './parallel-task-manager.js';

export interface TaskSchedulerState {
    runs: RunRecord[];
    parallelSlotsByWorkspace?: Record<string, TaskSlot[]>;
}

export interface DispatchPendingTasksInput {
    workspaceId: string;
    tenantId: string;
    planTier: string;
    pendingTasks: PendingTask[];
    executor: TaskExecutorFn;
}

export interface WakeRequest {
    botId: string;
    tenantId: string;
    workspaceId: string;
    wakeSource: WakeSource;
    dedupeKey?: string;
    correlationId: string;
    timestamp: string;
}

export interface RunScheduleResult {
    runId: string;
    isNewRun: boolean;
    coalesced: boolean;
    previousRunId?: string;
    message: string;
}

/**
 * In-memory store for tracking active runs (would be backed by database in production)
 * Key: `${botId}:${dedupeKey}` for coalescing lookups
 */
class RunCoalescingStore {
    private runsById = new Map<string, RunRecord>();
    private activeRunIdByCoalesceKey = new Map<string, string>();

    recordRun(run: RunRecord): void {
        this.runsById.set(run.id, run);
        if (run.dedupeKey) {
            this.activeRunIdByCoalesceKey.set(this.getCoalesceKey(run.botId, run.dedupeKey), run.id);
        }
    }

    findActiveRunByDedupeKey(botId: string, dedupeKey?: string): RunRecord | undefined {
        if (!dedupeKey) return undefined;
        const runId = this.activeRunIdByCoalesceKey.get(this.getCoalesceKey(botId, dedupeKey));
        if (!runId) return undefined;
        const run = this.runsById.get(runId);
        // Only return if still active
        if (run && (run.status === 'queued' || run.status === 'active')) {
            return run;
        }
        return undefined;
    }

    markRunComplete(runId: string, status: RunStatus): void {
        const run = this.runsById.get(runId);
        if (run) {
            run.status = status;
            run.completedAt = new Date().toISOString();
        }
    }

    listRuns(): RunRecord[] {
        return Array.from(this.runsById.values()).map((run) => ({ ...run }));
    }

    loadRuns(runs: RunRecord[]): void {
        this.runsById.clear();
        this.activeRunIdByCoalesceKey.clear();
        for (const run of runs) {
            this.recordRun({ ...run });
        }
    }

    private getCoalesceKey(botId: string, dedupeKey?: string): string {
        return dedupeKey ? `${botId}:${dedupeKey}` : `${botId}:no-dedupe`;
    }
}

export class TaskScheduler {
    private store = new RunCoalescingStore();
    private readonly parallelManagers = new Map<string, ParallelTaskManager>();

    constructor(state?: TaskSchedulerState) {
        if (state) {
            this.store.loadRuns(state.runs);
            if (state.parallelSlotsByWorkspace) {
                for (const [workspaceId, slots] of Object.entries(state.parallelSlotsByWorkspace)) {
                    const tenantId = slots[0]?.tenantId ?? 'unknown_tenant';
                    const manager = new ParallelTaskManager(
                        workspaceId,
                        tenantId,
                        { maxConcurrentTasks: slots.length || 1, allowedWaitReasons: ['waiting_ci', 'waiting_approval', 'waiting_answer'] },
                        slots,
                    );
                    this.parallelManagers.set(workspaceId, manager);
                }
            }
        }
    }

    private getOrCreateParallelManager(workspaceId: string, tenantId: string, planTier: string): ParallelTaskManager {
        const existing = this.parallelManagers.get(workspaceId);
        if (existing) {
            return existing;
        }
        const manager = new ParallelTaskManager(workspaceId, tenantId, getParallelConfig(planTier));
        this.parallelManagers.set(workspaceId, manager);
        return manager;
    }

    async dispatchPendingTasks(input: DispatchPendingTasksInput): Promise<Array<{ taskId: string; slotId: string }>> {
        const manager = this.getOrCreateParallelManager(input.workspaceId, input.tenantId, input.planTier);
        return manager.tick(input.pendingTasks, input.executor);
    }

    parkTaskSlot(
        workspaceId: string,
        slotId: string,
        reason: 'waiting_ci' | 'waiting_approval' | 'waiting_answer',
        unblockCondition: SlotUnblockCondition,
    ): void {
        const manager = this.parallelManagers.get(workspaceId);
        manager?.parkSlot(slotId, reason, unblockCondition);
    }

    unblockTaskSlot(workspaceId: string, slotId: string): void {
        const manager = this.parallelManagers.get(workspaceId);
        manager?.unblockSlot(slotId);
    }

    releaseTaskSlot(workspaceId: string, slotId: string): void {
        const manager = this.parallelManagers.get(workspaceId);
        manager?.releaseSlot(slotId);
    }

    listTaskSlots(workspaceId: string): ReadonlyArray<TaskSlot> {
        return this.parallelManagers.get(workspaceId)?.getSlots() ?? [];
    }

    /**
     * Schedule a new wake request, coalescing if duplicate detected
     */
    async scheduleWake(request: WakeRequest): Promise<RunScheduleResult> {
        // Check for existing active run with same dedupeKey
        const existingRun = this.store.findActiveRunByDedupeKey(
            request.botId,
            request.dedupeKey
        );
        if (existingRun) {
            // Duplicate wakeup within coalescing window
            return {
                runId: existingRun.id,
                isNewRun: false,
                coalesced: true,
                message: `Coalesced wakeup into existing run ${existingRun.id}`,
            };
        }

        // Create new run
        const newRun: RunRecord = {
            id: randomUUID(),
            botId: request.botId,
            tenantId: request.tenantId,
            workspaceId: request.workspaceId,
            wakeSource: request.wakeSource,
            status: 'queued',
            dedupeKey: request.dedupeKey,
            activeTaskCount: 0,
            startedAt: request.timestamp,
            lastHeartbeatAt: request.timestamp,
            correlationId: request.correlationId,
        };

        this.store.recordRun(newRun);

        return {
            runId: newRun.id,
            isNewRun: true,
            coalesced: false,
            message: `Created new run ${newRun.id} from wake source: ${request.wakeSource}`,
        };
    }

    listRuns(): RunRecord[] {
        return this.store.listRuns();
    }

    /**
     * Complete a run with terminal status
     */
    completeRun(runId: string, finalStatus: RunStatus): void {
        if (finalStatus !== 'completed' && finalStatus !== 'cancelled' && finalStatus !== 'failed' && finalStatus !== 'timeout') {
            throw new Error(`Invalid terminal status: ${finalStatus}`);
        }
        this.store.markRunComplete(runId, finalStatus);
    }

    /**
     * Generate deterministic dedupe key for coalescing
     * Example: for hourly timer triggers, use botId + hour
     */
    static generateDedupeKey(
        wakeSource: WakeSource,
        botId: string,
        interval?: string
    ): string | undefined {
        const timestamp = new Date();
        switch (wakeSource) {
            case 'timer': {
                // For hourly, group by hour; for daily, group by day
                const hour = timestamp.getHours();
                const date = timestamp.toISOString().split('T')[0];
                return `timer:${botId}:${interval || 'hourly'}:${date}:${interval === 'hourly' ? hour : '0'}`;
            }
            case 'assignment':
                // Assignment wakeups are usually immediate, minimal coalescing
                return `assign:${botId}:${Math.floor(timestamp.getTime() / 60000)}`;
            case 'on_demand':
                // On-demand typically immediate, no coalescing
                return undefined;
            case 'automation':
                // Automation workflows may have scheduled intervals
                return `automation:${botId}:${Math.floor(timestamp.getTime() / 5000)}`; // 5-second window
            default:
                return undefined;
        }
    }

    exportState(): TaskSchedulerState {
        const parallelSlotsByWorkspace: Record<string, TaskSlot[]> = {};
        for (const [workspaceId, manager] of this.parallelManagers.entries()) {
            parallelSlotsByWorkspace[workspaceId] = manager.snapshot().map((slot) => ({ ...slot }));
        }

        return {
            runs: this.store.listRuns(),
            parallelSlotsByWorkspace,
        };
    }
}
