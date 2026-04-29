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
