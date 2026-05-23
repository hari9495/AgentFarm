import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerEnvReconcilerRoutes } from './env-reconciler.js';

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
    await registerEnvReconcilerRoutes(app, {
        getSession: () => (sessionOverride !== undefined ? sessionOverride : makeSession()),
    });
    return app;
};

describe('GET /v1/workspaces/:workspaceId/env-profile', () => {
    it('returns default profile when none set', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/env-profile' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.source, 'default');
        assert.deepEqual(body.toolchain, []);
        assert.equal(body.reconcileStatus, 'clean');
    });

    it('returns 401 when no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/env-profile' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 for unauthorized workspace', async () => {
        const app = await buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/env-profile' });
        assert.equal(res.statusCode, 403);
    });
});

describe('PUT /v1/workspaces/:workspaceId/env-profile', () => {
    it('persists toolchain and returns profile', async () => {
        const app = Fastify({ logger: false });
        await registerEnvReconcilerRoutes(app, { getSession: () => makeSession() });

        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/env-profile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                toolchain: [
                    { name: 'node', requiredVersion: '20.0.0', actualVersion: '20.0.0', status: 'ok' },
                    { name: 'pnpm', requiredVersion: '9.0.0', actualVersion: '8.0.0', status: 'version_mismatch' },
                ],
            }),
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.toolchain.length, 2);
        assert.ok(body.correlationId);

        // GET should return 'persisted'
        const getRes = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/env-profile' });
        assert.equal(JSON.parse(getRes.body).source, 'persisted');
    });

    it('rejects invalid toolchain type', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/env-profile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ toolchain: 'not-an-array' }),
        });
        assert.equal(res.statusCode, 400);
    });
});

describe('POST /v1/workspaces/:workspaceId/env-profile/reconcile', () => {
    it('dry-run returns drift report without persisting', async () => {
        const app = Fastify({ logger: false });
        await registerEnvReconcilerRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/env-profile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                toolchain: [
                    { name: 'node', requiredVersion: '20', actualVersion: '18', status: 'version_mismatch' },
                ],
            }),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/env-profile/reconcile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ dryRun: true }),
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.dryRun, true);
        assert.equal(body.drifted.length, 1);
        assert.equal(body.profile.reconcileStatus, 'drifted');
        assert.ok(body.correlationId);

        // dry-run should NOT persist lastReconcileAt
        const getRes = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/env-profile' });
        assert.equal(JSON.parse(getRes.body).lastReconcileAt, undefined);
    });

    it('live reconcile persists status and drift report', async () => {
        const app = Fastify({ logger: false });
        await registerEnvReconcilerRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/env-profile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                toolchain: [
                    { name: 'python', requiredVersion: '3.12', status: 'missing' },
                ],
            }),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/env-profile/reconcile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ dryRun: false }),
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.dryRun, false);
        assert.equal(body.drifted.length, 1);

        const getRes = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/env-profile' });
        const profile = JSON.parse(getRes.body);
        assert.ok(profile.lastReconcileAt);
        assert.equal(profile.reconcileStatus, 'drifted');
    });

    it('clean toolchain produces no drift', async () => {
        const app = Fastify({ logger: false });
        await registerEnvReconcilerRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/env-profile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                toolchain: [
                    { name: 'node', requiredVersion: '20', actualVersion: '20', status: 'ok' },
                ],
            }),
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/env-profile/reconcile',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({}),
        });

        const body = JSON.parse(res.body);
        assert.equal(body.drifted.length, 0);
        assert.equal(body.profile.reconcileStatus, 'clean');
    });
});
