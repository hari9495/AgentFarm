import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerRuntimeTaskRoutes } from './runtime-tasks.js';

const internalSession = {
    userId: 'user_internal_1',
    tenantId: 'tenant_internal_1',
    workspaceIds: ['ws_1'],
    scope: 'internal' as const,
    expiresAt: Date.now() + 60_000,
};

test('claim then dispatch forwards only valid claimed task and writes action/audit records', async () => {
    const actionRecords: Array<{ inputSummary: string; status: string; outputSummary: string | null }> = [];
    const auditEvents: Array<{ summary: string }> = [];
    const dispatchCalls: Array<{
        taskId: string;
        claimToken: string;
        lease: {
            leaseId: string;
            status: string;
            idempotencyKey: string;
            correlationId?: string;
        };
        payload: Record<string, unknown>;
    }> = [];

    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_000_000_000,
        repo: {
            async findRuntimeEndpoint() {
                return 'http://runtime.bot.local';
            },
            async createAuditEvent(input) {
                auditEvents.push({ summary: input.summary });
            },
            async createActionRecord(input) {
                actionRecords.push({
                    inputSummary: input.inputSummary,
                    status: input.status,
                    outputSummary: input.outputSummary,
                });
            },
        },
        dispatcher: async (input) => {
            dispatchCalls.push({
                taskId: input.taskId,
                claimToken: input.claimToken,
                lease: {
                    leaseId: input.lease.leaseId,
                    status: input.lease.status,
                    idempotencyKey: input.lease.idempotencyKey,
                    correlationId: input.lease.correlationId,
                },
                payload: input.payload,
            });
            return {
                ok: true,
                statusCode: 202,
            };
        },
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_1',
                idempotency_key: 'idem_1',
                correlation_id: 'corr_1',
            },
        });
        assert.equal(claim.statusCode, 200);
        const claimBody = claim.json() as { claim_token: string; lease_id: string };
        assert.ok(claimBody.claim_token);
        assert.ok(claimBody.lease_id);

        const dispatch = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/task_1/dispatch',
            payload: {
                bot_id: 'bot_1',
                claim_token: claimBody.claim_token,
                payload: { action_type: 'read_task', summary: 'read docs', target: 'docs', marker: 'corr-chain-1' },
                correlation_id: 'corr_1',
            },
        });
        assert.equal(dispatch.statusCode, 202);

        assert.equal(dispatchCalls.length, 1);
        assert.equal(dispatchCalls[0]?.taskId, 'task_1');
        assert.equal(dispatchCalls[0]?.claimToken, claimBody.claim_token);
        assert.equal(dispatchCalls[0]?.lease.leaseId, claimBody.lease_id);
        assert.equal(dispatchCalls[0]?.lease.status, 'claimed');
        assert.equal(dispatchCalls[0]?.lease.idempotencyKey, 'idem_1');
        assert.equal(dispatchCalls[0]?.lease.correlationId, 'corr_1');
        assert.equal(dispatchCalls[0]?.payload['marker'], 'corr-chain-1');

        assert.equal(actionRecords.length, 1);
        assert.equal(actionRecords[0]?.status, 'completed');
        assert.match(actionRecords[0]?.inputSummary ?? '', /claim_token/);
        assert.match(actionRecords[0]?.inputSummary ?? '', /corr_1/);

        assert.equal(auditEvents.length, 2);
        assert.match(auditEvents[0]?.summary ?? '', /lease claimed/i);
        assert.match(auditEvents[1]?.summary ?? '', /dispatched/i);
    } finally {
        await app.close();
    }
});

