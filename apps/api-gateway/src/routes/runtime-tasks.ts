import { randomUUID } from 'crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { TaskLeaseRecord } from '@agentfarm/shared-types';
import { parseGoal } from '@agentfarm/agent-runtime/natural-language-parser.js';
import { rateLimitAgent, getAgentRateLimitConfig } from '../lib/agent-rate-limit.js';
import { isAllowed as cbIsAllowed, recordSuccess as cbRecordSuccess, recordFailure as cbRecordFailure } from '../lib/circuit-breaker.js';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type RuntimeTaskLease = TaskLeaseRecord;

type LeaseStore = {
    byTaskKey: Map<string, RuntimeTaskLease>;
    byClaimToken: Map<string, RuntimeTaskLease>;
};

type RuntimeTaskRepo = {
    findRuntimeEndpoint(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
    }): Promise<string | null>;
    createAuditEvent(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        summary: string;
        correlationId: string;
        severity?: 'info' | 'warn' | 'error';
    }): Promise<void>;
    createActionRecord(input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        actionType: string;
        riskLevel: 'low' | 'medium' | 'high';
        policyPackVersion: string;
        inputSummary: string;
        outputSummary: string | null;
        status: 'pending' | 'executing' | 'completed' | 'failed' | 'rejected';
        connectorType: string | null;
        correlationId: string;
        completedAt?: Date;
    }): Promise<void>;
};

type RuntimeTaskDispatcher = (input: {
    runtimeEndpoint: string;
    runtimeTaskToken: string | null;
    taskId: string;
    payload: Record<string, unknown>;
    lease: RuntimeTaskLease;
    claimToken: string;
}) => Promise<{
    ok: boolean;
    statusCode: number;
    errorMessage?: string;
}>;

type RegisterRuntimeTaskRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: RuntimeTaskRepo;
    now?: () => number;
    leaseStore?: LeaseStore;
    serviceAuthToken?: string;
    runtimeTaskToken?: string;
    dispatcher?: RuntimeTaskDispatcher;
    prisma?: PrismaClient;
    listTaskRecords?: (
        workspaceId: string,
        limit: number,
        cursor?: string,
    ) => Promise<{
        tasks: Array<{
            id: string;
            taskId: string;
            modelProvider: string;
            modelProfile: string;
            outcome: string;
            latencyMs: number;
            estimatedCostUsd: number | null;
            modelTier: string | null;
            executedAt: Date;
        }>;
        nextCursor: string | null;
    }>;
};

type RuntimeTaskParams = {
    workspaceId: string;
};

type RuntimeTaskWithIdParams = {
    workspaceId: string;
    taskId: string;
};

type ClaimBody = {
    tenant_id?: string;
    bot_id?: string;
    task_id?: string;
    idempotency_key?: string;
    claimed_by?: string;
    lease_ttl_seconds?: number;
    correlation_id?: string;
};

type RenewBody = {
    tenant_id?: string;
    bot_id?: string;
    claim_token?: string;
    lease_ttl_seconds?: number;
    correlation_id?: string;
};

type ReleaseBody = {
    tenant_id?: string;
    bot_id?: string;
    claim_token?: string;
    correlation_id?: string;
};

type DispatchBody = {
    tenant_id?: string;
    bot_id?: string;
    claim_token?: string;
    payload?: Record<string, unknown>;
    correlation_id?: string;
};

type BudgetDispatchMetadata = {
    decision?: 'allowed' | 'denied' | 'warning';
    denialReason?: string;
    limitScope?: string;
    limitType?: string;
};

type RequeueMetadata = {
    requeuedFromExpiredLease: boolean;
    previousLeaseId?: string;
    previousCorrelationId?: string;
};

const DEFAULT_LEASE_TTL_SECONDS = 60;
const MIN_LEASE_TTL_SECONDS = 5;
const MAX_LEASE_TTL_SECONDS = 3600;

const buildTaskKey = (tenantId: string, workspaceId: string, botId: string, taskId: string): string => {
    return `${tenantId}:${workspaceId}:${botId}:${taskId}`;
};

