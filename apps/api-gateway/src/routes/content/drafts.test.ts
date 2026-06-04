import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerContentDraftRoutes } from './drafts.js';

// Note: content/drafts uses a module-level store seeded on first GET request.
// The store is separate from comms/drafts (different module).

const session = () => ({
    userId: 'u1', tenantId: 'tenant_content', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const app = Fastify();
    registerContentDraftRoutes(app, { getSession: () => session() });
    return app;
};

// ---------------------------------------------------------------------------
// GET /v1/content/drafts
// ---------------------------------------------------------------------------

describe('GET /v1/content/drafts', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerContentDraftRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_other' });
        assert.equal(res.statusCode, 403);
    });

    it('returns seeded drafts on first call', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.drafts));
        assert.ok(body.total >= 5, 'at least 5 seeded drafts expected');
    });

    it('filters by status', async () => {
        const app = buildApp();
        await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1' });
        const res = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1&status=pending_review' });
        assert.equal(res.statusCode, 200);
        const drafts = res.json().drafts as { status: string }[];
        assert.ok(drafts.length > 0);
        assert.ok(drafts.every(d => d.status === 'pending_review'));
    });

    it('respects limit parameter', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1&limit=2' });
        assert.equal(res.statusCode, 200);
        assert.ok(res.json().drafts.length <= 2);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/content/drafts/:id/approve
// ---------------------------------------------------------------------------

describe('POST /v1/content/drafts/:id/approve', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerContentDraftRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'POST', url: '/v1/content/drafts/nope/approve' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 for unknown draft', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/content/drafts/nonexistent/approve' });
        assert.equal(res.statusCode, 404);
    });

    it('approves a pending_review draft', async () => {
        const app = buildApp();
        const listRes = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1&status=pending_review' });
        const drafts = listRes.json().drafts as { id: string }[];
        assert.ok(drafts.length > 0, 'need at least one pending_review draft');
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/content/drafts/${id}/approve` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'approved');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/content/drafts/:id/reject
// ---------------------------------------------------------------------------

describe('POST /v1/content/drafts/:id/reject', () => {
    it('returns 404 for unknown draft', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/content/drafts/bad_id/reject' });
        assert.equal(res.statusCode, 404);
    });

    it('rejects a pending_review draft', async () => {
        const app = buildApp();
        const listRes = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1&status=pending_review' });
        const drafts = listRes.json().drafts as { id: string }[];
        assert.ok(drafts.length > 0, 'need at least one pending_review draft');
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/content/drafts/${id}/reject` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'rejected');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/content/drafts/:id/publish
// ---------------------------------------------------------------------------

describe('POST /v1/content/drafts/:id/publish', () => {
    it('returns 400 when draft is not approved', async () => {
        const app = buildApp();
        const listRes = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1&status=pending_review' });
        const drafts = listRes.json().drafts as { id: string }[];
        if (drafts.length === 0) return;
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/content/drafts/${id}/publish` });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'must_be_approved_first');
    });

    it('publishes an approved draft', async () => {
        const app = buildApp();
        const listRes = await app.inject({ method: 'GET', url: '/v1/content/drafts?workspace_id=ws_1&status=approved' });
        const drafts = listRes.json().drafts as { id: string }[];
        assert.ok(drafts.length > 0, 'need at least one approved draft');
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/content/drafts/${id}/publish` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'published');
    });
});
