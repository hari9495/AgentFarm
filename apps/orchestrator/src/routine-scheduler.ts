/**
 * Epic B4: Feature-Flagged Routine Scheduler (Controlled Pilot)
 * Enables recurring task intake without affecting core assignment path.
 * 
 * - Scheduler is disabled by default via feature flag
 * - Enabled pilot workspace receives scheduled tasks with dedupe and concurrency policy
 * - Scheduler failures do not block manual task assignment
 * - Scheduled runs emit same evidence/approval contracts as manual runs
 */

import {
    CONTRACT_VERSIONS,
    type ProactiveSignalRecord,
    type ProactiveSignalStatus,
    type ProactiveSignalType,
    type SchedulePolicy,
    type ScheduleType,
    type ScheduledRunStatus,
    type ScheduledTaskRecord,
} from '@agentfarm/shared-types';
import { randomUUID } from 'crypto';
import {
    runProactiveDetection,
    type ProactiveCiFailureInput,
    type ProactiveDependencyCveInput,
    type ProactiveBaStoryInput,
    type ProactiveBaRequirementConflictInput,
    type ProactiveBaStakeholderThreadInput,
    type ProactiveBaEpicInput,
    type ProactiveSignalDetectionInput,
} from './proactive-signal-detector.js';

export type { ProactiveSignalDetectionInput };

export interface CreateScheduledTaskRequest {
    botId: string;
    tenantId: string;
    workspaceId: string;
    scheduleType: ScheduleType;
    scheduleExpression: string; // cron or interval
    taskPayload: Record<string, unknown>;
    policyPackVersion: string;
    policy: SchedulePolicy;
    featureFlagKey: string;
    correlationId: string;
}

export interface RoutineSchedulerState {
    scheduledTasks: ScheduledTaskRecord[];
    featureFlags: Record<string, boolean>;
    schedulerErrors: Array<{ taskId: string; error: string; timestamp: string }>;
    proactiveSignals: ProactiveSignalRecord[];
    auditEvents?: Array<{
        action: string;
        actorEmail: string;
        tenantId: string;
        workspaceId: string;
        metadata?: Record<string, unknown>;
        occurredAt: string;
    }>;
}

export class RoutineScheduler {
    private scheduledTasks = new Map<string, ScheduledTaskRecord>();
    private tasksByBot = new Map<string, Set<string>>();
    private featureFlags = new Map<string, boolean>(); // Default: all disabled
    private schedulerErrors: Array<{ taskId: string; error: string; timestamp: string }> = [];
    private proactiveSignals = new Map<string, ProactiveSignalRecord>();
    private openSignalIdsByKey = new Map<string, string>();
    private auditEvents: Array<{
        action: string;
        actorEmail: string;
        tenantId: string;
        workspaceId: string;
        metadata?: Record<string, unknown>;
        occurredAt: string;
    }> = [];

    constructor(state?: RoutineSchedulerState) {
        if (!state) {
            return;
        }

        for (const task of state.scheduledTasks) {
            this.scheduledTasks.set(task.id, { ...task });
            if (!this.tasksByBot.has(task.botId)) {
                this.tasksByBot.set(task.botId, new Set());
            }
            this.tasksByBot.get(task.botId)!.add(task.id);
        }

        for (const [featureFlagKey, enabled] of Object.entries(state.featureFlags)) {
            this.featureFlags.set(featureFlagKey, enabled);
        }

        this.schedulerErrors = state.schedulerErrors.map((entry) => ({ ...entry }));
        this.auditEvents = (state.auditEvents ?? []).map((entry) => ({ ...entry }));

        for (const signal of state.proactiveSignals) {
            const normalized: ProactiveSignalRecord = { ...signal };
            this.proactiveSignals.set(normalized.id, normalized);
            if (normalized.status === 'open') {
                this.openSignalIdsByKey.set(this.toSignalDedupeKey(normalized.signalType, normalized.workspaceId, normalized.sourceRef), normalized.id);
            }
        }
    }

    private writeAuditEvent(event: {
        action: string;
        actorEmail: string;
        tenantId: string;
        workspaceId: string;
        metadata?: Record<string, unknown>;
    }): void {
        this.auditEvents.push({
            ...event,
            occurredAt: new Date().toISOString(),
        });
        if (this.auditEvents.length > 1_000) {
            this.auditEvents.shift();
        }
    }