const parseLeaseTtlSeconds = (value: unknown): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_LEASE_TTL_SECONDS;
    }

    return Math.min(MAX_LEASE_TTL_SECONDS, Math.max(MIN_LEASE_TTL_SECONDS, Math.floor(value)));
};

const readBudgetDispatchMetadata = (payload: Record<string, unknown>): BudgetDispatchMetadata => {
    const decisionValue = payload['_budget_decision'];
    const decision =
        decisionValue === 'allowed' || decisionValue === 'denied' || decisionValue === 'warning'
            ? decisionValue
            : undefined;

    const denialReason = typeof payload['_budget_denial_reason'] === 'string'
        ? payload['_budget_denial_reason']
        : undefined;
    const limitScope = typeof payload['_budget_limit_scope'] === 'string'
        ? payload['_budget_limit_scope']
        : undefined;
    const limitType = typeof payload['_budget_limit_type'] === 'string'
        ? payload['_budget_limit_type']
        : undefined;

    return {
        decision,
        denialReason,
        limitScope,
        limitType,
    };
};

const buildBudgetEvidenceSuffix = (metadata: BudgetDispatchMetadata): string => {
    if (!metadata.decision) {
        return '';
    }

    const parts = [`budget_decision=${metadata.decision}`];
    if (metadata.denialReason) {
        parts.push(`budget_denial_reason=${metadata.denialReason}`);
    }
    if (metadata.limitScope) {
        parts.push(`budget_limit_scope=${metadata.limitScope}`);
    }
    if (metadata.limitType) {
        parts.push(`budget_limit_type=${metadata.limitType}`);
    }

    return ` ${parts.join(' ')}`;
};

const readServiceToken = (request: FastifyRequest): string | null => {
    const direct = request.headers['x-runtime-dispatch-token'];
    if (typeof direct === 'string' && direct.trim()) {
        return direct.trim();
    }

    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
        return authHeader.slice(7).trim();
    }

    return null;
};

const defaultRepo: RuntimeTaskRepo = {
    async findRuntimeEndpoint(input) {
        const prisma = await getPrisma();
        const runtime = await prisma.runtimeInstance.findFirst({
            where: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                botId: input.botId,
                endpoint: {
                    not: null,
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });

        return runtime?.endpoint ?? null;
    },
    async createAuditEvent(input) {
        const prisma = await getPrisma();
        await prisma.auditEvent.create({
            data: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                botId: input.botId,
                eventType: 'audit_event',
                severity: input.severity ?? 'info',
                summary: input.summary,
                sourceSystem: 'api-gateway-control-plane',
                correlationId: input.correlationId,
            },
        });
    },
    async createActionRecord(input) {
        const prisma = await getPrisma();
        await prisma.actionRecord.create({
            data: {
                tenantId: input.tenantId,
                workspaceId: input.workspaceId,
                botId: input.botId,
                actionType: input.actionType,
                riskLevel: input.riskLevel,
                policyPackVersion: input.policyPackVersion,
                inputSummary: input.inputSummary,
                outputSummary: input.outputSummary,
                status: input.status,
                connectorType: input.connectorType,
                correlationId: input.correlationId,
                completedAt: input.completedAt,
            },
        });
    },
};

