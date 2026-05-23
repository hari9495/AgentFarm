import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerAgentFeedbackRoutes } from './agent-feedback.js';

const makeSession = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

// ── Auth guard tests ──────────────────────────────────────────────────────────

test('GET /feedback — no session → 401', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/feedback',
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json<{ error: string }>().error, 'unauthorized');
    } finally {
        await app.close();
    }
});

test('GET /feedback — with session → 200 with feedback array', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/feedback',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ feedback: unknown[] }>();
        assert.ok(Array.isArray(body.feedback));
    } finally {
        await app.close();
    }
});

test('POST /feedback — no session → 401', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/feedback',
            payload: { task_id: 'task-1', skill_id: 'skill-1', rating: 5 },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /feedback — with session → 201', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/feedback',
            payload: { task_id: 'task-1', skill_id: 'skill-1', rating: 5 },
        });
        // stub returns { id: 'stub' } with status 201
        assert.equal(res.statusCode, 201);
    } finally {
        await app.close();
    }
});

test('GET /feedback/skills — no session → 401', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/feedback/skills',
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /feedback/skills — with session → 200 with skills array', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/feedback/skills',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ skills: unknown[] }>();
        assert.ok(Array.isArray(body.skills));
    } finally {
        await app.close();
    }
});

// ── Quality signal route tests ────────────────────────────────────────────────

function makeMockPrisma(overrides: { createResult?: unknown; findResult?: unknown[] } = {}) {
    return {
        qualitySignalLog: {
            create: async () => overrides.createResult ?? { id: 'qs-1' },
            findMany: async () => overrides.findResult ?? [],
        },
    } as any;
}

test('POST /v1/feedback/quality-signal — valid body → 201', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, {
        getSession: () => null,
        prisma: makeMockPrisma({ createResult: { id: 'qs-abc' } }),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/feedback/quality-signal',
            payload: {
                tenantId: 'tenant-1',
                workspaceId: 'ws-1',
                signalType: 'action_succeeded',
                source: 'runtime_outcome',
                score: 0.9,
            },
        });
        assert.equal(res.statusCode, 201);
        assert.equal(res.json<{ id: string }>().id, 'qs-abc');
    } finally {
        await app.close();
    }
});

test('POST /v1/feedback/quality-signal — missing signalType → 400', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, {
        getSession: () => null,
        prisma: makeMockPrisma(),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/feedback/quality-signal',
            payload: { tenantId: 'tenant-1', workspaceId: 'ws-1' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('GET /v1/feedback/quality-signals — no session → 401', async () => {
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, {
        getSession: () => null,
        prisma: makeMockPrisma(),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/feedback/quality-signals',
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/feedback/quality-signals — with session → signals array', async () => {
    const mockSignals = [{ id: 'qs-1', signalType: 'action_succeeded' }];
    const app = Fastify({ logger: false });
    registerAgentFeedbackRoutes(app, {
        getSession: () => makeSession(),
        prisma: makeMockPrisma({ findResult: mockSignals }),
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/feedback/quality-signals?workspaceId=ws-1',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ signals: unknown[] }>();
        assert.ok(Array.isArray(body.signals));
        assert.equal(body.signals.length, 1);
    } finally {
        await app.close();
    }
});
