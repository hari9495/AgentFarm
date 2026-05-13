import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type {
    BudgetDecisionRecord,
    BudgetDecisionType,
    BudgetDenialReason,
} from '@agentfarm/shared-types';
import { dispatchOutboundWebhooks } from '../lib/webhook-dispatcher.js';

const BUDGET_LEDGER_SOURCE = 'api-gateway-budget-ledger';
const BUDGET_LEDGER_PREFIX = 'BUDGET_LEDGER:';
const TENANT_BUDGET_DEFAULTS_WORKSPACE_ID = '__tenant_budget_defaults__';

// In-memory budget store: Map<workspaceId, budgetState>
interface WorkspaceBudgetState {
    dailySpent: number;
    dailyLimit: number;
    monthlySpent: number;
    monthlyLimit: number;
    isHardStopActive: boolean;
    lastResetDaily: string; // ISO timestamp of last daily reset
}

type BudgetLedgerEvent = {
    eventType:
    | 'budget_evaluated'
    | 'hard_stop_updated'
    | 'daily_reset'
    | 'budget_limits_updated'
    | 'budget_alert_warn'
    | 'budget_alert_critical'
    | 'budget_alert_exceeded';
    tenantId: string;
    workspaceId: string;
    taskId?: string;
    decision?: BudgetDecisionType;
    denialReason?: BudgetDenialReason;
    estimatedCost?: number;
    isHardStopActive?: boolean;
    reason?: string;
    configScope?: 'tenant' | 'workspace';
    dailyLimit?: number;
    monthlyLimit?: number;
    stateAfter: WorkspaceBudgetState;
    occurredAt: string;
};

const budgetStore = new Map<string, WorkspaceBudgetState>();

// Budget alert thresholds (fraction of daily limit). Configurable via env vars.
const BUDGET_WARN_PCT = Number(process.env['BUDGET_ALERT_WARN_PCT'] ?? 80) / 100;
const BUDGET_CRITICAL_PCT = Number(process.env['BUDGET_ALERT_CRITICAL_PCT'] ?? 90) / 100;
const BUDGET_EXCEEDED_PCT = Number(process.env['BUDGET_ALERT_EXCEEDED_PCT'] ?? 100) / 100;

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type BudgetPolicyOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    budgetStore?: Map<string, WorkspaceBudgetState>;
    repo?: BudgetPolicyRepo;
    prisma?: PrismaClient;
};

type BudgetPolicyRepo = {
    loadBudgetState(input: {
        tenantId: string;
        workspaceId: string;
    }): Promise<WorkspaceBudgetState | null>;
    loadBudgetConfig(input: {
        tenantId: string;
        workspaceId: string;
    }): Promise<{ dailyLimit: number; monthlyLimit: number; scope: 'tenant' | 'workspace' } | null>;
    appendBudgetEvent(input: {
        tenantId: string;
        workspaceId: string;
        storageWorkspaceId?: string;
        correlationId: string;
        event: BudgetLedgerEvent;
    }): Promise<void>;
};

type BudgetEvaluateRequest = {
    taskId: string;
    estimatedCost?: number;
    claimToken?: string;
    leaseId?: string;
    correlationId?: string;
};

type BudgetHardStopRequest = {
    isActive: boolean;
    reason?: string;
};