const defaultDispatcher: RuntimeTaskDispatcher = async (input) => {
    try {
        const claimUrl = new URL('/tasks/claim', input.runtimeEndpoint).toString();
        const claimResponse = await fetch(claimUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(input.runtimeTaskToken ? { 'x-runtime-task-token': input.runtimeTaskToken } : {}),
            },
            body: JSON.stringify({
                task_id: input.taskId,
                idempotency_key: input.lease.idempotencyKey,
                claimed_by: input.lease.claimedBy,
                lease_ttl_seconds: Math.max(1, Math.floor((Date.parse(input.lease.expiresAt) - Date.now()) / 1000)),
                correlation_id: input.lease.correlationId,
            }),
            signal: AbortSignal.timeout(4_000),
        });

        if (!claimResponse.ok) {
            let errorMessage = `runtime_claim_failed:${claimResponse.status}`;
            try {
                const payload = await claimResponse.json() as { message?: string; error?: string };
                errorMessage = payload.message ?? payload.error ?? errorMessage;
            } catch {
                // keep default message
            }
            return {
                ok: false,
                statusCode: claimResponse.status,
                errorMessage,
            };
        }

        const intakeUrl = new URL('/tasks/intake', input.runtimeEndpoint).toString();
        const intakeResponse = await fetch(intakeUrl, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(input.runtimeTaskToken ? { 'x-runtime-task-token': input.runtimeTaskToken } : {}),
            },
            body: JSON.stringify({
                task_id: input.taskId,
                payload: {
                    ...input.payload,
                    _claim_token: input.claimToken,
                    _lease: {
                        lease_id: input.lease.leaseId,
                        idempotency_key: input.lease.idempotencyKey,
                        claimed_by: input.lease.claimedBy,
                        claimed_at: input.lease.claimedAt,
                        expires_at: input.lease.expiresAt,
                        correlation_id: input.lease.correlationId,
                        status: input.lease.status,
                    },
                },
            }),
            signal: AbortSignal.timeout(6_000),
        });

        if (!intakeResponse.ok) {
            let errorMessage = `runtime_intake_failed:${intakeResponse.status}`;
            try {
                const payload = await intakeResponse.json() as { message?: string; error?: string };
                errorMessage = payload.message ?? payload.error ?? errorMessage;
            } catch {
                // keep default message
            }

            return {
                ok: false,
                statusCode: intakeResponse.status,
                errorMessage,
            };
        }

        return {
            ok: true,
            statusCode: intakeResponse.status,
        };
    } catch (err: unknown) {
        return {
            ok: false,
            statusCode: 0,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
};

export async function registerRuntimeTaskRoutes(
    app: FastifyInstance,
    options: RegisterRuntimeTaskRoutesOptions,
): Promise<void> {
    const now = options.now ?? (() => Date.now());
    const serviceAuthToken =
        options.serviceAuthToken
        ?? process.env.AGENTFARM_RUNTIME_DISPATCH_SHARED_TOKEN
        ?? process.env.RUNTIME_DISPATCH_SHARED_TOKEN
        ?? process.env.AF_RUNTIME_DISPATCH_SHARED_TOKEN
        ?? null;
    const runtimeTaskToken =
        options.runtimeTaskToken
        ?? process.env.AGENTFARM_RUNTIME_TASK_SHARED_TOKEN
        ?? process.env.RUNTIME_TASK_SHARED_TOKEN
        ?? process.env.AF_RUNTIME_TASK_SHARED_TOKEN
        ?? null;
    const repo = options.repo ?? defaultRepo;
    const dispatcher = options.dispatcher ?? defaultDispatcher;
    const resolvePrisma = options.prisma ? () => Promise.resolve(options.prisma!) : getPrisma;
    const leaseStore: LeaseStore = options.leaseStore ?? {
        byTaskKey: new Map<string, RuntimeTaskLease>(),
        byClaimToken: new Map<string, RuntimeTaskLease>(),
    };

    const resolveScope = (request: FastifyRequest, workspaceId: string, tenantIdFromBody?: string): {
        ok: boolean;
        tenantId?: string;
        message?: string;
        botIdFromSession?: string;
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
                    message: 'Internal session required for runtime control-plane task routes.',
                };
            }

            return {
                ok: true,
                tenantId: session.tenantId,
            };
        }

        if (!serviceAuthToken) {
            return {
                ok: false,
                message: 'A valid internal session or service token is required.',
            };
        }

        const providedToken = readServiceToken(request);
        if (!providedToken || providedToken !== serviceAuthToken) {
            return {
                ok: false,
                message: 'Missing or invalid runtime dispatch token.',
            };
        }

        if (!tenantIdFromBody || !tenantIdFromBody.trim()) {
            return {
                ok: false,
                message: 'tenant_id is required for service-authenticated requests.',
            };
        }

        return {
            ok: true,
            tenantId: tenantIdFromBody.trim(),
        };
    };

    app.post<{ Params: RuntimeTaskParams; Body: ClaimBody }>('/v1/workspaces/:workspaceId/runtime/tasks/claim', async (request, reply) => {
        const workspaceId = request.params.workspaceId;
        const scope = resolveScope(request, workspaceId, request.body?.tenant_id);
        if (!scope.ok || !scope.tenantId) {
            return reply.code(403).send({
                error: 'forbidden',
                message: scope.message,
            });
        }

        const botId = request.body?.bot_id?.trim();
        const taskId = request.body?.task_id?.trim();
        const idempotencyKey = request.body?.idempotency_key?.trim();
        if (!botId || !taskId || !idempotencyKey) {
            return reply.code(400).send({
                error: 'invalid_claim',
                message: 'bot_id, task_id, and idempotency_key are required.',
            });
        }

        const taskKey = buildTaskKey(scope.tenantId, workspaceId, botId, taskId);
        const nowMs = now();
        const existing = leaseStore.byTaskKey.get(taskKey);
        const requeueMetadata: RequeueMetadata = {
            requeuedFromExpiredLease: false,
        };
        if (existing && existing.status === 'claimed' && Date.parse(existing.expiresAt) > nowMs) {
            if (existing.idempotencyKey === idempotencyKey) {
                return reply.code(200).send({
                    status: 'already_claimed',
                    task_id: taskId,
                    lease_id: existing.leaseId,
                    claim_token: existing.claimedBy,
                    expires_at: existing.expiresAt,
                });
            }

            return reply.code(409).send({
                error: 'task_claim_conflict',
                conflict_code: 'active_lease_conflict',
                message: 'Task is currently claimed by another idempotency key.',
                lease_id: existing.leaseId,
                expires_at: existing.expiresAt,
            });
        }

        if (existing && existing.status === 'claimed' && Date.parse(existing.expiresAt) <= nowMs) {
            const expiredLease: RuntimeTaskLease = {
                ...existing,
                status: 'expired',
                releasedAt: new Date(nowMs).toISOString(),
            };

            leaseStore.byTaskKey.set(taskKey, expiredLease);
            leaseStore.byClaimToken.set(expiredLease.claimedBy, expiredLease);

            requeueMetadata.requeuedFromExpiredLease = true;
            requeueMetadata.previousLeaseId = existing.leaseId;
            requeueMetadata.previousCorrelationId = existing.correlationId;

            const expiryCorrelationId = existing.correlationId || `task_expire_${taskId}_${Math.floor(nowMs)}`;
            await repo.createAuditEvent({
                tenantId: scope.tenantId,
                workspaceId,
                botId,
                summary: `Runtime task lease expired task_id=${taskId} lease_id=${existing.leaseId} claim_token=${existing.claimedBy} requeue=ready`,
                correlationId: expiryCorrelationId,
                severity: 'warn',
            });
        }

        const leaseTtlSeconds = parseLeaseTtlSeconds(request.body?.lease_ttl_seconds);
        const correlationId = request.body?.correlation_id?.trim()
            || requeueMetadata.previousCorrelationId
            || `task_claim_${taskId}_${Math.floor(nowMs)}`;
        const claimToken = randomUUID();

        const lease: RuntimeTaskLease = {
            leaseId: `${taskKey}:${nowMs}`,
            taskId,
            tenantId: scope.tenantId,
            workspaceId,
            idempotencyKey,
            status: 'claimed',
            claimedBy: claimToken,
            claimedAt: new Date(nowMs).toISOString(),
            expiresAt: new Date(nowMs + (leaseTtlSeconds * 1000)).toISOString(),
            correlationId,
            lastRenewedAt: new Date(nowMs).toISOString(),
        };

        leaseStore.byTaskKey.set(taskKey, lease);
        leaseStore.byClaimToken.set(claimToken, lease);

        await repo.createAuditEvent({
            tenantId: scope.tenantId,
            workspaceId,
            botId,
            summary: `Runtime task lease claimed task_id=${taskId} lease_id=${lease.leaseId} claim_token=${claimToken}`,
            correlationId,
        });

        return reply.code(200).send({
            status: 'claimed',
            task_id: taskId,
            lease_id: lease.leaseId,
            claim_token: claimToken,
            idempotency_key: idempotencyKey,
            claimed_at: lease.claimedAt,
            expires_at: lease.expiresAt,
            correlation_id: correlationId,
            requeued_from_expired_lease: requeueMetadata.requeuedFromExpiredLease,
            previous_lease_id: requeueMetadata.previousLeaseId ?? null,
            previous_correlation_id: requeueMetadata.previousCorrelationId ?? null,
        });
    });

    app.post<{ Params: RuntimeTaskWithIdParams; Body: RenewBody }>('/v1/workspaces/:workspaceId/runtime/tasks/:taskId/lease/renew', async (request, reply) => {
        const workspaceId = request.params.workspaceId;
        const taskId = request.params.taskId;
        const scope = resolveScope(request, workspaceId, request.body?.tenant_id);
        if (!scope.ok || !scope.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: scope.message });
        }

        const botId = request.body?.bot_id?.trim();
        const claimToken = request.body?.claim_token?.trim();
        if (!botId || !claimToken) {
            return reply.code(400).send({
                error: 'invalid_renew',
                message: 'bot_id and claim_token are required.',
            });
        }

        const taskKey = buildTaskKey(scope.tenantId, workspaceId, botId, taskId);
        const lease = leaseStore.byTaskKey.get(taskKey);
        if (!lease || lease.claimedBy !== claimToken) {
            return reply.code(404).send({
                error: 'lease_not_found',
                message: 'No matching lease found for claim_token.',
            });
        }

        const nowMs = now();
        if (lease.status !== 'claimed' || Date.parse(lease.expiresAt) <= nowMs) {
            return reply.code(409).send({
                error: 'lease_not_active',
                message: 'Only active claimed leases can be renewed.',
            });
        }

        const leaseTtlSeconds = parseLeaseTtlSeconds(request.body?.lease_ttl_seconds);
        const renewed: RuntimeTaskLease = {
            ...lease,
            expiresAt: new Date(nowMs + (leaseTtlSeconds * 1000)).toISOString(),
            lastRenewedAt: new Date(nowMs).toISOString(),
        };

        leaseStore.byTaskKey.set(taskKey, renewed);
        leaseStore.byClaimToken.set(claimToken, renewed);

        return reply.code(200).send({
            status: 'renewed',
            task_id: taskId,
            lease_id: renewed.leaseId,
            claim_token: claimToken,
            expires_at: renewed.expiresAt,
            renewed_at: renewed.lastRenewedAt,
        });
    });

    app.post<{ Params: RuntimeTaskWithIdParams; Body: ReleaseBody }>('/v1/workspaces/:workspaceId/runtime/tasks/:taskId/lease/release', async (request, reply) => {
        const workspaceId = request.params.workspaceId;
        const taskId = request.params.taskId;
        const scope = resolveScope(request, workspaceId, request.body?.tenant_id);
        if (!scope.ok || !scope.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: scope.message });
        }

        const botId = request.body?.bot_id?.trim();
        const claimToken = request.body?.claim_token?.trim();
        if (!botId || !claimToken) {
            return reply.code(400).send({
                error: 'invalid_release',
                message: 'bot_id and claim_token are required.',
            });
        }

        const taskKey = buildTaskKey(scope.tenantId, workspaceId, botId, taskId);
        const lease = leaseStore.byTaskKey.get(taskKey);
        if (!lease || lease.claimedBy !== claimToken) {
            return reply.code(404).send({
                error: 'lease_not_found',
                message: 'No matching lease found for claim_token.',
            });
        }

        const released: RuntimeTaskLease = {
            ...lease,
            status: 'released',
            releasedAt: new Date(now()).toISOString(),
        };
        leaseStore.byTaskKey.set(taskKey, released);
        leaseStore.byClaimToken.set(claimToken, released);

        return reply.code(200).send({
            status: 'released',
            task_id: taskId,
            lease_id: released.leaseId,
            claim_token: claimToken,
            released_at: released.releasedAt,
        });
    });

    app.post<{ Params: RuntimeTaskWithIdParams; Body: ReleaseBody }>('/v1/workspaces/:workspaceId/runtime/tasks/:taskId/lease/expire', async (request, reply) => {
        const workspaceId = request.params.workspaceId;
        const taskId = request.params.taskId;
        const scope = resolveScope(request, workspaceId, request.body?.tenant_id);
        if (!scope.ok || !scope.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: scope.message });
        }

        const botId = request.body?.bot_id?.trim();
        const claimToken = request.body?.claim_token?.trim();
        if (!botId || !claimToken) {
            return reply.code(400).send({
                error: 'invalid_expire',
                message: 'bot_id and claim_token are required.',
            });
        }

        const taskKey = buildTaskKey(scope.tenantId, workspaceId, botId, taskId);
        const lease = leaseStore.byTaskKey.get(taskKey);
        if (!lease || lease.claimedBy !== claimToken) {
            return reply.code(404).send({
                error: 'lease_not_found',
                message: 'No matching lease found for claim_token.',
            });
        }

        if (lease.status !== 'claimed') {
            return reply.code(409).send({
                error: 'lease_not_active',
                message: 'Only active claimed leases can be expired.',
                lease_status: lease.status,
            });
        }

        const expiredAt = new Date(now()).toISOString();
        const expiredLease: RuntimeTaskLease = {
            ...lease,
            status: 'expired',
            releasedAt: expiredAt,
        };
        leaseStore.byTaskKey.set(taskKey, expiredLease);
        leaseStore.byClaimToken.set(claimToken, expiredLease);

        const correlationId = request.body?.correlation_id?.trim() || lease.correlationId || `task_expire_${taskId}_${Math.floor(now())}`;
        await repo.createAuditEvent({
            tenantId: scope.tenantId,
            workspaceId,
            botId,
            summary: `Runtime task lease expired task_id=${taskId} lease_id=${lease.leaseId} claim_token=${claimToken} requeue=ready`,
            correlationId,
            severity: 'warn',
        });

        return reply.code(200).send({
            status: 'expired',
            task_id: taskId,
            lease_id: lease.leaseId,
            claim_token: claimToken,
            expired_at: expiredAt,
            correlation_id: correlationId,
            requeue: {
                task_id: taskId,
                correlation_id: correlationId,
                next_attempt_at: expiredAt,
            },
        });
    });

    app.post<{ Params: RuntimeTaskWithIdParams; Body: DispatchBody }>('/v1/workspaces/:workspaceId/runtime/tasks/:taskId/dispatch', async (request, reply) => {
        const workspaceId = request.params.workspaceId;
        const taskId = request.params.taskId;
        const scope = resolveScope(request, workspaceId, request.body?.tenant_id);
        if (!scope.ok || !scope.tenantId) {
            return reply.code(403).send({ error: 'forbidden', message: scope.message });
        }

        const botId = request.body?.bot_id?.trim();
        const claimToken = request.body?.claim_token?.trim();
        if (!botId || !claimToken) {
            return reply.code(400).send({
                error: 'invalid_dispatch',
                message: 'bot_id and claim_token are required.',
            });
        }

        // Phase 22 — per-agent rate limit (third tier: IP → tenant → agent)
        // Only applied when a PrismaClient is explicitly provided (production path).
        // Tests that do not supply prisma bypass this tier and continue unblocked.
        if (options.prisma !== undefined) {
            const db = await resolvePrisma();
            const agentRlConfig = await getAgentRateLimitConfig(botId, scope.tenantId, db);
            if (agentRlConfig?.enabled) {
                const agentResult = rateLimitAgent(botId, { limit: agentRlConfig.requestsPerMinute, windowMs: 60_000 });
                reply.header('x-ratelimit-agent-remaining', String(agentResult.remaining));
                if (!agentResult.allowed) {
                    return reply.code(429).send({
                        error: 'rate_limit_exceeded',
                        scope: 'agent',
                        botId,
                        retryAfterMs: agentResult.resetIn,
                    });
                }
            }
        }

        const taskKey = buildTaskKey(scope.tenantId, workspaceId, botId, taskId);
        const lease = leaseStore.byTaskKey.get(taskKey);
        const nowMs = now();
        if (!lease || lease.claimedBy !== claimToken) {
            return reply.code(404).send({
                error: 'lease_not_found',
                message: 'No matching claimed lease found.',
            });
        }

        if (lease.status !== 'claimed' || Date.parse(lease.expiresAt) <= nowMs) {
            return reply.code(409).send({
                error: 'lease_not_active',
                message: 'Only active claimed leases can be dispatched.',
                lease_status: lease.status,
                expires_at: lease.expiresAt,
            });
        }

        const runtimeEndpoint = await repo.findRuntimeEndpoint({
            tenantId: scope.tenantId,
            workspaceId,
            botId,
        });
        if (!runtimeEndpoint) {
            return reply.code(404).send({
                error: 'runtime_not_found',
                message: 'No active runtime endpoint found for bot.',
            });
        }

        const payload = request.body?.payload ?? {};
        const budgetMetadata = readBudgetDispatchMetadata(payload);
        const budgetEvidenceSuffix = buildBudgetEvidenceSuffix(budgetMetadata);
        const correlationId = request.body?.correlation_id?.trim() || lease.correlationId || `task_dispatch_${taskId}_${Math.floor(nowMs)}`;

        if (budgetMetadata.decision === 'denied') {
            await repo.createActionRecord({
                tenantId: scope.tenantId,
                workspaceId,
                botId,
                actionType: 'dispatch_runtime_task',
                riskLevel: 'low',
                policyPackVersion: 'control_plane_v1',
                inputSummary: JSON.stringify({
                    task_id: taskId,
                    lease_id: lease.leaseId,
                    claim_token: claimToken,
                    idempotency_key: lease.idempotencyKey,
                    correlation_id: correlationId,
                    budget_decision: budgetMetadata.decision,
                    budget_denial_reason: budgetMetadata.denialReason ?? null,
                    budget_limit_scope: budgetMetadata.limitScope ?? null,
                    budget_limit_type: budgetMetadata.limitType ?? null,
                }),
                outputSummary: `runtime_dispatch_skipped reason=budget_denied${budgetEvidenceSuffix}`,
                status: 'rejected',
                connectorType: 'runtime_control_plane',
                correlationId,
                completedAt: new Date(nowMs),
            });

            await repo.createAuditEvent({
                tenantId: scope.tenantId,
                workspaceId,
                botId,
                summary: `Runtime task dispatch skipped task_id=${taskId} lease_id=${lease.leaseId} claim_token=${claimToken} reason=budget_denied${budgetEvidenceSuffix}`,
                correlationId,
                severity: 'warn',
            });

            return reply.code(409).send({
                error: 'budget_denied',
                message: `Task blocked by budget policy${budgetMetadata.denialReason ? `: ${budgetMetadata.denialReason}` : '.'}`,
            });
        }

        const dispatchResult = await (async () => {
            const cbKey = 'runtime:agent-runtime';
            if (!cbIsAllowed(cbKey)) {
                return {
                    ok: false,
                    statusCode: 503,
                    errorMessage: 'circuit_open',
                } as const;
            }
            const result = await dispatcher({
                runtimeEndpoint,
                runtimeTaskToken,
                taskId,
                payload,
                lease,
                claimToken,
            });
            if (result.ok) {
                cbRecordSuccess(cbKey);
            } else {
                cbRecordFailure(cbKey);
            }
            return result;
        })();

        await repo.createActionRecord({
            tenantId: scope.tenantId,
            workspaceId,
            botId,
            actionType: 'dispatch_runtime_task',
            riskLevel: 'low',
            policyPackVersion: 'control_plane_v1',
            inputSummary: JSON.stringify({
                task_id: taskId,
                lease_id: lease.leaseId,
                claim_token: claimToken,
                idempotency_key: lease.idempotencyKey,
                correlation_id: correlationId,
                budget_decision: budgetMetadata.decision ?? null,
                budget_denial_reason: budgetMetadata.denialReason ?? null,
                budget_limit_scope: budgetMetadata.limitScope ?? null,
                budget_limit_type: budgetMetadata.limitType ?? null,
            }),
            outputSummary: dispatchResult.ok
                ? `runtime_dispatch_success status=${dispatchResult.statusCode}${budgetEvidenceSuffix}`
                : `runtime_dispatch_failed status=${dispatchResult.statusCode} message=${dispatchResult.errorMessage ?? 'unknown'}${budgetEvidenceSuffix}`,
            status: dispatchResult.ok ? 'completed' : 'failed',
            connectorType: 'runtime_control_plane',
            correlationId,
            completedAt: new Date(nowMs),
        });

        await repo.createAuditEvent({
            tenantId: scope.tenantId,
            workspaceId,
            botId,
            summary: dispatchResult.ok
                ? `Runtime task dispatched task_id=${taskId} lease_id=${lease.leaseId} claim_token=${claimToken}${budgetEvidenceSuffix}`
                : `Runtime task dispatch failed task_id=${taskId} lease_id=${lease.leaseId} claim_token=${claimToken} status=${dispatchResult.statusCode}${budgetEvidenceSuffix}`,
            correlationId,
            severity: dispatchResult.ok ? 'info' : 'warn',
        });

        if (!dispatchResult.ok) {
            const httpCode = dispatchResult.errorMessage === 'circuit_open' ? 503 : 502;
            return reply.code(httpCode).send({
                error: dispatchResult.errorMessage === 'circuit_open' ? 'service_unavailable' : 'runtime_dispatch_failed',
                message: dispatchResult.errorMessage === 'circuit_open'
                    ? 'Agent runtime circuit is open. Retry after 30 seconds.'
                    : (dispatchResult.errorMessage ?? 'Runtime dispatch failed.'),
                reason: dispatchResult.errorMessage === 'circuit_open' ? 'circuit_open' : undefined,
                retryAfterMs: dispatchResult.errorMessage === 'circuit_open' ? 30_000 : undefined,
                status_code: dispatchResult.statusCode,
            });
        }

        const releasedLease: RuntimeTaskLease = {
            ...lease,
            status: 'released',
            releasedAt: new Date(now()).toISOString(),
        };
        leaseStore.byTaskKey.set(taskKey, releasedLease);
        leaseStore.byClaimToken.set(claimToken, releasedLease);

        return reply.code(202).send({
            status: 'dispatched',
            task_id: taskId,
            lease_id: lease.leaseId,
            claim_token: claimToken,
            runtime_endpoint: runtimeEndpoint,
            downstream_status: dispatchResult.statusCode,
        });
    });

    const defaultListTaskRecords = async (
        workspaceId: string,
        limit: number,
        cursor?: string,
    ) => {
        const prisma = await getPrisma();
        const results = await prisma.taskExecutionRecord.findMany({
            where: { workspaceId },
            orderBy: { executedAt: 'desc' },
            take: limit + 1,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            select: {
                id: true,
                taskId: true,
                modelProvider: true,
                modelProfile: true,
                outcome: true,
                latencyMs: true,
                estimatedCostUsd: true,
                modelTier: true,
                executedAt: true,
            },
        });

        let nextCursor: string | null = null;
        if (results.length > limit) {
            nextCursor = results[limit]!.id;
            results.splice(limit);
        }

        return { tasks: results, nextCursor };
    };

    const listTaskRecords = options.listTaskRecords ?? defaultListTaskRecords;

    app.get<{ Params: RuntimeTaskParams; Querystring: { limit?: string; cursor?: string } }>(
        '/v1/workspaces/:workspaceId/tasks',
        async (request, reply) => {
            const session = options.getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized', message: 'Authentication required.' });
            }

            const { workspaceId } = request.params;
            if (!session.workspaceIds.includes(workspaceId)) {
                return reply.code(403).send({ error: 'forbidden', message: 'workspace_id is not in your session scope.' });
            }

            const rawLimit = parseInt(request.query.limit ?? '50', 10);
            const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 100);
            const cursor = request.query.cursor?.trim() || undefined;

            const result = await listTaskRecords(workspaceId, limit, cursor);
            return reply.send(result);
        },
    );

    /**
     * POST /v1/tasks/parse-goal
     * Pure parsing utility — no DB writes, no auth required.
     * Body: { description: string }
     * Response: GoalPlan (with empty tenantId/workspaceId/botId)
     */
    app.post<{ Body: { description?: string } }>(
        '/v1/tasks/parse-goal',
        async (request, reply) => {
            const description = typeof request.body?.description === 'string'
                ? request.body.description
                : '';
            const plan = parseGoal(description);
            return reply.code(200).send(plan);
        },
    );
}
