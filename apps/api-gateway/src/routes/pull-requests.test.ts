import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerPrRoutes } from './pull-requests.js';

const session = () => ({
    userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const app = Fastify();
    registerPrRoutes(app, { getSession: () => session() });
    return app;
};

// ---------------------------------------------------------------------------
// POST /v1/workspaces/:wsId/pull-requests/draft
// ---------------------------------------------------------------------------

describe('POST /v1/workspaces/:wsId/pull-requests/draft', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerPrRoutes(app, { getSession: () => null });
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft',
            payload: { branch: 'feat/x', changeSummary: 'Add feature X' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_other/pull-requests/draft',
            payload: { branch: 'feat/x', changeSummary: 'Add feature X' },
        });
        assert.equal(res.statusCode, 403);
    });

    it('creates a draft and returns 201 with draftId', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft',
            payload: { branch: 'feat/new-feature', changeSummary: 'Add new feature with tests', linkedIssueIds: ['42'] },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.ok(body.draftId, 'draftId must be present');
        assert.ok(body.title, 'title must be present');
        assert.ok(body.body, 'body must be present');
        assert.ok(Array.isArray(body.checklist), 'checklist must be array');
        assert.ok(Array.isArray(body.reviewersSuggested), 'reviewersSuggested must be array');
    });

    it('truncates long changeSummary to title <=72 chars', async () => {
        const app = buildApp();
        const longSummary = 'A'.repeat(100);
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft',
            payload: { branch: 'feat/long', changeSummary: longSummary },
        });
        assert.ok(res.json().title.length <= 72);
    });

    it('includes linked issue in body', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft',
            payload: { branch: 'feat/fix', changeSummary: 'Fix bug', linkedIssueIds: ['99'] },
        });
        assert.ok(res.json().body.includes('99'));
    });
});

// ---------------------------------------------------------------------------
// POST /v1/workspaces/:wsId/pull-requests/:draftId/publish
// ---------------------------------------------------------------------------

describe('POST /v1/workspaces/:wsId/pull-requests/:draftId/publish', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerPrRoutes(app, { getSession: () => null });
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft_abc/publish',
            payload: {},
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 for unknown draftId', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/nonexistent/publish',
            payload: {},
        });
        assert.equal(res.statusCode, 404);
    });

    it('publishes a draft and returns 200', async () => {
        const app = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft',
            payload: { branch: 'feat/pub', changeSummary: 'Add feature' },
        });
        const { draftId } = createRes.json();
        const res = await app.inject({
            method: 'POST', url: `/v1/workspaces/ws_1/pull-requests/${draftId}/publish`,
            payload: { targetBranch: 'develop' },
        });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'published');
        assert.equal(res.json().draftId, draftId);
    });

    it('blocks high-risk merge to main', async () => {
        const app = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft',
            payload: { branch: 'feat/dangerous', changeSummary: 'force_push to main branch' },
        });
        const { draftId } = createRes.json();
        const res = await app.inject({
            method: 'POST', url: `/v1/workspaces/ws_1/pull-requests/${draftId}/publish`,
            payload: { targetBranch: 'main' },
        });
        assert.equal(res.statusCode, 403);
        assert.equal(res.json().error, 'policy_preflight_failed');
    });

    it('allows merge to main for safe change summaries', async () => {
        const app = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/pull-requests/draft',
            payload: { branch: 'feat/safe', changeSummary: 'Add unit tests' },
        });
        const { draftId } = createRes.json();
        const res = await app.inject({
            method: 'POST', url: `/v1/workspaces/ws_1/pull-requests/${draftId}/publish`,
            payload: { targetBranch: 'main' },
        });
        assert.equal(res.statusCode, 200);
    });
});
