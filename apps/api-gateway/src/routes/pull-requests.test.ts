import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerPrRoutes } from './pull-requests.js';

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
    await registerPrRoutes(app, {
        getSession: () => (sessionOverride !== undefined ? sessionOverride : makeSession()),
    });
    return app;
};

describe('POST /v1/workspaces/:workspaceId/pull-requests/draft', () => {
    it('creates a draft with generated title/body/checklist', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                branch: 'feat/auth-refactor',
                changeSummary: 'Refactor authentication middleware to use HMAC v2',
                linkedIssueIds: ['42', '43'],
            }),
        });

        assert.equal(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.ok(body.draftId);
        assert.match(body.title, /feat:/);
        assert.ok(body.body.includes('Closes #42'));
        assert.ok(body.body.includes('Closes #43'));
        assert.ok(body.checklist.length > 0);
        assert.ok(body.reviewersSuggested.length > 0);
        assert.ok(body.correlationId);
    });

    it('suggests security reviewer for auth/security branches', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                branch: 'fix/security-patch',
                changeSummary: 'Fix SQL injection in query builder',
            }),
        });

        const body = JSON.parse(res.body);
        assert.ok(body.reviewersSuggested.includes('@security-lead'));
    });

    it('returns 400 when branch is missing', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ changeSummary: 'some change' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 when changeSummary is missing', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ branch: 'feat/x' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 401 with no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ branch: 'feat/x', changeSummary: 'x' }),
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 for unauthorized workspace', async () => {
        const app = await buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ branch: 'feat/x', changeSummary: 'x' }),
        });
        assert.equal(res.statusCode, 403);
    });
});

describe('POST /v1/workspaces/:workspaceId/pull-requests/:draftId/publish', () => {
    it('publishes a valid draft and returns prId + status=publishing', async () => {
        const app = Fastify({ logger: false });
        await registerPrRoutes(app, { getSession: () => makeSession() });

        const draftRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                branch: 'feat/payment-flow',
                changeSummary: 'Add Stripe payment integration',
            }),
        });
        const { draftId } = JSON.parse(draftRes.body);

        const publishRes = await app.inject({
            method: 'POST',
            url: `/v1/workspaces/ws-001/pull-requests/${draftId}/publish`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ targetBranch: 'main', reviewers: ['@alice'] }),
        });

        assert.equal(publishRes.statusCode, 202);
        const body = JSON.parse(publishRes.body);
        assert.ok(body.prId);
        assert.equal(body.status, 'publishing');
        assert.equal(body.targetBranch, 'main');
    });

    it('blocks high-risk PRs with policy_preflight_failed', async () => {
        const app = Fastify({ logger: false });
        await registerPrRoutes(app, { getSession: () => makeSession() });

        const draftRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                branch: 'release/v2',
                changeSummary: 'merge_release: bump version to 2.0.0',
            }),
        });
        const { draftId } = JSON.parse(draftRes.body);

        const publishRes = await app.inject({
            method: 'POST',
            url: `/v1/workspaces/ws-001/pull-requests/${draftId}/publish`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ targetBranch: 'main' }),
        });

        assert.equal(publishRes.statusCode, 403);
        const body = JSON.parse(publishRes.body);
        assert.equal(body.error, 'policy_preflight_failed');
    });

    it('returns 404 for unknown draftId', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/nonexistent/publish',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({}),
        });
        assert.equal(res.statusCode, 404);
    });

    it('returns 409 if draft already published', async () => {
        const app = Fastify({ logger: false });
        await registerPrRoutes(app, { getSession: () => makeSession() });

        const draftRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ branch: 'feat/x', changeSummary: 'some safe change' }),
        });
        const { draftId } = JSON.parse(draftRes.body);

        // First publish
        await app.inject({
            method: 'POST',
            url: `/v1/workspaces/ws-001/pull-requests/${draftId}/publish`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({}),
        });

        // Second publish
        const res = await app.inject({
            method: 'POST',
            url: `/v1/workspaces/ws-001/pull-requests/${draftId}/publish`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({}),
        });
        assert.equal(res.statusCode, 409);
    });
});

describe('GET /v1/workspaces/:workspaceId/pull-requests/:prId/status', () => {
    it('returns PR status after publish', async () => {
        const app = Fastify({ logger: false });
        await registerPrRoutes(app, { getSession: () => makeSession() });

        const draftRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/pull-requests/draft',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ branch: 'feat/status-check', changeSummary: 'check PR status endpoint' }),
        });
        const { draftId } = JSON.parse(draftRes.body);

        const publishRes = await app.inject({
            method: 'POST',
            url: `/v1/workspaces/ws-001/pull-requests/${draftId}/publish`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ targetBranch: 'main' }),
        });
        const { prId } = JSON.parse(publishRes.body);

        const statusRes = await app.inject({
            method: 'GET',
            url: `/v1/workspaces/ws-001/pull-requests/${prId}/status`,
        });

        assert.equal(statusRes.statusCode, 200);
        const body = JSON.parse(statusRes.body);
        assert.equal(body.prId, prId);
        assert.equal(body.state, 'publishing');
        assert.ok(body.reviewStatus);
    });

    it('returns 404 for unknown prId', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws-001/pull-requests/unknown-pr/status',
        });
        assert.equal(res.statusCode, 404);
    });
});