type BudgetLimitsRequest = {
    scope?: 'tenant' | 'workspace';
    dailyLimit?: number;
    monthlyLimit?: number;
    reason?: string;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

const defaultRepo: BudgetPolicyRepo = {
    async loadBudgetState(input) {
        const prisma = await getPrisma();
        const events = await prisma.auditEvent.findMany({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                sourceSystem: BUDGET_LEDGER_SOURCE,
                summary: {
                    startsWith: BUDGET_LEDGER_PREFIX,
                },
            },
            orderBy: {
                createdAt: 'asc',
            },
            select: {
                summary: true,
            },
        });

        let latest: WorkspaceBudgetState | null = null;
        for (const event of events) {
            const encoded = event.summary.slice(BUDGET_LEDGER_PREFIX.length);
            try {
                const parsed = JSON.parse(encoded) as BudgetLedgerEvent;
                if (parsed.stateAfter) {
                    latest = parsed.stateAfter;
                }
            } catch {
                // Keep scanning; malformed ledger lines should not block state reconstruction.
            }
        }

        return latest;
    },
    async loadBudgetConfig(input) {
        const prisma = await getPrisma();
        const events = await prisma.auditEvent.findMany({
            where: {
                tenantId: input.tenantId,
                sourceSystem: BUDGET_LEDGER_SOURCE,
                summary: {
                    startsWith: BUDGET_LEDGER_PREFIX,
                },
                OR: [
                    { workspaceId: input.workspaceId },
                    { workspaceId: TENANT_BUDGET_DEFAULTS_WORKSPACE_ID },
                ],
            },
            orderBy: {
                createdAt: 'asc',
            },
            select: {
                summary: true,
                workspaceId: true,
            },
        });

        let tenantConfig: { dailyLimit: number; monthlyLimit: number; scope: 'tenant' | 'workspace' } | null = null;
        let workspaceConfig: { dailyLimit: number; monthlyLimit: number; scope: 'tenant' | 'workspace' } | null = null;

        for (const event of events) {
            const encoded = event.summary.slice(BUDGET_LEDGER_PREFIX.length);
            try {
                const parsed = JSON.parse(encoded) as BudgetLedgerEvent;
                if (
                    parsed.eventType !== 'budget_limits_updated'
                    || typeof parsed.dailyLimit !== 'number'
                    || typeof parsed.monthlyLimit !== 'number'
                ) {
                    continue;
                }

                const nextConfig = {
                    dailyLimit: parsed.dailyLimit,
                    monthlyLimit: parsed.monthlyLimit,
                    scope: parsed.configScope === 'tenant' ? 'tenant' : 'workspace',
                } as const;

                if (event.workspaceId === TENANT_BUDGET_DEFAULTS_WORKSPACE_ID) {
                    tenantConfig = nextConfig;
                } else if (event.workspaceId === input.workspaceId) {
                    workspaceConfig = nextConfig;
                }
            } catch {
                // Ignore malformed ledger lines.
            }
        }

        return workspaceConfig ?? tenantConfig;
    },
    async appendBudgetEvent(input) {
        const prisma = await getPrisma();
        await prisma.auditEvent.create({
            data: {
                tenantId: input.tenantId,
                workspaceId: input.storageWorkspaceId ?? input.workspaceId,
                botId: 'budget-policy',
                eventType: 'audit_event',
                severity: 'info',
                sourceSystem: BUDGET_LEDGER_SOURCE,
                correlationId: input.correlationId,
                summary: `${BUDGET_LEDGER_PREFIX}${JSON.stringify(input.event)}`,
            },
        });
    },
};

const noopRepo: BudgetPolicyRepo = {
    async loadBudgetState() {
        return null;
    },
    async loadBudgetConfig() {
        return null;
    },
    async appendBudgetEvent() {
        return;
    },
};

const buildDefaultBudgetState = (): WorkspaceBudgetState => ({
    dailySpent: 0,
    dailyLimit: 100,
    monthlySpent: 0,
    monthlyLimit: 1000,
    isHardStopActive: false,
    lastResetDaily: new Date().toISOString(),
});

// Helper to get or initialize workspace budget state
function getBudgetState(
    workspaceId: string,
    store: Map<string, WorkspaceBudgetState>
): WorkspaceBudgetState {
    if (!store.has(workspaceId)) {
        store.set(workspaceId, buildDefaultBudgetState());
    }
    return store.get(workspaceId)!;
}