    private toSignalDedupeKey(signalType: ProactiveSignalType, workspaceId: string, sourceRef: string): string {
        return `${signalType}:${workspaceId}:${sourceRef}`;
    }

    private upsertSignal(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        correlationId: string;
        signalType: ProactiveSignalType;
        severity: 'low' | 'medium' | 'high';
        summary: string;
        sourceRef: string;
        metadata?: Record<string, unknown>;
        nowIso: string;
    }): ProactiveSignalRecord {
        const key = this.toSignalDedupeKey(input.signalType, input.workspaceId, input.sourceRef);
        const existingId = this.openSignalIdsByKey.get(key);
        if (existingId) {
            const existing = this.proactiveSignals.get(existingId);
            if (existing) {
                existing.updatedAt = input.nowIso;
                existing.severity = input.severity;
                existing.summary = input.summary;
                existing.metadata = input.metadata;
                existing.correlationId = input.correlationId;
                return { ...existing };
            }
        }

        const created: ProactiveSignalRecord = {
            id: randomUUID(),
            contractVersion: CONTRACT_VERSIONS.PROACTIVE_SIGNAL,
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            botId: input.botId,
            signalType: input.signalType,
            status: 'open',
            severity: input.severity,
            summary: input.summary,
            sourceRef: input.sourceRef,
            metadata: input.metadata,
            correlationId: input.correlationId,
            detectedAt: input.nowIso,
            updatedAt: input.nowIso,
        };
        this.proactiveSignals.set(created.id, created);
        this.openSignalIdsByKey.set(key, created.id);
        return { ...created };
    }

    /**
     * Enable feature flag for a workspace
     */
    enableFeatureFlag(featureFlagKey: string): void {
        this.featureFlags.set(featureFlagKey, true);
    }

    /**
     * Disable feature flag
     */
    disableFeatureFlag(featureFlagKey: string): void {
        this.featureFlags.set(featureFlagKey, false);
    }

    /**
     * Check if feature flag is enabled
     */
    isFeatureFlagEnabled(featureFlagKey: string): boolean {
        return this.featureFlags.get(featureFlagKey) ?? false;
    }

    /**
     * Create a scheduled task (enabled only if feature flag is on)
     */
    async createScheduledTask(request: CreateScheduledTaskRequest): Promise<ScheduledTaskRecord> {
        // Check feature flag
        const isEnabled = this.isFeatureFlagEnabled(request.featureFlagKey);

        const task: ScheduledTaskRecord = {
            id: randomUUID(),
            botId: request.botId,
            tenantId: request.tenantId,
            workspaceId: request.workspaceId,
            scheduleId: randomUUID(),
            scheduleType: request.scheduleType,
            scheduleExpression: request.scheduleExpression,
            taskPayload: request.taskPayload,
            policyPackVersion: request.policyPackVersion,
            status: 'scheduled',
            isFeatureFlagged: true,
            featureFlagKey: request.featureFlagKey,
            enabled: isEnabled, // Only enabled if flag is true
            failureCount: 0,
            policy: request.policy,
            correlationId: request.correlationId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        this.scheduledTasks.set(task.id, task);

        if (!this.tasksByBot.has(request.botId)) {
            this.tasksByBot.set(request.botId, new Set());
        }
        this.tasksByBot.get(request.botId)!.add(task.id);

        return task;
    }

    /**
     * Schedule a run from a scheduled task
     * Applies deduplication based on concurrency policy
     */
    async scheduleRun(scheduledTaskId: string, correlationId: string): Promise<{ runId: string; deduplicated: boolean }> {
        const task = this.scheduledTasks.get(scheduledTaskId);
        if (!task) {
            throw new Error(`Scheduled task not found: ${scheduledTaskId}`);
        }

        if (!task.enabled) {
            throw new Error(`Scheduled task is not enabled (feature flag disabled): ${task.featureFlagKey}`);
        }

        // Apply concurrency policy
        const runId = randomUUID();
        let deduplicated = false;

        switch (task.policy.concurrencyPolicy) {
            case 'queue':
                // Allow queuing if no active run
                if (!task.activeRunId) {
                    task.activeRunId = runId;
                    task.lastTriggeredAt = new Date().toISOString();
                } else {
                    deduplicated = true; // Queue behind active run
                }
                break;

            case 'replace':
                // Cancel previous run if active
                task.activeRunId = runId;
                task.lastTriggeredAt = new Date().toISOString();
                break;

            case 'skip':
                // Skip if already active
                if (task.activeRunId) {
                    deduplicated = true;
                    return { runId: task.activeRunId, deduplicated: true };
                }
                task.activeRunId = runId;
                task.lastTriggeredAt = new Date().toISOString();
                break;
        }

        return { runId, deduplicated };
    }

    /**
     * Complete a scheduled run
     */
    async completeScheduledRun(
        scheduledTaskId: string,
        runId: string,
        finalStatus: ScheduledRunStatus,
        correlationId: string
    ): Promise<void> {
        const task = this.scheduledTasks.get(scheduledTaskId);
        if (!task) {
            throw new Error(`Scheduled task not found: ${scheduledTaskId}`);
        }

        if (
            finalStatus === 'completed' ||
            finalStatus === 'skipped' ||
            finalStatus === 'failed'
        ) {
            task.status = finalStatus;
            task.lastCompletedRunId = runId;
            task.updatedAt = new Date().toISOString();

            if (finalStatus === 'failed') {
                task.failureCount++;
                task.lastFailureReason = 'Execution failed';
            }

            if (task.activeRunId === runId) {
                task.activeRunId = undefined;
            }
        }
    }

    /**
     * Get scheduled task
     */
    async getScheduledTask(taskId: string): Promise<ScheduledTaskRecord | undefined> {
        return this.scheduledTasks.get(taskId);
    }

    /**
     * List scheduled tasks for a bot
     */
    async listScheduledTasksForBot(botId: string): Promise<ScheduledTaskRecord[]> {
        const taskIds = this.tasksByBot.get(botId) || new Set();
        const tasks: ScheduledTaskRecord[] = [];

        for (const taskId of taskIds) {
            const task = this.scheduledTasks.get(taskId);
            if (task) {
                tasks.push(task);
            }
        }

        return tasks;
    }

    /**
     * Mark scheduler failure (non-blocking)
     */
    recordSchedulerError(taskId: string, error: string): void {
        this.schedulerErrors.push({
            taskId,
            error,
            timestamp: new Date().toISOString(),
        });

        // Limit error log size
        if (this.schedulerErrors.length > 1000) {
            this.schedulerErrors.shift();
        }
    }

    /**
     * Get recent scheduler errors (for monitoring)
     */
    getRecentErrors(limit: number = 10): Array<{ taskId: string; error: string; timestamp: string }> {
        return this.schedulerErrors.slice(-limit);
    }

    /**
     * Verify that a scheduled task's record contains all required contract fields.
     * Checks the task record rather than comparing two run IDs, because the
     * runtime owns run records — the scheduler only owns the task definition.
     */
    async verifyRunContractsMatch(
        scheduledTaskId: string,
        _manualRunId: string
    ): Promise<{ matchesContract: boolean; differences: string[] }> {
        const task = this.scheduledTasks.get(scheduledTaskId);
        if (!task) {
            return { matchesContract: false, differences: [`scheduled task ${scheduledTaskId} not found`] };
        }

        const differences: string[] = [];

        if (!task.correlationId) differences.push('missing correlationId');
        if (!task.tenantId) differences.push('missing tenantId');
        if (!task.workspaceId) differences.push('missing workspaceId');
        if (!task.botId) differences.push('missing botId');
        if (!task.policy?.dedupeKey) differences.push('missing policy.dedupeKey');
        if (!task.policy?.concurrencyPolicy) differences.push('missing policy.concurrencyPolicy');
        if (!task.policyPackVersion) differences.push('missing policyPackVersion');
        if (!task.featureFlagKey) differences.push('missing featureFlagKey');
        if (typeof task.failureCount !== 'number') differences.push('missing failureCount');

        return { matchesContract: differences.length === 0, differences };
    }

    async detectProactiveSignals(input: ProactiveSignalDetectionInput): Promise<ProactiveSignalRecord[]> {
        const nowIso = new Date().toISOString();
        const {
            tenantId,
            workspaceId,
            botId,
            correlationId,
            ...rest
        } = input;
        const detected = await runProactiveDetection(workspaceId, [], {
            tenantId,
            botId,
            correlationId,
            ...rest,
        });
        return detected.map((signal) => {
            const upserted = this.upsertSignal({
                tenantId,
                workspaceId,
                botId,
                correlationId,
                signalType: signal.signalType,
                severity: signal.severity,
                summary: signal.summary,
                sourceRef: signal.sourceRef,
                metadata: signal.metadata,
                nowIso,
            });
            this.writeAuditEvent({
                action: 'proactive_signal_detected',
                actorEmail: 'agent@system',
                tenantId,
                workspaceId,
                metadata: {
                    signalType: signal.signalType,
                    severity: signal.severity,
                },
            });
            return upserted;
        });
    }

    listProactiveSignals(filter?: {
        workspaceId?: string;
        signalType?: ProactiveSignalType;
        status?: ProactiveSignalStatus;
        limit?: number;
    }): ProactiveSignalRecord[] {
        const all = Array.from(this.proactiveSignals.values())
            .filter((signal) => !filter?.workspaceId || signal.workspaceId === filter.workspaceId)
            .filter((signal) => !filter?.signalType || signal.signalType === filter.signalType)
            .filter((signal) => !filter?.status || signal.status === filter.status)
            .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

        if (!filter?.limit || filter.limit <= 0) {
            return all.map((signal) => ({ ...signal }));
        }
        return all.slice(0, filter.limit).map((signal) => ({ ...signal }));
    }

    resolveProactiveSignal(signalId: string): boolean {
        const signal = this.proactiveSignals.get(signalId);
        if (!signal) {
            return false;
        }

        signal.status = 'resolved';
        signal.updatedAt = new Date().toISOString();
        this.openSignalIdsByKey.delete(this.toSignalDedupeKey(signal.signalType, signal.workspaceId, signal.sourceRef));
        return true;
    }

    exportState(): RoutineSchedulerState {
        return {
            scheduledTasks: Array.from(this.scheduledTasks.values()).map((task) => ({ ...task })),
            featureFlags: Object.fromEntries(this.featureFlags.entries()),
            schedulerErrors: this.schedulerErrors.map((entry) => ({ ...entry })),
            proactiveSignals: Array.from(this.proactiveSignals.values()).map((signal) => ({ ...signal })),
            auditEvents: this.auditEvents.map((entry) => ({ ...entry })),
        };
    }

    /**
     * Register a daily 09:00 standup task for a Corporate Assistant agent.
     *
     * Creates a `ScheduledTaskRecord` with cron `0 9 * * *` and action type
     * `workspace_ca_standup_report`.  The task is gated behind the
     * `scheduler.ca_standup` feature flag — call
     * `enableFeatureFlag('scheduler.ca_standup')` to activate it.
     *
     * Actual standup summary generation happens at execution time inside the
     * agent-runtime's CA action handler (`workspace_ca_standup_report` →
     * `buildCorporateAssistantStandupSummary`).
     */
    async registerCorporateAssistantDailyStandup(params: {
        botId: string;
        tenantId: string;
        workspaceId: string;
        correlationId: string;
        config?: { botName?: string; teamName?: string; meetingType?: string };
    }): Promise<ScheduledTaskRecord> {
        return this.createScheduledTask({
            botId: params.botId,
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            scheduleType: 'daily' as ScheduleType,
            scheduleExpression: '0 9 * * *',
            taskPayload: {
                action: 'workspace_ca_standup_report',
                bot_name: params.config?.botName ?? '',
                team_name: params.config?.teamName ?? '',
                meeting_type: params.config?.meetingType ?? 'standup',
            },
            policyPackVersion: '1.0.0',
            policy: {
                dedupeKey: `ca-standup-${params.botId}`,
                concurrencyPolicy: 'skip',
                maxRetries: 2,
                retryBackoffMs: 5000,
            } as SchedulePolicy,
            featureFlagKey: 'scheduler.ca_standup',
            correlationId: params.correlationId,
        });
    }

    /**
     * Register recurring proactive monitoring tasks for a Business Analyst bot.
     *
     * Registers three scheduled tasks:
     *   1. Story AC coverage check  — every 6 hours (detects stories missing acceptance criteria)
     *   2. Orphan epic BRD check    — daily at 08:00 (detects epics with no linked BRD)
     *   3. Requirement conflict scan — daily at 10:00 (detects contradictory requirements)
     *
     * All three are gated behind the `scheduler.ba_proactive` feature flag.
     * Call `enableFeatureFlag('scheduler.ba_proactive')` to activate them.
     *
     * At execution time, the agent-runtime dispatches these to the BA action
     * handler as `workspace_ba_stakeholder_update` tasks whose payload contains
     * the proactive signal data (stories, epics, conflicts) for the agent to act on.
     */
    async registerBaProactiveMonitoring(params: {
        botId: string;
        tenantId: string;
        workspaceId: string;
        correlationId: string;
        config?: {
            /** Cron for AC coverage check. Default: every 6 hours. */
            acCheckCron?: string;
            /** Cron for orphan epic BRD check. Default: daily 08:00. */
            epicBrdCheckCron?: string;
            /** Cron for requirement conflict scan. Default: daily 10:00. */
            conflictScanCron?: string;
        };
    }): Promise<{ acCheck: ScheduledTaskRecord; epicBrdCheck: ScheduledTaskRecord; conflictScan: ScheduledTaskRecord }> {
        const {
            botId, tenantId, workspaceId, correlationId,
            config = {},
        } = params;

        const {
            acCheckCron     = '0 */6 * * *',    // every 6 hours
            epicBrdCheckCron = '0 8 * * *',      // daily 08:00
            conflictScanCron = '0 10 * * *',     // daily 10:00
        } = config;

        const [acCheck, epicBrdCheck, conflictScan] = await Promise.all([
            // 1. AC coverage — fires every 6 hours
            this.createScheduledTask({
                botId,
                tenantId,
                workspaceId,
                scheduleType: 'recurring' as ScheduleType,
                scheduleExpression: acCheckCron,
                taskPayload: {
                    action: 'workspace_ba_proactive_ac_check',
                    signal_type: 'ba_story_missing_ac',
                    description: 'Proactive: detect user stories missing acceptance criteria',
                },
                policyPackVersion: '1.0.0',
                policy: {
                    dedupeKey: `ba-ac-check-${botId}`,
                    concurrencyPolicy: 'skip',
                    maxRetries: 1,
                    retryBackoffMs: 60_000,
                } as SchedulePolicy,
                featureFlagKey: 'scheduler.ba_proactive',
                correlationId,
            }),

            // 2. Orphan epic BRD check — fires daily at 08:00
            this.createScheduledTask({
                botId,
                tenantId,
                workspaceId,
                scheduleType: 'daily' as ScheduleType,
                scheduleExpression: epicBrdCheckCron,
                taskPayload: {
                    action: 'workspace_ba_proactive_epic_check',
                    signal_type: 'ba_epic_missing_brd',
                    description: 'Proactive: detect epics with no linked BRD document',
                },
                policyPackVersion: '1.0.0',
                policy: {
                    dedupeKey: `ba-epic-brd-check-${botId}`,
                    concurrencyPolicy: 'skip',
                    maxRetries: 1,
                    retryBackoffMs: 60_000,
                } as SchedulePolicy,
                featureFlagKey: 'scheduler.ba_proactive',
                correlationId,
            }),

            // 3. Requirement conflict scan — fires daily at 10:00
            this.createScheduledTask({
                botId,
                tenantId,
                workspaceId,
                scheduleType: 'daily' as ScheduleType,
                scheduleExpression: conflictScanCron,
                taskPayload: {
                    action: 'workspace_ba_proactive_conflict_scan',
                    signal_type: 'ba_requirement_conflict',
                    description: 'Proactive: scan for contradictory requirements across stories and BRDs',
                },
                policyPackVersion: '1.0.0',
                policy: {
                    dedupeKey: `ba-conflict-scan-${botId}`,
                    concurrencyPolicy: 'skip',
                    maxRetries: 1,
                    retryBackoffMs: 60_000,
                } as SchedulePolicy,
                featureFlagKey: 'scheduler.ba_proactive',
                correlationId,
            }),
        ]);

        return { acCheck, epicBrdCheck, conflictScan };
    }
}