test('dispatch fails when task lease is missing or claim token is invalid', async () => {
    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_000_000_000,
        repo: {
            async findRuntimeEndpoint() {
                return 'http://runtime.bot.local';
            },
            async createAuditEvent() {
                return;
            },
            async createActionRecord() {
                return;
            },
        },
        dispatcher: async () => ({
            ok: true,
            statusCode: 202,
        }),
    });

    try {
        const dispatchWithoutClaim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/task_2/dispatch',
            payload: {
                bot_id: 'bot_1',
                claim_token: 'missing',
                payload: { action_type: 'read_task' },
            },
        });

        assert.equal(dispatchWithoutClaim.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('dispatch runtime failure keeps claim and lease correlation in failed action and audit records', async () => {
    const actionRecords: Array<{ inputSummary: string; status: string; outputSummary: string | null }> = [];
    const auditEvents: Array<{ summary: string }> = [];

    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_000_000_000,
        repo: {
            async findRuntimeEndpoint() {
                return 'http://runtime.bot.local';
            },
            async createAuditEvent(input) {
                auditEvents.push({ summary: input.summary });
            },
            async createActionRecord(input) {
                actionRecords.push({
                    inputSummary: input.inputSummary,
                    status: input.status,
                    outputSummary: input.outputSummary,
                });
            },
        },
        dispatcher: async () => ({
            ok: false,
            statusCode: 503,
            errorMessage: 'runtime_intake_failed:503',
        }),
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_fail_1',
                idempotency_key: 'idem_fail_1',
                correlation_id: 'corr_fail_1',
            },
        });
        assert.equal(claim.statusCode, 200);
        const claimBody = claim.json() as { claim_token: string; lease_id: string };

        const dispatch = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/task_fail_1/dispatch',
            payload: {
                bot_id: 'bot_1',
                claim_token: claimBody.claim_token,
                payload: { action_type: 'read_task', target: 'docs' },
                correlation_id: 'corr_fail_1',
            },
        });

        assert.equal(dispatch.statusCode, 502);
        const dispatchBody = dispatch.json() as { error: string; message: string; status_code: number };
        assert.equal(dispatchBody.error, 'runtime_dispatch_failed');
        assert.equal(dispatchBody.message, 'runtime_intake_failed:503');
        assert.equal(dispatchBody.status_code, 503);

        assert.equal(actionRecords.length, 1);
        assert.equal(actionRecords[0]?.status, 'failed');
        assert.match(actionRecords[0]?.inputSummary ?? '', /"task_id":"task_fail_1"/);
        assert.match(actionRecords[0]?.inputSummary ?? '', /"claim_token":"/);
        assert.match(actionRecords[0]?.inputSummary ?? '', /"lease_id":"/);
        assert.match(actionRecords[0]?.inputSummary ?? '', /"correlation_id":"corr_fail_1"/);
        assert.match(actionRecords[0]?.outputSummary ?? '', /runtime_dispatch_failed status=503/);

        assert.equal(auditEvents.length, 2);
        assert.match(auditEvents[0]?.summary ?? '', /lease claimed/i);
        assert.match(auditEvents[1]?.summary ?? '', /dispatch failed/i);
        assert.match(auditEvents[1]?.summary ?? '', /claim_token=/);
        assert.match(auditEvents[1]?.summary ?? '', /lease_id=/);
    } finally {
        await app.close();
    }
});

test('dispatch persists budget decision metadata in action and audit evidence records', async () => {
    const actionRecords: Array<{ inputSummary: string; status: string; outputSummary: string | null }> = [];
    const auditEvents: Array<{ summary: string }> = [];

    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_000_000_000,
        repo: {
            async findRuntimeEndpoint() {
                return 'http://runtime.bot.local';
            },
            async createAuditEvent(input) {
                auditEvents.push({ summary: input.summary });
            },
            async createActionRecord(input) {
                actionRecords.push({
                    inputSummary: input.inputSummary,
                    status: input.status,
                    outputSummary: input.outputSummary,
                });
            },
        },
        dispatcher: async () => ({
            ok: true,
            statusCode: 202,
        }),
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_budget_meta_1',
                idempotency_key: 'idem_budget_meta_1',
                correlation_id: 'corr_budget_meta_1',
            },
        });
        assert.equal(claim.statusCode, 200);
        const claimBody = claim.json() as { claim_token: string };

        const dispatch = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/task_budget_meta_1/dispatch',
            payload: {
                bot_id: 'bot_1',
                claim_token: claimBody.claim_token,
                correlation_id: 'corr_budget_meta_1',
                payload: {
                    action_type: 'read_task',
                    summary: 'read docs',
                    _budget_decision: 'warning',
                    _budget_limit_scope: 'tenant_daily',
                    _budget_limit_type: 'usd_spend',
                },
            },
        });

        assert.equal(dispatch.statusCode, 202);
        assert.equal(actionRecords.length, 1);
        assert.match(actionRecords[0]?.inputSummary ?? '', /"budget_decision":"warning"/);
        assert.match(actionRecords[0]?.inputSummary ?? '', /"budget_limit_scope":"tenant_daily"/);
        assert.match(actionRecords[0]?.outputSummary ?? '', /budget_decision=warning/);

        assert.equal(auditEvents.length, 2);
        assert.match(auditEvents[1]?.summary ?? '', /budget_decision=warning/);
        assert.match(auditEvents[1]?.summary ?? '', /budget_limit_scope=tenant_daily/);
    } finally {
        await app.close();
    }
});

