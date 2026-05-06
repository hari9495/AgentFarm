import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { ProactiveSignalType, RunStatus, ScheduleType, ScheduledRunStatus, WakeSource } from '@agentfarm/shared-types';
import { TaskScheduler, type TaskSchedulerState } from './task-scheduler.js';
import { RoutineScheduler, type RoutineSchedulerState } from './routine-scheduler.js';
import {
    createOrchestratorStateStore,
    type OrchestratorStateBackend,
    type OrchestratorPersistedState,
    type OrchestratorStateStore,
} from './orchestrator-state-store.js';

type BuildOrchestratorServerOptions = {
    taskScheduler?: TaskScheduler;
    routineScheduler?: RoutineScheduler;
    stateStore?: OrchestratorStateStore;
    stateBackend?: OrchestratorStateBackend;
    statePath?: string;
    now?: () => number;
    workspaceSessionFetcher?: (input: {
        tenantId: string;
        workspaceId: string;
        env: NodeJS.ProcessEnv;
    }) => Promise<{
        source: 'default' | 'persisted';
        version: number;
        state: Record<string, unknown>;
    } | null>;
};

const defaultStatePath = process.env.ORCHESTRATOR_STATE_PATH?.trim() || '.orchestrator/state.json';
const defaultStateBackend = (process.env.ORCHESTRATOR_STATE_BACKEND?.trim().toLowerCase() as OrchestratorStateBackend | undefined) ?? 'auto';

const defaultWorkspaceSessionFetcher = async (input: {
    tenantId: string;
    workspaceId: string;
    env: NodeJS.ProcessEnv;
}): Promise<{
    source: 'default' | 'persisted';
    version: number;
    state: Record<string, unknown>;
} | null> => {
    const baseUrl = input.env.ORCHESTRATOR_SESSION_API_URL?.trim();
    const token =
        input.env.RUNTIME_SESSION_SHARED_TOKEN
        ?? input.env.AF_RUNTIME_SESSION_SHARED_TOKEN
        ?? input.env.AGENTFARM_RUNTIME_SESSION_SHARED_TOKEN
        ?? null;

    if (!baseUrl || !token) {
        return null;
    }

    try {
        const url = new URL(
            `/v1/workspaces/${encodeURIComponent(input.workspaceId)}/session-state`,
            baseUrl,
        );
        url.searchParams.set('tenant_id', input.tenantId);
        url.searchParams.set('mode', 'restore');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'x-runtime-session-token': token,
            },
            signal: AbortSignal.timeout(4_000),
            cache: 'no-store',
        });

        if (!response.ok) {
            return null;
        }

        const body = await response.json() as {
            source?: 'default' | 'persisted';
            version?: number;
            state?: Record<string, unknown>;
        };

        return {
            source: body.source === 'persisted' ? 'persisted' : 'default',
            version: typeof body.version === 'number' ? body.version : 0,
            state: typeof body.state === 'object' && body.state !== null ? body.state : {},
        };
    } catch {
        return null;
    }
};

const parseWakeSource = (value: unknown): WakeSource | null => {
    if (value === 'timer' || value === 'assignment' || value === 'on_demand' || value === 'automation') {
        return value;
    }
    return null;
};

const parseRunTerminalStatus = (value: unknown): RunStatus | null => {
    if (value === 'completed' || value === 'cancelled' || value === 'failed' || value === 'timeout') {
        return value;
    }
    return null;
};

const parseScheduleTerminalStatus = (value: unknown): ScheduledRunStatus | null => {
    if (value === 'completed' || value === 'failed' || value === 'skipped') {
        return value;
    }
    return null;
};

const parseScheduleType = (value: unknown): ScheduleType | null => {
    if (value === 'once' || value === 'hourly' || value === 'daily' || value === 'weekly' || value === 'monthly') {
        return value;
    }
    return null;
};

const parseProactiveSignalType = (value: unknown): ProactiveSignalType | null => {
    if (value === 'stale_pr' || value === 'stale_ticket' || value === 'budget_warning') {
        return value;
    }
    return null;
};

