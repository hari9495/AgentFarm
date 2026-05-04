import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerDesktopActionRoutes } from './desktop-actions.js';

const makeSession = (overrides: Record<string, unknown> = {}) => ({
    userId: 'user-001',
    tenantId: 'tenant-001',
    workspaceIds: ['ws-001'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 60_000,
    ...overrides,
});

const buildApp = async (
    sessionOverride?: ReturnType<typeof makeSession> | null,
    routeOptions: Record<string, unknown> = {},
) => {
    const app = Fastify({ logger: false });
    await registerDesktopActionRoutes(app, {
        getSession: () => (sessionOverride !== undefined ? sessionOverride : makeSession()),
        requireApprovalForHighRisk: true,
        ...routeOptions,
    });
    return app;
};

describe('POST /v1/workspaces/:workspaceId/desktop-actions', () => {
    it('creates a low-risk action with result=success', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                actionType: 'click',
                target: '#submit-btn',
                riskLevel: 'low',
            }),
        });

        assert.equal(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.equal(body.actionType, 'click');
        assert.equal(body.result, 'success');
        assert.equal(body.riskLevel, 'low');
        assert.ok(body.id);
        assert.ok(body.correlationId);
        assert.equal(body.approvalId, undefined);
    });

    it('creates a high-risk action with result=approval_pending', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                actionType: 'upload',
                target: '/path/to/file',
                riskLevel: 'high',
            }),
        });

        assert.equal(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.equal(body.result, 'approval_pending');
        assert.ok(body.approvalId);
    });

    it('type action is HIGH_RISK and gets approval_pending', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'type', riskLevel: 'low' }),
        });
        assert.equal(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.equal(body.result, 'approval_pending');
    });

    it('returns 400 for invalid actionType', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'explode' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 for invalid riskLevel', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'click', riskLevel: 'extreme' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'click' }),
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 for unauthorized workspace', async () => {
        const app = await buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'click' }),
        });
        assert.equal(res.statusCode, 403);
    });
});

describe('GET /v1/workspaces/:workspaceId/desktop-actions', () => {
    it('lists actions for the workspace', async () => {
        const app = Fastify({ logger: false });
        await registerDesktopActionRoutes(app, {
            getSession: () => makeSession(),
            requireApprovalForHighRisk: true,
        });

        // Create two actions
        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'click', riskLevel: 'low' }),
        });
        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'screenshot', riskLevel: 'low' }),
        });

        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/desktop-actions' });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.total, 2);
        assert.equal(body.actions.length, 2);
    });

    it('returns empty list when no actions exist', async () => {
        const app = await buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/desktop-actions' });
        assert.equal(res.statusCode, 200);
        assert.equal(JSON.parse(res.body).total, 0);
    });
});

describe('PUT /v1/workspaces/:workspaceId/desktop-actions/:actionId', () => {
    it('updates action result and adds screenshotRef', async () => {
        const app = Fastify({ logger: false });
        await registerDesktopActionRoutes(app, {
            getSession: () => makeSession(),
            requireApprovalForHighRisk: false,
        });

        const createRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/desktop-actions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ actionType: 'screenshot', riskLevel: 'low' }),
        });
        const { id } = JSON.parse(createRes.body);

        const updateRes = await app.inject({
            method: 'PUT',
            url: `/v1/workspaces/ws-001/desktop-actions/${id}`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ result: 'success', screenshotRef: 'screenshots/capture-001.png' }),
        });

        assert.equal(updateRes.statusCode, 200);
        const body = JSON.parse(updateRes.body);
        assert.equal(body.result, 'success');
        assert.equal(body.screenshotRef, 'screenshots/capture-001.png');
        assert.ok(body.completedAt);
    });

    it('returns 404 for unknown actionId', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/desktop-actions/nonexistent-id',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ result: 'failed' }),
        });
        assert.equal(res.statusCode, 404);
    });

    it('returns 400 for invalid result value', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/desktop-actions/some-id',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ result: 'invalid_result' }),
        });
        assert.equal(res.statusCode, 400);
    });
});