test('dispatch returns budget_denied and persists rejected action/audit records without runtime dispatch', async () => {
    const actionRecords: Array<{ inputSummary: string; status: string; outputSummary: string | null }> = [];
    const auditEvents: Array<{ summary: string }> = [];
    let dispatchCount = 0;

    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_000_000_000,
        repo: {
            async findRuntimeEndpoint() {
                return 'http://runtime.bot.local';
            },
            async createAuditEvent(input) {
                auditEvents.push({ summary: input.summary });
            },
            async createActionRecord(input) {
                actionRecords.push({
                    inputSummary: input.inputSummary,
                    status: input.status,
                    outputSummary: input.outputSummary,
                });
            },
        },
        dispatcher: async () => {
            dispatchCount += 1;
            return {
                ok: true,
                statusCode: 202,
            };
        },
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/claim',
            payload: {
                bot_id: 'bot_1',
                task_id: 'task_budget_denied_1',
                idempotency_key: 'idem_budget_denied_1',
                correlation_id: 'corr_budget_denied_1',
            },
        });
        assert.equal(claim.statusCode, 200);
        const claimBody = claim.json() as { claim_token: string };

        const dispatch = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/task_budget_denied_1/dispatch',
            payload: {
                bot_id: 'bot_1',
                claim_token: claimBody.claim_token,
                correlation_id: 'corr_budget_denied_1',
                payload: {
                    action_type: 'merge_release',
                    _budget_decision: 'denied',
                    _budget_denial_reason: 'hard_stop_active',
                    _budget_limit_scope: 'tenant_daily',
                    _budget_limit_type: 'hard_stop',
                },
            },
        });

        assert.equal(dispatch.statusCode, 409);
        const dispatchBody = dispatch.json() as { error: string; message: string };
        assert.equal(dispatchBody.error, 'budget_denied');
        assert.match(dispatchBody.message, /hard_stop_active/);
        assert.equal(dispatchCount, 0);

        assert.equal(actionRecords.length, 1);
        assert.equal(actionRecords[0]?.status, 'rejected');
        assert.match(actionRecords[0]?.outputSummary ?? '', /reason=budget_denied/);
        assert.match(actionRecords[0]?.inputSummary ?? '', /"budget_decision":"denied"/);
        assert.match(actionRecords[0]?.inputSummary ?? '', /"budget_denial_reason":"hard_stop_active"/);

        assert.equal(auditEvents.length, 2);
        assert.match(auditEvents[1]?.summary ?? '', /dispatch skipped/i);
        assert.match(auditEvents[1]?.summary ?? '', /budget_decision=denied/);
        assert.match(auditEvents[1]?.summary ?? '', /budget_denial_reason=hard_stop_active/);
    } finally {
        await app.close();
    }
});

// ──────────────────────────────────────────────────────────────
// GET /v1/workspaces/:workspaceId/tasks
// ──────────────────────────────────────────────────────────────

const buildMinimalApp = async (
    listTaskRecords: Required<Parameters<typeof registerRuntimeTaskRoutes>[1]>['listTaskRecords'],
    session: typeof internalSession | null = internalSession,
) => {
    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => session,
        repo: {
            async findRuntimeEndpoint() { return 'http://runtime.local'; },
            async createAuditEvent() { /* no-op */ },
            async createActionRecord() { /* no-op */ },
        },
        listTaskRecords,
    });
    return app;
};

test('GET /v1/workspaces/:workspaceId/tasks returns 200 with tasks array', async () => {
    const records = [
        { id: 'rec_1', taskId: 'task_1', modelProvider: 'openai', modelProfile: 'gpt-4o', outcome: 'success', latencyMs: 120, estimatedCostUsd: 0.002, modelTier: 'standard', executedAt: new Date('2025-01-01T00:00:00Z') },
        { id: 'rec_2', taskId: 'task_2', modelProvider: 'openai', modelProfile: 'gpt-4o-mini', outcome: 'failed', latencyMs: 80, estimatedCostUsd: null, modelTier: null, executedAt: new Date('2025-01-01T01:00:00Z') },
    ];

    const app = await buildMinimalApp(async () => ({ tasks: records, nextCursor: null }));

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/tasks' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: typeof records; nextCursor: string | null };
        assert.equal(body.tasks.length, 2);
        assert.equal(body.tasks[0]?.id, 'rec_1');
        assert.equal(body.nextCursor, null);
    } finally {
        await app.close();
    }
});

