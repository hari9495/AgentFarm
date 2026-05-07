import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';
import type { ProactiveSignalType, RunStatus, ScheduleType, ScheduledRunStatus, WakeSource } from '@agentfarm/shared-types';
import { TaskScheduler, type TaskSchedulerState } from './task-scheduler.js';
import { RoutineScheduler, type RoutineSchedulerState } from './routine-scheduler.js';
import { AgentHandoffManager } from './agent-handoff-manager.js';
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
    questionSweepFetcher?: (input: {
        workspaceId: string;
        env: NodeJS.ProcessEnv;
    }) => Promise<{
        expiredCount: number;
        resolutions: Array<{
            questionId: string;
            taskId: string;
            policy: string;
            action: string;
        }>;
    } | null>;
    workspaceMemoryFetcher?: (input: {
        workspaceId: string;
        env: NodeJS.ProcessEnv;
    }) => Promise<{
        recentMemoryCount: number;
        memoryCountThisWeek: number;
        mostCommonConnectors: string[];
        approvalRejectionRate: number;
    } | null>;
    taskMemoryRecorder?: (input: {
        tenantId: string;
        workspaceId: string;
        taskId: string;
        correlationId: string;
        actionsTaken: string[];
        approvalOutcomes: Array<{ action: string; decision: 'approved' | 'rejected'; reason?: string }>;
        connectorsUsed: string[];
        llmProvider?: string;
        executionStatus: 'success' | 'approval_required' | 'failed';
        summary: string;
        env: NodeJS.ProcessEnv;
    }) => Promise<boolean>;
};

const getGatewayHeaders = (env: NodeJS.ProcessEnv): Record<string, string> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const bearerToken = env.ORCHESTRATOR_GATEWAY_BEARER_TOKEN?.trim();
    if (bearerToken) {
        headers.Authorization = `Bearer ${bearerToken}`;
    }
    const opsToken = env.ORCHESTRATOR_GATEWAY_OPS_TOKEN?.trim();
    if (opsToken) {
        headers['x-ops-token'] = opsToken;
    }
    return headers;
};

