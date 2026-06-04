import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerWorkMemoryRoutes } from './work-memory.js';

const session = () => ({
    userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const app = Fastify();
    registerWorkMemoryRoutes(app, { getSession: () => session() });
    return app;
};

// ---------------------------------------------------------------------------
// PUT /v1/workspaces/:wsId/work-memory
// ---------------------------------------------------------------------------

describe('PUT /v1/workspaces/:wsId/work-memory', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerWorkMemoryRoutes(app, { getSession: () => null });
        const res = await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_1/work-memory',
            payload: { entries: [{ key: 'x', value: {} }] },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_other/work-memory',
            payload: { entries: [] },
        });
        assert.equal(res.statusCode, 403);
    });

    it('upserts entries and returns entry count', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_1/work-memory',
            payload: {
                entries: [
                    { key: 'task_1', value: { status: 'in_progress', assignee: 'alice' } },
                    { key: 'task_2', value: { status: 'done', assignee: 'bob' } },
                ],
            },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().ok, true);
        assert.equal(res.json().entryCount, 2);
    });

    it('merges new entries with existing ones', async () => {
        const app = buildApp();
        await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_1/work-memory',
            payload: { entries: [{ key: 'k1', value: { a: 1 } }] },
        });
        const res = await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_1/work-memory',
            payload: { entries: [{ key: 'k2', value: { b: 2 } }] },
        });
        assert.equal(res.json().entryCount, 2);
    });

    it('replaces all entries when mergeMode=replace', async () => {
        const app = buildApp();
        await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_1/work-memory',
            payload: { entries: [{ key: 'k1', value: {} }, { key: 'k2', value: {} }] },
        });
        const res = await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_1/work-memory',
            payload: { mergeMode: 'replace', entries: [{ key: 'k3', value: {} }] },
        });
        assert.equal(res.json().entryCount, 1);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/workspaces/:wsId/next-actions
// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:wsId/next-actions', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerWorkMemoryRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/next-actions' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace outside scope', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_other/next-actions' });
        assert.equal(res.statusCode, 403);
    });

    it('returns empty items for workspace with no memory', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/next-actions' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.items));
        assert.equal(body.items.length, 0);
    });

    it('derives items from stored memory entries', async () => {
        const app = buildApp();
        await app.inject({
            method: 'PUT', url: '/v1/workspaces/ws_1/work-memory',
            payload: { entries: [{ key: 'pending_review', value: { status: 'in_progress' } }] },
        });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/next-actions' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.items));
        assert.equal(body.items.length, 1);
        assert.equal(body.items[0].key, 'pending_review');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/workspaces/:wsId/daily-plan
// ---------------------------------------------------------------------------

describe('POST /v1/workspaces/:wsId/daily-plan', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerWorkMemoryRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'POST', url: '/v1/workspaces/ws_1/daily-plan', payload: {} });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace outside scope', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/workspaces/ws_other/daily-plan', payload: {} });
        assert.equal(res.statusCode, 403);
    });

    it('returns a daily plan with steps', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/daily-plan',
            payload: { objective: 'Ship feature X', constraints: [] },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.equal(body.objective, 'Ship feature X');
        assert.ok(Array.isArray(body.steps), 'steps must be an array');
        assert.ok(Array.isArray(body.approvalsNeeded));
        assert.ok(Array.isArray(body.blockedItems));
    });

    it('adds approval item when constraint requires approval', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/daily-plan',
            payload: { constraints: ['requires approval from manager'] },
        });
        assert.equal(res.statusCode, 201);
        assert.ok(res.json().approvalsNeeded.length > 0);
    });
});