export const buildOrchestratorServer = async (
    options: BuildOrchestratorServerOptions = {},
): Promise<FastifyInstance> => {
    const env = process.env;
    const now = options.now ?? (() => Date.now());
    const workspaceSessionFetcher = options.workspaceSessionFetcher ?? defaultWorkspaceSessionFetcher;
    const stateStore = options.stateStore ?? createOrchestratorStateStore({
        backend: options.stateBackend ?? defaultStateBackend,
        statePath: options.statePath ?? defaultStatePath,
    });
    const loadedState = await stateStore.load();
    const taskSchedulerState: TaskSchedulerState | undefined = loadedState?.taskScheduler;
    const routineSchedulerState: RoutineSchedulerState | undefined = loadedState?.routineScheduler;
    const taskScheduler = options.taskScheduler ?? new TaskScheduler(taskSchedulerState);
    const routineScheduler = options.routineScheduler ?? new RoutineScheduler(routineSchedulerState);
    const app = Fastify({ logger: false });

    const persistSchedulers = async (): Promise<void> => {
        const payload: OrchestratorPersistedState = {
            version: 1,
            taskScheduler: taskScheduler.exportState(),
            routineScheduler: routineScheduler.exportState(),
        };
        await stateStore.save(payload);
    };

    const persistOrFail = async (reply: FastifyReply): Promise<boolean> => {
        try {
            await persistSchedulers();
            return true;
        } catch (error) {
            void reply.code(500).send({
                error: 'state_persist_failed',
                message: error instanceof Error ? error.message : 'Unable to persist orchestrator state.',
            });
            return false;
        }
    };

    app.get('/health', async () => ({ status: 'ok', service: 'orchestrator' }));

    app.post('/v1/wake/schedule', async (request, reply) => {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
        const botId = typeof body.bot_id === 'string' ? body.bot_id.trim() : '';
        const wakeSource = parseWakeSource(body.wake_source);

        if (!tenantId || !workspaceId || !botId || !wakeSource) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tenant_id, workspace_id, bot_id, and wake_source are required.',
            });
        }

        const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
            ? body.correlation_id.trim()
            : `wake_${botId}_${Math.floor(now())}`;
        const interval = typeof body.interval === 'string' && body.interval.trim()
            ? body.interval.trim()
            : undefined;
        const dedupeKey = typeof body.dedupe_key === 'string' && body.dedupe_key.trim()
            ? body.dedupe_key.trim()
            : TaskScheduler.generateDedupeKey(wakeSource, botId, interval);
        const timestamp = typeof body.timestamp === 'string' && body.timestamp.trim()
            ? body.timestamp.trim()
            : new Date(now()).toISOString();

        const restoredSession = await workspaceSessionFetcher({
            tenantId,
            workspaceId,
            env,
        });

        const result = await taskScheduler.scheduleWake({
            tenantId,
            workspaceId,
            botId,
            wakeSource,
            dedupeKey,
            correlationId,
            timestamp,
        });

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(result.isNewRun ? 201 : 200).send({
            run_id: result.runId,
            wake_source: wakeSource,
            dedupe_key: dedupeKey ?? null,
            is_new_run: result.isNewRun,
            coalesced: result.coalesced,
            message: result.message,
            correlation_id: correlationId,
            restored_session_state: restoredSession
                ? {
                    source: restoredSession.source,
                    version: restoredSession.version,
                    state_keys: Object.keys(restoredSession.state),
                }
                : null,
        });
    });

    app.post('/v1/wake/runs/:runId/complete', async (request, reply) => {
        const params = request.params as { runId: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const finalStatus = parseRunTerminalStatus(body.final_status);
        if (!finalStatus) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'final_status must be one of completed, cancelled, failed, timeout.',
            });
        }

        try {
            taskScheduler.completeRun(params.runId, finalStatus);
        } catch (error) {
            return reply.code(400).send({
                error: 'invalid_status',
                message: error instanceof Error ? error.message : 'Invalid terminal status.',
            });
        }

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({ run_id: params.runId, final_status: finalStatus });
    });

    app.post('/v1/feature-flags/:featureFlagKey/enable', async (request, reply) => {
        const { featureFlagKey } = request.params as { featureFlagKey: string };
        routineScheduler.enableFeatureFlag(featureFlagKey);
        if (!(await persistOrFail(reply))) {
            return;
        }
        return { feature_flag_key: featureFlagKey, enabled: true };
    });

    app.post('/v1/feature-flags/:featureFlagKey/disable', async (request, reply) => {
        const { featureFlagKey } = request.params as { featureFlagKey: string };
        routineScheduler.disableFeatureFlag(featureFlagKey);
        if (!(await persistOrFail(reply))) {
            return;
        }
        return { feature_flag_key: featureFlagKey, enabled: false };
    });

    app.post('/v1/schedules', async (request, reply) => {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
        const botId = typeof body.bot_id === 'string' ? body.bot_id.trim() : '';
        const scheduleType = parseScheduleType(body.schedule_type);
        const scheduleExpression = typeof body.schedule_expression === 'string' ? body.schedule_expression.trim() : '';
        const policyPackVersion = typeof body.policy_pack_version === 'string' && body.policy_pack_version.trim()
            ? body.policy_pack_version.trim()
            : 'control_plane_v1';
        const featureFlagKey = typeof body.feature_flag_key === 'string' && body.feature_flag_key.trim()
            ? body.feature_flag_key.trim()
            : 'scheduler.routine_tasks';
        const taskPayload = typeof body.task_payload === 'object' && body.task_payload !== null
            ? body.task_payload as Record<string, unknown>
            : {};
        const policy = typeof body.policy === 'object' && body.policy !== null
            ? body.policy as Record<string, unknown>
            : null;

        if (!tenantId || !workspaceId || !botId || !scheduleType || !scheduleExpression || !policy) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tenant_id, workspace_id, bot_id, schedule_type, schedule_expression, and policy are required.',
            });
        }

        const concurrencyPolicy = policy.concurrency_policy;
        if (concurrencyPolicy !== 'queue' && concurrencyPolicy !== 'replace' && concurrencyPolicy !== 'skip') {
            return reply.code(400).send({
                error: 'invalid_policy',
                message: 'policy.concurrency_policy must be queue, replace, or skip.',
            });
        }

        const dedupeKey = typeof policy.dedupe_key === 'string' ? policy.dedupe_key.trim() : '';
        const maxRetries = typeof policy.max_retries === 'number' ? policy.max_retries : 0;
        const retryBackoffMs = typeof policy.retry_backoff_ms === 'number' ? policy.retry_backoff_ms : 0;

        if (!dedupeKey || maxRetries < 0 || retryBackoffMs < 0) {
            return reply.code(400).send({
                error: 'invalid_policy',
                message: 'policy.dedupe_key is required and retry values must be non-negative numbers.',
            });
        }

        const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
            ? body.correlation_id.trim()
            : `schedule_${botId}_${Math.floor(now())}`;

        const task = await routineScheduler.createScheduledTask({
            botId,
            tenantId,
            workspaceId,
            scheduleType,
            scheduleExpression,
            taskPayload,
            policyPackVersion,
            featureFlagKey,
            correlationId,
            policy: {
                dedupeKey,
                concurrencyPolicy,
                maxRetries,
                retryBackoffMs,
            },
        });

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(201).send({
            id: task.id,
            schedule_id: task.scheduleId,
            bot_id: task.botId,
            workspace_id: task.workspaceId,
            enabled: task.enabled,
            feature_flag_key: task.featureFlagKey,
            status: task.status,
        });
    });

    app.post('/v1/schedules/:scheduleTaskId/runs', async (request, reply) => {
        const { scheduleTaskId } = request.params as { scheduleTaskId: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
            ? body.correlation_id.trim()
            : `schedule_run_${Math.floor(now())}`;

        try {
            const result = await routineScheduler.scheduleRun(scheduleTaskId, correlationId);
            if (!(await persistOrFail(reply))) {
                return;
            }
            return reply.code(result.deduplicated ? 200 : 201).send({
                schedule_task_id: scheduleTaskId,
                run_id: result.runId,
                deduplicated: result.deduplicated,
                correlation_id: correlationId,
            });
        } catch (error) {
            return reply.code(409).send({
                error: 'schedule_run_failed',
                message: error instanceof Error ? error.message : 'Unable to schedule run.',
            });
        }
    });

    app.post('/v1/schedules/:scheduleTaskId/runs/:runId/complete', async (request, reply) => {
        const { scheduleTaskId, runId } = request.params as { scheduleTaskId: string; runId: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const finalStatus = parseScheduleTerminalStatus(body.final_status);
        if (!finalStatus) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'final_status must be one of completed, failed, skipped.',
            });
        }

        const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
            ? body.correlation_id.trim()
            : `schedule_complete_${Math.floor(now())}`;

        try {
            await routineScheduler.completeScheduledRun(scheduleTaskId, runId, finalStatus, correlationId);
            if (!(await persistOrFail(reply))) {
                return;
            }
            return reply.code(200).send({
                schedule_task_id: scheduleTaskId,
                run_id: runId,
                final_status: finalStatus,
            });
        } catch (error) {
            return reply.code(404).send({
                error: 'schedule_not_found',
                message: error instanceof Error ? error.message : 'Unable to complete scheduled run.',
            });
        }
    });

    app.get('/v1/schedules/:scheduleTaskId', async (request, reply) => {
        const { scheduleTaskId } = request.params as { scheduleTaskId: string };
        const task = await routineScheduler.getScheduledTask(scheduleTaskId);
        if (!task) {
            return reply.code(404).send({
                error: 'schedule_not_found',
                message: 'No scheduled task exists for the provided id.',
            });
        }
        return task;
    });

    app.get('/v1/bots/:botId/schedules', async (request) => {
        const { botId } = request.params as { botId: string };
        const tasks = await routineScheduler.listScheduledTasksForBot(botId);
        return { bot_id: botId, schedules: tasks };
    });

    app.get('/v1/scheduler/errors', async (request) => {
        const query = request.query as { limit?: string };
        const parsedLimit = query.limit ? Number(query.limit) : 10;
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.floor(parsedLimit)
            : 10;
        return { errors: routineScheduler.getRecentErrors(limit) };
    });

    app.post('/v1/proactive-signals/detect', async (request, reply) => {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
        const botId = typeof body.bot_id === 'string' ? body.bot_id.trim() : '';

        if (!tenantId || !workspaceId || !botId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tenant_id, workspace_id, and bot_id are required.',
            });
        }

        const correlationId = typeof body.correlation_id === 'string' && body.correlation_id.trim()
            ? body.correlation_id.trim()
            : `proactive_signal_${Math.floor(now())}`;
        const pullRequests = Array.isArray(body.pull_requests)
            ? body.pull_requests
                .filter((row): row is { id: string; title: string; days_since_update: number } => {
                    if (typeof row !== 'object' || row === null) {
                        return false;
                    }
                    const candidate = row as Record<string, unknown>;
                    return typeof candidate.id === 'string'
                        && typeof candidate.title === 'string'
                        && typeof candidate.days_since_update === 'number';
                })
                .map((row) => ({ id: row.id, title: row.title, daysSinceUpdate: row.days_since_update }))
            : [];
        const tickets = Array.isArray(body.tickets)
            ? body.tickets
                .filter((row): row is { id: string; title: string; hours_since_update: number } => {
                    if (typeof row !== 'object' || row === null) {
                        return false;
                    }
                    const candidate = row as Record<string, unknown>;
                    return typeof candidate.id === 'string'
                        && typeof candidate.title === 'string'
                        && typeof candidate.hours_since_update === 'number';
                })
                .map((row) => ({ id: row.id, title: row.title, hoursSinceUpdate: row.hours_since_update }))
            : [];
        const budgetUtilizationRatio = typeof body.budget_utilization_ratio === 'number'
            ? body.budget_utilization_ratio
            : undefined;

        const detected = await routineScheduler.detectProactiveSignals({
            tenantId,
            workspaceId,
            botId,
            correlationId,
            pullRequests,
            tickets,
            budgetUtilizationRatio,
            stalePrThresholdDays: typeof body.stale_pr_threshold_days === 'number' ? body.stale_pr_threshold_days : undefined,
            staleTicketThresholdHours: typeof body.stale_ticket_threshold_hours === 'number' ? body.stale_ticket_threshold_hours : undefined,
            budgetWarningThreshold: typeof body.budget_warning_threshold === 'number' ? body.budget_warning_threshold : undefined,
        });

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({
            detected_count: detected.length,
            signals: detected,
            correlation_id: correlationId,
        });
    });

    app.get('/v1/proactive-signals', async (request, reply) => {
        const query = request.query as {
            workspace_id?: string;
            signal_type?: string;
            status?: string;
            limit?: string;
        };
        const signalType = query.signal_type ? parseProactiveSignalType(query.signal_type) : null;
        if (query.signal_type && !signalType) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'signal_type must be stale_pr, stale_ticket, or budget_warning.',
            });
        }

        const parsedLimit = query.limit ? Number(query.limit) : 50;
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50;
        const status = query.status === 'open' || query.status === 'resolved' ? query.status : undefined;
        const signals = routineScheduler.listProactiveSignals({
            workspaceId: query.workspace_id,
            signalType: signalType ?? undefined,
            status,
            limit,
        });

        return {
            count: signals.length,
            signals,
        };
    });

    app.post('/v1/proactive-signals/:signalId/resolve', async (request, reply) => {
        const { signalId } = request.params as { signalId: string };
        const found = routineScheduler.resolveProactiveSignal(signalId);
        if (!found) {
            return reply.code(404).send({
                error: 'signal_not_found',
                message: 'No proactive signal exists for the provided id.',
            });
        }

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({ signal_id: signalId, status: 'resolved' });
    });

    return app;
};

const start = async (): Promise<void> => {
    const app = await buildOrchestratorServer();
    const port = Number(process.env.PORT ?? 3011);
    const host = process.env.HOST ?? '0.0.0.0';
    await app.listen({ port, host });
    console.log(`orchestrator listening on ${host}:${port}`);
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    void start();
}