const getGatewayBaseUrl = (env: NodeJS.ProcessEnv): string | null => {
    const baseUrl = env.ORCHESTRATOR_GATEWAY_API_URL?.trim() ?? env.API_GATEWAY_URL?.trim() ?? '';
    return baseUrl || null;
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

const defaultQuestionSweepFetcher = async (input: {
    workspaceId: string;
    env: NodeJS.ProcessEnv;
}): Promise<{
    expiredCount: number;
    resolutions: Array<{
        questionId: string;
        taskId: string;
        policy: string;
        action: string;
    }>;
} | null> => {
    const baseUrl = getGatewayBaseUrl(input.env);
    if (!baseUrl) {
        return null;
    }

    try {
        const response = await fetch(
            `${baseUrl}/api/v1/workspaces/${encodeURIComponent(input.workspaceId)}/questions/sweep-expired`,
            {
                method: 'POST',
                headers: getGatewayHeaders(input.env),
                signal: AbortSignal.timeout(4_000),
            },
        );
        if (!response.ok) {
            return null;
        }

        const body = await response.json() as {
            expiredCount?: number;
            resolutions?: Array<{ questionId?: string; taskId?: string; policy?: string; action?: string }>;
        };

        return {
            expiredCount: typeof body.expiredCount === 'number' ? body.expiredCount : 0,
            resolutions: Array.isArray(body.resolutions)
                ? body.resolutions
                    .filter((entry): entry is { questionId: string; taskId: string; policy: string; action: string } => (
                        typeof entry.questionId === 'string'
                        && typeof entry.taskId === 'string'
                        && typeof entry.policy === 'string'
                        && typeof entry.action === 'string'
                    ))
                : [],
        };
    } catch {
        return null;
    }
};

const defaultWorkspaceMemoryFetcher = async (input: {
    workspaceId: string;
    env: NodeJS.ProcessEnv;
}): Promise<{
    recentMemoryCount: number;
    memoryCountThisWeek: number;
    mostCommonConnectors: string[];
    approvalRejectionRate: number;
} | null> => {
    const baseUrl = getGatewayBaseUrl(input.env);
    if (!baseUrl) {
        return null;
    }

    try {
        const response = await fetch(
            `${baseUrl}/api/v1/workspaces/${encodeURIComponent(input.workspaceId)}/memory?maxResults=5`,
            {
                method: 'GET',
                headers: getGatewayHeaders(input.env),
                signal: AbortSignal.timeout(4_000),
                cache: 'no-store',
            },
        );
        if (!response.ok) {
            return null;
        }

        const body = await response.json() as {
            recentMemories?: unknown[];
            memoryCountThisWeek?: number;
            mostCommonConnectors?: string[];
            approvalRejectionRate?: number;
        };

        return {
            recentMemoryCount: Array.isArray(body.recentMemories) ? body.recentMemories.length : 0,
            memoryCountThisWeek: typeof body.memoryCountThisWeek === 'number' ? body.memoryCountThisWeek : 0,
            mostCommonConnectors: Array.isArray(body.mostCommonConnectors) ? body.mostCommonConnectors.filter((entry): entry is string => typeof entry === 'string') : [],
            approvalRejectionRate: typeof body.approvalRejectionRate === 'number' ? body.approvalRejectionRate : 0,
        };
    } catch {
        return null;
    }
};

const defaultTaskMemoryRecorder = async (input: {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    correlationId: string;
    actionsTaken: string[];
    approvalOutcomes: Array<{ action: string; decision: 'approved' | 'rejected'; reason?: string }>;
    connectorsUsed: string[];
    llmProvider?: string;
    executionStatus: 'success' | 'approval_required' | 'failed';
    summary: string;
    env: NodeJS.ProcessEnv;
}): Promise<boolean> => {
    const baseUrl = getGatewayBaseUrl(input.env);
    if (!baseUrl) {
        return false;
    }

    try {
        const response = await fetch(
            `${baseUrl}/api/v1/workspaces/${encodeURIComponent(input.workspaceId)}/memory`,
            {
                method: 'POST',
                headers: getGatewayHeaders(input.env),
                signal: AbortSignal.timeout(4_000),
                body: JSON.stringify({
                    workspaceId: input.workspaceId,
                    tenantId: input.tenantId,
                    taskId: input.taskId,
                    actionsTaken: input.actionsTaken,
                    approvalOutcomes: input.approvalOutcomes,
                    connectorsUsed: input.connectorsUsed,
                    llmProvider: input.llmProvider,
                    executionStatus: input.executionStatus,
                    summary: input.summary,
                    correlationId: input.correlationId,
                }),
            },
        );
        return response.ok;
    } catch {
        return false;
    }
};

const parseWakeSource = (value: unknown): WakeSource | null => {
    if (
        value === 'timer'
        || value === 'assignment'
        || value === 'on_demand'
        || value === 'automation'
        || value === 'proactive_signal'
        || value === 'agent_handoff'
    ) {
        return value;
    }
    return null;
};

const parseAgentHandoffStatus = (value: unknown): 'pending' | 'accepted' | 'completed' | 'failed' | 'timed_out' | null => {
    if (
        value === 'pending'
        || value === 'accepted'
        || value === 'completed'
        || value === 'failed'
        || value === 'timed_out'
    ) {
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
    if (
        value === 'stale_pr'
        || value === 'stale_ticket'
        || value === 'budget_warning'
        || value === 'ci_failure_on_main'
        || value === 'dependency_cve'
    ) {
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
    const questionSweepFetcher = options.questionSweepFetcher ?? defaultQuestionSweepFetcher;
    const workspaceMemoryFetcher = options.workspaceMemoryFetcher ?? defaultWorkspaceMemoryFetcher;
    const taskMemoryRecorder = options.taskMemoryRecorder ?? defaultTaskMemoryRecorder;
    const stateStore = options.stateStore ?? createOrchestratorStateStore({
        backend: options.stateBackend ?? defaultStateBackend,
        statePath: options.statePath ?? defaultStatePath,
    });
    const loadedState = await stateStore.load();
    const taskSchedulerState: TaskSchedulerState | undefined = loadedState?.taskScheduler;
    const routineSchedulerState: RoutineSchedulerState | undefined = loadedState?.routineScheduler;
    const taskScheduler = options.taskScheduler ?? new TaskScheduler(taskSchedulerState);
    const routineScheduler = options.routineScheduler ?? new RoutineScheduler(routineSchedulerState);
    const handoffManager = new AgentHandoffManager(loadedState?.agentHandoffs);
    const app = Fastify({ logger: false });
    const handoffTimeoutSweepMs = 15 * 60 * 1_000;

    const persistSchedulers = async (): Promise<void> => {
        const payload: OrchestratorPersistedState = {
            version: 1,
            taskScheduler: taskScheduler.exportState(),
            routineScheduler: routineScheduler.exportState(),
            agentHandoffs: handoffManager.exportState(),
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

    const handoffTimeoutSweepTimer = setInterval(() => {
        void (async () => {
            const timedOut = handoffManager.checkAndTimeoutHandoffs(new Date(now()));
            if (timedOut.length === 0) {
                return;
            }
            await persistSchedulers();
        })().catch(() => {
            // Non-blocking sweep: failures are intentionally ignored.
        });
    }, handoffTimeoutSweepMs);

    app.addHook('onClose', async () => {
        clearInterval(handoffTimeoutSweepTimer);
    });

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
        const questionSweep = await questionSweepFetcher({ workspaceId, env });
        const memoryContext = await workspaceMemoryFetcher({ workspaceId, env });

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
            question_sweep: questionSweep,
            memory_context: memoryContext,
        });
    });

    app.post('/v1/workspaces/:workspaceId/task-slots/dispatch', async (request, reply) => {
        const { workspaceId } = request.params as { workspaceId: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
        const planTier = typeof body.plan_tier === 'string' && body.plan_tier.trim() ? body.plan_tier.trim() : 'free';
        const pendingTasksRaw = Array.isArray(body.pending_tasks) ? body.pending_tasks : [];

        if (!workspaceId.trim() || !tenantId) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'workspaceId and tenant_id are required.',
            });
        }

        const pendingTasks = pendingTasksRaw
            .filter((entry): entry is { task_id: string; priority?: number } => {
                if (typeof entry !== 'object' || entry === null) {
                    return false;
                }
                const candidate = entry as Record<string, unknown>;
                return typeof candidate.task_id === 'string' && candidate.task_id.trim().length > 0;
            })
            .map((entry) => ({
                taskId: entry.task_id.trim(),
                priority: typeof entry.priority === 'number' && Number.isFinite(entry.priority)
                    ? entry.priority
                    : undefined,
            }));

        const started = await taskScheduler.dispatchPendingTasks({
            workspaceId: workspaceId.trim(),
            tenantId,
            planTier,
            pendingTasks,
            executor: async () => {
                return;
            },
        });

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({
            started_count: started.length,
            started,
            slots: taskScheduler.listTaskSlots(workspaceId.trim()),
        });
    });

    app.get('/v1/workspaces/:workspaceId/task-slots', async (request, reply) => {
        const { workspaceId } = request.params as { workspaceId: string };
        if (!workspaceId.trim()) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'workspaceId is required.',
            });
        }

        const slots = taskScheduler.listTaskSlots(workspaceId.trim());
        return reply.code(200).send({
            count: slots.length,
            slots,
        });
    });

    app.post('/v1/workspaces/:workspaceId/task-slots/:slotId/park', async (request, reply) => {
        const { workspaceId, slotId } = request.params as { workspaceId: string; slotId: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const reason = body.reason;
        const unblockCondition = body.unblock_condition;

        if (
            reason !== 'waiting_ci'
            && reason !== 'waiting_approval'
            && reason !== 'waiting_answer'
        ) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'reason must be waiting_ci, waiting_approval, or waiting_answer.',
            });
        }

        if (
            unblockCondition !== 'ci_complete'
            && unblockCondition !== 'approval_received'
            && unblockCondition !== 'question_answered'
        ) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'unblock_condition must be ci_complete, approval_received, or question_answered.',
            });
        }

        taskScheduler.parkTaskSlot(workspaceId.trim(), slotId.trim(), reason, unblockCondition);

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({
            workspace_id: workspaceId,
            slot_id: slotId,
            status: 'parked',
        });
    });

    app.post('/v1/workspaces/:workspaceId/task-slots/:slotId/unblock', async (request, reply) => {
        const { workspaceId, slotId } = request.params as { workspaceId: string; slotId: string };
        taskScheduler.unblockTaskSlot(workspaceId.trim(), slotId.trim());

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({
            workspace_id: workspaceId,
            slot_id: slotId,
            status: 'active',
        });
    });

    app.post('/v1/workspaces/:workspaceId/task-slots/:slotId/release', async (request, reply) => {
        const { workspaceId, slotId } = request.params as { workspaceId: string; slotId: string };
        taskScheduler.releaseTaskSlot(workspaceId.trim(), slotId.trim());

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({
            workspace_id: workspaceId,
            slot_id: slotId,
            status: 'idle',
        });
    });

    app.post('/v1/wake/runs/:runId/complete', async (request, reply) => {
        const params = request.params as { runId: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const run = taskScheduler.listRuns().find((entry) => entry.id === params.runId);
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

        const taskId = typeof body.task_id === 'string' ? body.task_id.trim() : '';
        const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
        const actionsTaken = Array.isArray(body.actions_taken)
            ? body.actions_taken.filter((entry): entry is string => typeof entry === 'string')
            : [];
        const connectorsUsed = Array.isArray(body.connectors_used)
            ? body.connectors_used.filter((entry): entry is string => typeof entry === 'string')
            : [];
        const approvalOutcomes = Array.isArray(body.approval_outcomes)
            ? body.approval_outcomes.filter((entry): entry is { action: string; decision: 'approved' | 'rejected'; reason?: string } => {
                if (typeof entry !== 'object' || entry === null) {
                    return false;
                }
                const candidate = entry as Record<string, unknown>;
                return typeof candidate.action === 'string'
                    && (candidate.decision === 'approved' || candidate.decision === 'rejected')
                    && (candidate.reason === undefined || typeof candidate.reason === 'string');
            })
            : [];
        const executionStatus = finalStatus === 'completed'
            ? (approvalOutcomes.some((entry) => entry.decision === 'rejected') ? 'approval_required' : 'success')
            : 'failed';
        const llmProvider = typeof body.llm_provider === 'string' && body.llm_provider.trim()
            ? body.llm_provider.trim()
            : undefined;
        const memoryRecorded = run && taskId && summary
            ? await taskMemoryRecorder({
                tenantId: run.tenantId,
                workspaceId: run.workspaceId,
                taskId,
                correlationId: run.correlationId,
                actionsTaken,
                approvalOutcomes,
                connectorsUsed,
                llmProvider,
                executionStatus,
                summary,
                env,
            })
            : false;

        return reply.code(200).send({ run_id: params.runId, final_status: finalStatus, memory_recorded: memoryRecorded });
    });

    app.post('/v1/agent-handoffs', async (request, reply) => {
        const body = (request.body ?? {}) as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
        const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
        const taskId = typeof body.task_id === 'string' ? body.task_id.trim() : '';
        const fromBotId = typeof body.from_bot_id === 'string' ? body.from_bot_id.trim() : '';
        const toBotId = typeof body.to_bot_id === 'string' ? body.to_bot_id.trim() : '';
        const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

        if (!tenantId || !workspaceId || !taskId || !fromBotId || !toBotId || !reason) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'tenant_id, workspace_id, task_id, from_bot_id, to_bot_id, and reason are required.',
            });
        }

        const correlationId =
            typeof body.correlation_id === 'string' && body.correlation_id.trim()
                ? body.correlation_id.trim()
                : `handoff_${taskId}_${Math.floor(now())}`;
        const handoffContext =
            typeof body.handoff_context === 'object' && body.handoff_context !== null
                ? body.handoff_context as Record<string, unknown>
                : undefined;
        const escalateOnTimeoutMs = typeof body.escalate_on_timeout_ms === 'number'
            && Number.isFinite(body.escalate_on_timeout_ms)
            && body.escalate_on_timeout_ms > 0
            ? Math.floor(body.escalate_on_timeout_ms)
            : undefined;

        const record = handoffManager.createHandoff({
            tenantId,
            workspaceId,
            taskId,
            fromBotId,
            toBotId,
            reason,
            correlationId,
            handoffContext,
            escalateOnTimeoutMs,
            contractVersion: CONTRACT_VERSIONS.AGENT_HANDOFF,
        });

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(201).send({ handoff: record });
    });

    app.get('/v1/agent-handoffs', async (request, reply) => {
        const query = request.query as Record<string, unknown>;
        const tenantId = typeof query.tenant_id === 'string' ? query.tenant_id.trim() : undefined;
        const workspaceId = typeof query.workspace_id === 'string' ? query.workspace_id.trim() : undefined;
        const status = parseAgentHandoffStatus(query.status);
        const limit = typeof query.limit === 'number' ? query.limit : Number.parseInt(String(query.limit ?? ''), 10);

        if (query.status !== undefined && !status) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'status must be one of pending, accepted, completed, failed, timed_out.',
            });
        }

        const handoffs = handoffManager.listHandoffs({
            tenantId,
            workspaceId,
            status: status ?? undefined,
            limit: Number.isFinite(limit) ? limit : undefined,
        });

        return reply.code(200).send({
            count: handoffs.length,
            handoffs,
        });
    });

    app.post('/v1/agent-handoffs/:handoffId/status', async (request, reply) => {
        const params = request.params as { handoffId: string };
        const body = (request.body ?? {}) as Record<string, unknown>;
        const status = parseAgentHandoffStatus(body.status);
        if (!status) {
            return reply.code(400).send({
                error: 'invalid_request',
                message: 'status must be one of pending, accepted, completed, failed, timed_out.',
            });
        }

        const updated = handoffManager.updateStatus({
            handoffId: params.handoffId,
            status,
        });

        if (!updated) {
            return reply.code(404).send({
                error: 'not_found',
                message: 'handoff not found',
            });
        }

        if (!(await persistOrFail(reply))) {
            return;
        }

        return reply.code(200).send({ handoff: updated });
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
        const ciFailures = Array.isArray(body.ci_failures)
            ? body.ci_failures
                .filter((row): row is { workflow_name: string; branch: string; failure_count: number } => {
                    if (typeof row !== 'object' || row === null) {
                        return false;
                    }
                    const candidate = row as Record<string, unknown>;
                    return typeof candidate.workflow_name === 'string'
                        && typeof candidate.branch === 'string'
                        && typeof candidate.failure_count === 'number';
                })
                .map((row) => ({
                    workflowName: row.workflow_name,
                    branch: row.branch,
                    failureCount: row.failure_count,
                }))
            : [];
        const dependencyVulnerabilities = Array.isArray(body.dependency_vulnerabilities)
            ? body.dependency_vulnerabilities
                .filter((row): row is { dependency_name: string; cve_id: string; severity: 'low' | 'medium' | 'high' | 'critical' } => {
                    if (typeof row !== 'object' || row === null) {
                        return false;
                    }
                    const candidate = row as Record<string, unknown>;
                    return typeof candidate.dependency_name === 'string'
                        && typeof candidate.cve_id === 'string'
                        && (candidate.severity === 'low' || candidate.severity === 'medium' || candidate.severity === 'high' || candidate.severity === 'critical');
                })
                .map((row) => ({
                    dependencyName: row.dependency_name,
                    cveId: row.cve_id,
                    severity: row.severity,
                }))
            : [];

        const detected = await routineScheduler.detectProactiveSignals({
            tenantId,
            workspaceId,
            botId,
            correlationId,
            pullRequests,
            tickets,
            budgetUtilizationRatio,
            ciFailures,
            dependencyVulnerabilities,
            stalePrThresholdDays: typeof body.stale_pr_threshold_days === 'number' ? body.stale_pr_threshold_days : undefined,
            staleTicketThresholdHours: typeof body.stale_ticket_threshold_hours === 'number' ? body.stale_ticket_threshold_hours : undefined,
            budgetWarningThreshold: typeof body.budget_warning_threshold === 'number' ? body.budget_warning_threshold : undefined,
            ciFailureThresholdCount: typeof body.ci_failure_threshold_count === 'number' ? body.ci_failure_threshold_count : undefined,
            dependencySeverityThreshold: body.dependency_severity_threshold === 'medium' || body.dependency_severity_threshold === 'high' || body.dependency_severity_threshold === 'critical'
                ? body.dependency_severity_threshold
                : undefined,
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
                message: 'signal_type must be stale_pr, stale_ticket, budget_warning, ci_failure_on_main, or dependency_cve.',
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