// Helper to check if daily budget needs reset (if it's a new day)
function resetDailyBudgetIfNeeded(state: WorkspaceBudgetState): boolean {
    const lastReset = new Date(state.lastResetDaily);
    const today = new Date();
    if (lastReset.toDateString() !== today.toDateString()) {
        state.dailySpent = 0;
        state.lastResetDaily = today.toISOString();
        return true;
    }
    return false;
}

export async function registerBudgetPolicyRoutes(
    app: FastifyInstance,
    options: BudgetPolicyOptions
) {
    // Use provided budget store or default to global
    const store = options.budgetStore ?? budgetStore;
    const repo = options.repo ?? (options.budgetStore ? noopRepo : defaultRepo);
    const resolvePrismaForDispatch = () =>
        options.prisma ? Promise.resolve(options.prisma) : getPrisma();

    const loadBudgetState = async (
        tenantId: string,
        workspaceId: string,
    ): Promise<WorkspaceBudgetState> => {
        if (!store.has(workspaceId)) {
            const persisted = await repo.loadBudgetState({ tenantId, workspaceId });
            if (persisted) {
                store.set(workspaceId, persisted);
            }
        }

        const state = getBudgetState(workspaceId, store);
        const config = await repo.loadBudgetConfig({ tenantId, workspaceId });
        if (config) {
            state.dailyLimit = config.dailyLimit;
            state.monthlyLimit = config.monthlyLimit;
        }

        return state;
    };

    const appendLedgerEvent = async (input: {
        tenantId: string;
        workspaceId: string;
        storageWorkspaceId?: string;
        correlationId: string;
        event: BudgetLedgerEvent;
    }): Promise<void> => {
        await repo.appendBudgetEvent(input);
    };

    const resolveScope = (
        request: FastifyRequest,
        workspaceId: string
    ): {
        ok: boolean;
        tenantId?: string;
        message?: string;
    } => {
        const session = options.getSession(request);
        if (session) {
            if (!session.workspaceIds.includes(workspaceId)) {
                return {
                    ok: false,
                    message: 'workspace_id is not in your authenticated session scope.',
                };
            }

            if (session.scope !== 'internal') {
                return {
                    ok: false,
                    message: 'Internal session required for budget policy routes.',
                };
            }

            return {
                ok: true,
                tenantId: session.tenantId,
            };
        }

        return {
            ok: false,
            message: 'Authentication required for budget policy routes.',
        };
    };
    /**
     * POST /v1/workspaces/:workspaceId/budget/evaluate
     * Evaluate a task against workspace budget policies.
     */
    app.post<{ Params: { workspaceId: string }; Body: BudgetEvaluateRequest }>(
        '/v1/workspaces/:workspaceId/budget/evaluate',
        async (request, reply) => {
            try {
                const { workspaceId } = request.params;
                const {
                    taskId,
                    estimatedCost = 0,
                    claimToken,
                    leaseId,
                    correlationId,
                } = request.body;

                const scope = resolveScope(request, workspaceId);
                if (!scope.ok || !scope.tenantId) {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: scope.message,
                    });
                }

                // Validate required fields
                if (!taskId) {
                    return reply.code(400).send({
                        error: 'invalid_request',
                        message: 'taskId is required',
                    });
                }

                // Get workspace budget state
                const budgetState = await loadBudgetState(scope.tenantId, workspaceId);
                const didResetDaily = resetDailyBudgetIfNeeded(budgetState);
                const eventCorrelationId = correlationId?.trim() || `budget_evaluate_${taskId}_${Date.now()}`;
                if (didResetDaily) {
                    await appendLedgerEvent({
                        tenantId: scope.tenantId,
                        workspaceId,
                        correlationId: eventCorrelationId,
                        event: {
                            eventType: 'daily_reset',
                            tenantId: scope.tenantId,
                            workspaceId,
                            stateAfter: { ...budgetState },
                            occurredAt: new Date().toISOString(),
                        },
                    });
                }

                // Evaluate budget decision
                let decision: BudgetDecisionType = 'allowed';
                let denialReason: BudgetDenialReason | undefined;

                // Check hard-stop first
                if (budgetState.isHardStopActive) {
                    decision = 'denied';
                    denialReason = 'hard_stop_active';
                }
                // Check monthly limit
                else if (
                    budgetState.monthlySpent + estimatedCost >
                    budgetState.monthlyLimit
                ) {
                    decision = 'denied';
                    denialReason = 'monthly_limit_exceeded';
                }
                // Check daily limit
                else if (
                    budgetState.dailySpent + estimatedCost >
                    budgetState.dailyLimit
                ) {
                    decision = 'denied';
                    denialReason = 'daily_limit_exceeded';
                }
                // Check if approaching limits (warning state)
                else if (
                    budgetState.dailySpent + estimatedCost >
                    budgetState.dailyLimit * BUDGET_WARN_PCT
                ) {
                    decision = 'warning';
                }

                const decisionRecord: BudgetDecisionRecord = {
                    id: `budget_${taskId}_${Date.now()}`,
                    tenantId: scope.tenantId,
                    workspaceId: workspaceId,
                    taskId,
                    decision,
                    denialReason,
                    limitScope: 'tenant_daily',
                    limitType: 'usd_spend',
                    limitValue: budgetState.dailyLimit,
                    currentSpend: budgetState.dailySpent,
                    remainingBudget: Math.max(
                        0,
                        budgetState.dailyLimit - budgetState.dailySpent
                    ),
                    isHardStopActive: budgetState.isHardStopActive,
                    workspaceBudgetState: {
                        dailySpent: budgetState.dailySpent,
                        monthlySpent: budgetState.monthlySpent,
                        dailyLimit: budgetState.dailyLimit,
                        monthlyLimit: budgetState.monthlyLimit,
                    },
                    claimToken,
                    leaseId,
                    correlationId: eventCorrelationId,
                    createdAt: new Date().toISOString(),
                    decidedAt: new Date().toISOString(),
                };

                // If allowed or warning, increment spend tracking
                if (decision !== 'denied') {
                    budgetState.dailySpent += estimatedCost;
                    budgetState.monthlySpent += estimatedCost;
                }

                await appendLedgerEvent({
                    tenantId: scope.tenantId,
                    workspaceId,
                    correlationId: eventCorrelationId,
                    event: {
                        eventType: 'budget_evaluated',
                        tenantId: scope.tenantId,
                        workspaceId,
                        taskId,
                        decision,
                        denialReason,
                        estimatedCost,
                        stateAfter: { ...budgetState },
                        occurredAt: new Date().toISOString(),
                    },
                });

                // Threshold alert dispatch — fires for allowed/warning decisions only; highest threshold wins
                if (decision !== 'denied' && budgetState.dailyLimit > 0) {
                    const spendRatio = budgetState.dailySpent / budgetState.dailyLimit;
                    const alertBase = {
                        tenantId: scope.tenantId,
                        workspaceId,
                        taskId,
                        estimatedCost,
                        stateAfter: { ...budgetState },
                        occurredAt: new Date().toISOString(),
                    };
                    if (spendRatio >= BUDGET_EXCEEDED_PCT) {
                        await appendLedgerEvent({
                            tenantId: scope.tenantId,
                            workspaceId,
                            correlationId: eventCorrelationId,
                            event: { eventType: 'budget_alert_exceeded', ...alertBase },
                        });
                        void resolvePrismaForDispatch().then((db) => dispatchOutboundWebhooks({
                            tenantId: scope.tenantId!,
                            workspaceId,
                            eventType: 'budget_alert_exceeded',
                            taskId,
                            payload: { ...alertBase },
                            timestamp: new Date().toISOString(),
                        }, db));
                    } else if (spendRatio >= BUDGET_CRITICAL_PCT) {
                        await appendLedgerEvent({
                            tenantId: scope.tenantId,
                            workspaceId,
                            correlationId: eventCorrelationId,
                            event: { eventType: 'budget_alert_critical', ...alertBase },
                        });
                        void resolvePrismaForDispatch().then((db) => dispatchOutboundWebhooks({
                            tenantId: scope.tenantId!,
                            workspaceId,
                            eventType: 'budget_alert_critical',
                            taskId,
                            payload: { ...alertBase },
                            timestamp: new Date().toISOString(),
                        }, db));
                    } else if (spendRatio >= BUDGET_WARN_PCT) {
                        await appendLedgerEvent({
                            tenantId: scope.tenantId,
                            workspaceId,
                            correlationId: eventCorrelationId,
                            event: { eventType: 'budget_alert_warn', ...alertBase },
                        });
                        void resolvePrismaForDispatch().then((db) => dispatchOutboundWebhooks({
                            tenantId: scope.tenantId!,
                            workspaceId,
                            eventType: 'budget_alert_warn',
                            taskId,
                            payload: { ...alertBase },
                            timestamp: new Date().toISOString(),
                        }, db));
                    }
                }

                reply.code(200).send(decisionRecord);
            } catch (error) {
                reply.code(500).send({
                    error: 'budget_evaluation_failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    );

    /**
     * PUT /v1/workspaces/:workspaceId/budget/hard-stop
     * Activate or deactivate hard-stop for a workspace.
     */
    app.put<{ Params: { workspaceId: string }; Body: BudgetHardStopRequest }>(
        '/v1/workspaces/:workspaceId/budget/hard-stop',
        async (request, reply) => {
            try {
                const { workspaceId } = request.params;
                const { isActive } = request.body;

                const scope = resolveScope(request, workspaceId);
                if (!scope.ok || !scope.tenantId) {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: scope.message,
                    });
                }

                const budgetState = await loadBudgetState(scope.tenantId, workspaceId);
                budgetState.isHardStopActive = isActive === true;
                const hardStopCorrelationId = `budget_hard_stop_${workspaceId}_${Date.now()}`;
                await appendLedgerEvent({
                    tenantId: scope.tenantId,
                    workspaceId,
                    correlationId: hardStopCorrelationId,
                    event: {
                        eventType: 'hard_stop_updated',
                        tenantId: scope.tenantId,
                        workspaceId,
                        isHardStopActive: budgetState.isHardStopActive,
                        reason: request.body?.reason,
                        stateAfter: { ...budgetState },
                        occurredAt: new Date().toISOString(),
                    },
                });

                reply.code(200).send({
                    workspaceId,
                    isHardStopActive: budgetState.isHardStopActive,
                    updatedAt: new Date().toISOString(),
                });
            } catch (error) {
                reply.code(500).send({
                    error: 'hard_stop_update_failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    );

    app.put<{ Params: { workspaceId: string }; Body: BudgetLimitsRequest }>(
        '/v1/workspaces/:workspaceId/budget/limits',
        async (request, reply) => {
            try {
                const { workspaceId } = request.params;
                const scope = resolveScope(request, workspaceId);
                if (!scope.ok || !scope.tenantId) {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: scope.message,
                    });
                }

                const budgetState = await loadBudgetState(scope.tenantId, workspaceId);
                const nextDailyLimit = request.body?.dailyLimit ?? budgetState.dailyLimit;
                const nextMonthlyLimit = request.body?.monthlyLimit ?? budgetState.monthlyLimit;
                if (!Number.isFinite(nextDailyLimit) || nextDailyLimit <= 0 || !Number.isFinite(nextMonthlyLimit) || nextMonthlyLimit <= 0) {
                    return reply.code(400).send({
                        error: 'invalid_budget_limits',
                        message: 'dailyLimit and monthlyLimit must be positive numbers.',
                    });
                }

                const configScope = request.body?.scope === 'tenant' ? 'tenant' : 'workspace';
                budgetState.dailyLimit = nextDailyLimit;
                budgetState.monthlyLimit = nextMonthlyLimit;
                const limitsCorrelationId = `budget_limits_${configScope}_${workspaceId}_${Date.now()}`;

                await appendLedgerEvent({
                    tenantId: scope.tenantId,
                    workspaceId,
                    storageWorkspaceId:
                        configScope === 'tenant' ? TENANT_BUDGET_DEFAULTS_WORKSPACE_ID : workspaceId,
                    correlationId: limitsCorrelationId,
                    event: {
                        eventType: 'budget_limits_updated',
                        tenantId: scope.tenantId,
                        workspaceId,
                        configScope,
                        dailyLimit: nextDailyLimit,
                        monthlyLimit: nextMonthlyLimit,
                        reason: request.body?.reason,
                        stateAfter: { ...budgetState },
                        occurredAt: new Date().toISOString(),
                    },
                });

                return reply.code(200).send({
                    workspaceId,
                    scope: configScope,
                    dailyLimit: nextDailyLimit,
                    monthlyLimit: nextMonthlyLimit,
                    updatedAt: new Date().toISOString(),
                });
            } catch (error) {
                return reply.code(500).send({
                    error: 'budget_limits_update_failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        },
    );

    app.get<{ Params: { workspaceId: string } }>(
        '/v1/workspaces/:workspaceId/budget/limits',
        async (request, reply) => {
            try {
                const { workspaceId } = request.params;
                const scope = resolveScope(request, workspaceId);
                if (!scope.ok || !scope.tenantId) {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: scope.message,
                    });
                }

                const budgetState = await loadBudgetState(scope.tenantId, workspaceId);
                const config = await repo.loadBudgetConfig({ tenantId: scope.tenantId, workspaceId });

                return reply.code(200).send({
                    workspaceId,
                    scope: config?.scope ?? 'workspace',
                    dailyLimit: budgetState.dailyLimit,
                    monthlyLimit: budgetState.monthlyLimit,
                });
            } catch (error) {
                return reply.code(500).send({
                    error: 'budget_limits_retrieval_failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        },
    );

    /**
     * GET /v1/workspaces/:workspaceId/budget/state
     * Retrieve current budget state for a workspace.
     */
    app.get<{ Params: { workspaceId: string } }>(
        '/v1/workspaces/:workspaceId/budget/state',
        async (request, reply) => {
            try {
                const { workspaceId } = request.params;

                const scope = resolveScope(request, workspaceId);
                if (!scope.ok || !scope.tenantId) {
                    return reply.code(403).send({
                        error: 'forbidden',
                        message: scope.message,
                    });
                }

                const budgetState = await loadBudgetState(scope.tenantId, workspaceId);
                const didResetDaily = resetDailyBudgetIfNeeded(budgetState);
                if (didResetDaily) {
                    await appendLedgerEvent({
                        tenantId: scope.tenantId,
                        workspaceId,
                        correlationId: `budget_state_daily_reset_${workspaceId}_${Date.now()}`,
                        event: {
                            eventType: 'daily_reset',
                            tenantId: scope.tenantId,
                            workspaceId,
                            stateAfter: { ...budgetState },
                            occurredAt: new Date().toISOString(),
                        },
                    });
                }

                reply.code(200).send({
                    workspaceId,
                    dailySpent: budgetState.dailySpent,
                    dailyLimit: budgetState.dailyLimit,
                    monthlySpent: budgetState.monthlySpent,
                    monthlyLimit: budgetState.monthlyLimit,
                    isHardStopActive: budgetState.isHardStopActive,
                    lastResetDaily: budgetState.lastResetDaily,
                });
            } catch (error) {
                reply.code(500).send({
                    error: 'budget_state_retrieval_failed',
                    message: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    );
}