test('GET /v1/workspaces/:workspaceId/tasks forwards limit param to listTaskRecords', async () => {
    let capturedLimit = 0;
    const app = await buildMinimalApp(async (_ws, limit) => {
        capturedLimit = limit;
        return { tasks: [], nextCursor: null };
    });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/tasks?limit=10' });
        assert.equal(res.statusCode, 200);
        assert.equal(capturedLimit, 10);
    } finally {
        await app.close();
    }
});

test('GET /v1/workspaces/:workspaceId/tasks returns nextCursor when more results exist', async () => {
    const app = await buildMinimalApp(async () => ({
        tasks: [{ id: 'rec_a', taskId: 't_a', modelProvider: 'openai', modelProfile: 'gpt-4o', outcome: 'success', latencyMs: 50, estimatedCostUsd: 0.001, modelTier: 'standard', executedAt: new Date() }],
        nextCursor: 'rec_a',
    }));

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/tasks' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as { tasks: unknown[]; nextCursor: string };
        assert.equal(body.nextCursor, 'rec_a');
    } finally {
        await app.close();
    }
});

test('GET /v1/workspaces/:workspaceId/tasks returns 401 when no session', async () => {
    const app = await buildMinimalApp(async () => ({ tasks: [], nextCursor: null }), null);

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/tasks' });
        assert.equal(res.statusCode, 401);
        const body = res.json() as { error: string };
        assert.equal(body.error, 'unauthorized');
    } finally {
        await app.close();
    }
});

// ─── Dispatch dependency gate tests ───────────────────────────────────────────

const baseRepo = {
    async findRuntimeEndpoint() { return 'http://runtime.bot.local'; },
    async createAuditEvent() { return; },
    async createActionRecord() { return; },
};

test('dispatch returns 409 task_dependencies_not_met when deps are still running', async () => {
    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_000_000_000,
        repo: baseRepo,
        dispatcher: async () => ({ ok: true, statusCode: 202 }),
        prisma: {
            agentRateLimit: { findUnique: async () => null },
            taskQueueEntry: {
                findFirst: async () => ({ id: 'task_blocked_1', dependsOn: ['dep_1'], dependencyMet: false }),
                findMany: async () => [{ id: 'dep_1', status: 'running' }],
                update: async () => ({ id: 'task_blocked_1' }),
            },
        } as never,
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/claim',
            payload: { bot_id: 'bot_dep_1', task_id: 'task_blocked_1', idempotency_key: 'idem_blocked_1' },
        });
        assert.equal(claim.statusCode, 200);
        const { claim_token } = claim.json() as { claim_token: string };

        const dispatch = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/task_blocked_1/dispatch',
            payload: { bot_id: 'bot_dep_1', claim_token, payload: {} },
        });

        assert.equal(dispatch.statusCode, 409);
        const body = dispatch.json<{ error: string; blocking: string[] }>();
        assert.equal(body.error, 'task_dependencies_not_met');
        assert.deepEqual(body.blocking, ['dep_1']);
    } finally {
        await app.close();
    }
});

test('dispatch proceeds normally when dependency gate passes (dependencyMet=true)', async () => {
    const dispatchCalls: string[] = [];
    const app = Fastify();
    await registerRuntimeTaskRoutes(app, {
        getSession: () => internalSession,
        now: () => 1_700_000_000_000,
        repo: baseRepo,
        dispatcher: async (input) => {
            dispatchCalls.push(input.taskId);
            return { ok: true, statusCode: 202 };
        },
        prisma: {
            agentRateLimit: { findUnique: async () => null },
            taskQueueEntry: {
                findFirst: async () => ({ id: 'task_ready_1', dependsOn: [], dependencyMet: true }),
                findMany: async () => [],
                update: async () => ({ id: 'task_ready_1' }),
            },
        } as never,
    });

    try {
        const claim = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/claim',
            payload: { bot_id: 'bot_dep_2', task_id: 'task_ready_1', idempotency_key: 'idem_ready_1' },
        });
        assert.equal(claim.statusCode, 200);
        const { claim_token } = claim.json() as { claim_token: string };

        const dispatch = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws_1/runtime/tasks/task_ready_1/dispatch',
            payload: { bot_id: 'bot_dep_2', claim_token, payload: {} },
        });

        assert.equal(dispatch.statusCode, 202);
        assert.equal(dispatchCalls.length, 1);
        assert.equal(dispatchCalls[0], 'task_ready_1');
    } finally {
        await app.close();
    }
});
