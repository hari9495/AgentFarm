import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerActivityRoutes } from './activity-events.js';

const makeSession = (overrides: Record<string, unknown> = {}) => ({
    userId: 'user-001',
    tenantId: 'tenant-001',
    workspaceIds: ['ws-001'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 60_000,
    ...overrides,
});

const buildApp = async (sessionOverride?: ReturnType<typeof makeSession> | null) => {
    const app = Fastify({ logger: false });
    await registerActivityRoutes(app, {
        getSession: () => (sessionOverride !== undefined ? sessionOverride : makeSession()),
    });
    return app;
};

describe('GET /v1/workspaces/:workspaceId/activity-events', () => {
    it('returns empty list by default', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/activity-events' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.deepEqual(body.events, []);
        assert.equal(body.total, 0);
    });

    it('returns 401 when no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/activity-events' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 for unauthorized workspace', async () => {
        const app = await buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/activity-events' });
        assert.equal(res.statusCode, 403);
    });

    it('rejects unknown status filter', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/activity-events?status=bogus' });
        assert.equal(res.statusCode, 400);
    });
});

describe('POST /v1/workspaces/:workspaceId/activity-events', () => {
    it('creates an event with monotonic sequence', async () => {
        const app = Fastify({ logger: false });
        await registerActivityRoutes(app, { getSession: () => makeSession() });

        const r1 = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ category: 'runtime', title: 'Agent started' }),
        });
        const r2 = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ category: 'ci', title: 'Build passed' }),
        });

        assert.equal(r1.statusCode, 201);
        assert.equal(r2.statusCode, 201);
        const b1 = JSON.parse(r1.body);
        const b2 = JSON.parse(r2.body);
        assert.equal(b1.sequence, 1);
        assert.equal(b2.sequence, 2);
        assert.equal(b1.status, 'unread');
    });

    it('rejects missing title', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ category: 'runtime' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('rejects invalid category', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ category: 'unknown_cat', title: 'test' }),
        });
        assert.equal(res.statusCode, 400);
    });
});

describe('POST /v1/workspaces/:workspaceId/activity-events/ack', () => {
    it('acks events and returns count', async () => {
        const app = Fastify({ logger: false });
        await registerActivityRoutes(app, { getSession: () => makeSession() });

        const createRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ category: 'approval', title: 'Approval needed' }),
        });
        const { id } = JSON.parse(createRes.body);

        const ackRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events/ack',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ eventIds: [id] }),
        });
        assert.equal(ackRes.statusCode, 200);
        const body = JSON.parse(ackRes.body);
        assert.equal(body.acked, 1);
    });

    it('returns acked=0 for unknown event id', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events/ack',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ eventIds: ['nonexistent-id'] }),
        });
        assert.equal(res.statusCode, 200);
        assert.equal(JSON.parse(res.body).acked, 0);
    });

    it('rejects invalid eventIds type', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events/ack',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ eventIds: 'not-an-array' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('filters list by status and category', async () => {
        const app = Fastify({ logger: false });
        await registerActivityRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ category: 'runtime', title: 'A' }),
        });
        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/activity-events',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ category: 'ci', title: 'B' }),
        });

        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/activity-events?category=ci' });
        const body = JSON.parse(res.body);
        assert.equal(body.total, 1);
        assert.equal(body.events[0].category, 'ci');
    });
});
