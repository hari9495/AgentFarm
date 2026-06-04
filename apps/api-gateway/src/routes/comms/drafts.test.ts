import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerCommsDraftRoutes } from './drafts.js';

// Note: comms/drafts uses a module-level store seeded on first GET request.
// Tests run sequentially and share the seeded state within a process.

const session = (extra: Record<string, unknown> = {}) => ({
    userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000, ...extra,
});

const buildApp = (opts: { scope?: string } = {}) => {
    const app = Fastify();
    registerCommsDraftRoutes(app, {
        getSession: () => ({ ...session(), ...(opts.scope ? { scope: opts.scope } : {}) }),
    });
    return app;
};

// ---------------------------------------------------------------------------
// GET /v1/comms/drafts
// ---------------------------------------------------------------------------

describe('GET /v1/comms/drafts', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerCommsDraftRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside session scope', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_other' });
        assert.equal(res.statusCode, 403);
    });

    it('returns seeded drafts on first call', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.drafts));
        assert.ok(body.total >= 5, 'at least 5 seeded drafts expected');
    });

    it('filters by status', async () => {
        const app = buildApp();
        // Ensure seeded
        await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1' });
        const res = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1&status=pending_review' });
        assert.equal(res.statusCode, 200);
        const drafts = res.json().drafts as { status: string }[];
        assert.ok(drafts.every(d => d.status === 'pending_review'));
    });

    it('allows internal scope to bypass workspace check', async () => {
        const app = buildApp({ scope: 'internal' });
        // Internal scope bypasses workspace check — uses session.workspaceIds[0]
        const res = await app.inject({ method: 'GET', url: '/v1/comms/drafts' });
        assert.equal(res.statusCode, 200);
    });
});

// ---------------------------------------------------------------------------
// POST /v1/comms/drafts/:id/approve
// ---------------------------------------------------------------------------

describe('POST /v1/comms/drafts/:id/approve', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerCommsDraftRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'POST', url: '/v1/comms/drafts/nope/approve' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 for unknown draft id', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/comms/drafts/nonexistent_id/approve' });
        assert.equal(res.statusCode, 404);
    });

    it('approves a pending_review draft', async () => {
        const app = buildApp();
        // Seed and get a pending_review draft
        const listRes = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1&status=pending_review' });
        const drafts = listRes.json().drafts as { id: string }[];
        assert.ok(drafts.length > 0, 'need at least one pending_review draft');
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/comms/drafts/${id}/approve` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'approved');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/comms/drafts/:id/reject
// ---------------------------------------------------------------------------

describe('POST /v1/comms/drafts/:id/reject', () => {
    it('returns 404 for unknown draft', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/comms/drafts/bad_id/reject' });
        assert.equal(res.statusCode, 404);
    });

    it('rejects a pending_review draft', async () => {
        const app = buildApp();
        const listRes = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1&status=pending_review' });
        const drafts = listRes.json().drafts as { id: string }[];
        assert.ok(drafts.length > 0, 'need at least one pending_review draft');
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/comms/drafts/${id}/reject` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'rejected');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/comms/drafts/:id/send
// ---------------------------------------------------------------------------

describe('POST /v1/comms/drafts/:id/send', () => {
    it('returns 400 when draft is not approved', async () => {
        const app = buildApp();
        const listRes = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1&status=pending_review' });
        const drafts = listRes.json().drafts as { id: string }[];
        if (drafts.length === 0) return; // skip if none pending_review
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/comms/drafts/${id}/send` });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'must_be_approved_first');
    });

    it('sends an approved draft', async () => {
        const app = buildApp();
        // Seed store and find approved draft
        const listRes = await app.inject({ method: 'GET', url: '/v1/comms/drafts?workspace_id=ws_1&status=approved' });
        const drafts = listRes.json().drafts as { id: string }[];
        assert.ok(drafts.length > 0, 'need at least one approved draft');
        const id = drafts[0]!.id;
        const res = await app.inject({ method: 'POST', url: `/v1/comms/drafts/${id}/send` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().status, 'sent');
    });
});
