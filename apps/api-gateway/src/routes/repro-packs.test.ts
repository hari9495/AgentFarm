import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerReproPackRoutes } from './repro-packs.js';

const session = () => ({
    userId: 'u1', tenantId: 't1', workspaceIds: ['ws_1'], expiresAt: Date.now() + 60_000,
});

const buildApp = () => {
    const app = Fastify();
    registerReproPackRoutes(app, { getSession: () => session() });
    return app;
};

// ---------------------------------------------------------------------------
// POST /v1/runs/:runId/resume
// ---------------------------------------------------------------------------

describe('POST /v1/runs/:runId/resume', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerReproPackRoutes(app, { getSession: () => null });
        const res = await app.inject({
            method: 'POST', url: '/v1/runs/run_1/resume',
            payload: { strategy: 'last_checkpoint' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 400 for invalid strategy', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/runs/run_1/resume',
            payload: { strategy: 'not_valid' },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'invalid_strategy');
        assert.ok(Array.isArray(res.json().allowedStrategies));
    });

    it('returns 400 when strategy is missing', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/runs/run_1/resume',
            payload: {},
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 403 when workspaceId is outside session scope', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/runs/run_1/resume',
            payload: { strategy: 'last_checkpoint', workspaceId: 'ws_other' },
        });
        assert.equal(res.statusCode, 403);
    });

    it('accepts valid strategy and returns 202', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/runs/run_1/resume',
            payload: { strategy: 'last_checkpoint', workspaceId: 'ws_1' },
        });
        assert.equal(res.statusCode, 202);
        const body = res.json();
        assert.equal(body.runId, 'run_1');
        assert.equal(body.strategy, 'last_checkpoint');
        assert.ok(body.resumedFrom, 'resumedFrom must be present');
    });

    it('accepts all valid strategies', async () => {
        const app = buildApp();
        for (const strategy of ['last_checkpoint', 'full_restart', 'rollback', 'snapshot']) {
            const res = await app.inject({
                method: 'POST', url: `/v1/runs/run_${strategy}/resume`,
                payload: { strategy },
            });
            assert.equal(res.statusCode, 202);
        }
    });
});

// ---------------------------------------------------------------------------
// POST /v1/workspaces/:wsId/repro-packs
// ---------------------------------------------------------------------------

describe('POST /v1/workspaces/:wsId/repro-packs', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerReproPackRoutes(app, { getSession: () => null });
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/repro-packs',
            payload: { runId: 'run_1' },
        });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace is outside scope', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_other/repro-packs',
            payload: { runId: 'run_1' },
        });
        assert.equal(res.statusCode, 403);
    });

    it('creates a repro pack and returns 201', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/repro-packs',
            payload: { runId: 'run_abc', includeScreenshots: true, includeDiffs: true, includeLogs: false },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.ok(body.reproPackId, 'reproPackId must be present');
        assert.ok(body.downloadRef, 'downloadRef must be present');
        assert.ok(body.expiresAt, 'expiresAt must be present');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/workspaces/:wsId/repro-packs/:packId
// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:wsId/repro-packs/:packId', () => {
    it('returns 401 when session is null', async () => {
        const app = Fastify();
        registerReproPackRoutes(app, { getSession: () => null });
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/repro-packs/pack_1' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 404 for unknown packId', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws_1/repro-packs/nonexistent' });
        assert.equal(res.statusCode, 404);
    });

    it('returns the repro pack after creation', async () => {
        const app = buildApp();
        const createRes = await app.inject({
            method: 'POST', url: '/v1/workspaces/ws_1/repro-packs',
            payload: { runId: 'run_xyz' },
        });
        const { reproPackId } = createRes.json();
        const res = await app.inject({ method: 'GET', url: `/v1/workspaces/ws_1/repro-packs/${reproPackId}` });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.reproPackId, reproPackId);
        assert.ok(Array.isArray(body.manifest?.timeline));
    });
});
