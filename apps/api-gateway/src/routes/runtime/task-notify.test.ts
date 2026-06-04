import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerTaskNotifyRoutes } from './task-notify.js';

// ---------------------------------------------------------------------------
// Stub prisma (dispatchOutboundWebhooks is fire-and-forget — DB calls ignored)
// ---------------------------------------------------------------------------

const stubPrisma = {
    outboundWebhook: { findMany: async () => [] },
} as never;

const session = () => ({ tenantId: 'tenant_1' });

const validBody = () => ({
    task_id: 'task_1',
    bot_id: 'bot_1',
    workspace_id: 'ws_1',
    tenant_id: 'tenant_1',
    outcome: 'success',
});

const buildApp = (dispatchToken = 'test-token', prisma = stubPrisma) => {
    const app = Fastify();
    registerTaskNotifyRoutes(app, {
        dispatchToken,
        prisma,
        now: () => 1_700_000_000_000,
    });
    return app;
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('POST /v1/tasks/notify — auth', () => {
    it('returns 401 when no token and no getSession', async () => {
        const app = Fastify();
        registerTaskNotifyRoutes(app, { prisma: stubPrisma, now: () => 0 });
        const res = await app.inject({ method: 'POST', url: '/v1/tasks/notify', payload: validBody() });
        assert.equal(res.statusCode, 401);
    });

    it('returns 401 when wrong dispatch token', async () => {
        const app = buildApp('correct-token');
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'wrong-token' },
            payload: validBody(),
        });
        assert.equal(res.statusCode, 401);
    });

    it('accepts correct dispatch token via x-runtime-dispatch-token header', async () => {
        const app = buildApp('abc123');
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'abc123' },
            payload: validBody(),
        });
        assert.equal(res.statusCode, 202);
    });

    it('accepts correct dispatch token via Authorization Bearer header', async () => {
        const app = buildApp('bearertoken');
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { authorization: 'Bearer bearertoken' },
            payload: validBody(),
        });
        assert.equal(res.statusCode, 202);
    });

    it('accepts session auth when no dispatchToken configured', async () => {
        const app = Fastify();
        registerTaskNotifyRoutes(app, {
            getSession: () => session(),
            prisma: stubPrisma,
            now: () => 0,
        });
        const res = await app.inject({ method: 'POST', url: '/v1/tasks/notify', payload: validBody() });
        assert.equal(res.statusCode, 202);
    });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('POST /v1/tasks/notify — validation', () => {
    it('returns 400 when task_id is missing', async () => {
        const app = buildApp();
        const { task_id: _, ...body } = validBody();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: body,
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_request');
    });

    it('returns 400 when bot_id is missing', async () => {
        const app = buildApp();
        const { bot_id: _, ...body } = validBody();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: body,
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when workspace_id is missing', async () => {
        const app = buildApp();
        const { workspace_id: _, ...body } = validBody();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: body,
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when tenant_id is missing', async () => {
        const app = buildApp();
        const { tenant_id: _, ...body } = validBody();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: body,
        });
        assert.equal(res.statusCode, 400);
    });
});

// ---------------------------------------------------------------------------
// Success response shape
// ---------------------------------------------------------------------------

describe('POST /v1/tasks/notify — response', () => {
    it('returns 202 accepted with correct shape for success outcome', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: validBody(),
        });
        assert.equal(res.statusCode, 202);
        const body = res.json();
        assert.equal(body.accepted, true);
        assert.equal(body.task_id, 'task_1');
        assert.equal(body.event_type, 'task_completed');
        assert.ok(body.timestamp, 'timestamp must be present');
    });

    it('sets event_type to task_failed when outcome is "failed"', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: { ...validBody(), outcome: 'failed' },
        });
        assert.equal(res.statusCode, 202);
        assert.equal(res.json().event_type, 'task_failed');
    });

    it('sets event_type to task_failed when outcome is "failure"', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: { ...validBody(), outcome: 'failure' },
        });
        assert.equal(res.statusCode, 202);
        assert.equal(res.json().event_type, 'task_failed');
    });

    it('uses injected now() for timestamp', async () => {
        const app = buildApp('test-token');
        const res = await app.inject({
            method: 'POST',
            url: '/v1/tasks/notify',
            headers: { 'x-runtime-dispatch-token': 'test-token' },
            payload: validBody(),
        });
        // now() returns 1_700_000_000_000 → 2023-11-14T22:13:20.000Z
        assert.ok(res.json().timestamp.includes('2023-'));
    });
});
