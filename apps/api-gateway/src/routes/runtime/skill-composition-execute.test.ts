import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerSkillCompositionRoutes } from './skill-composition-execute.js';

// The route uses globalCompositionEngine via dynamic import with fallback to
// agent-runtime-stubs.js which provides stub implementations.

const minDag = () => ({
    composition_id: 'comp_test',
    version: '1.0',
    nodes: [{ id: 'n1', skill: 'email-draft', inputs: {}, outputs: {} }],
    edges: [],
});

const buildApp = () => {
    const app = Fastify();
    registerSkillCompositionRoutes(app);
    return app;
};

// ---------------------------------------------------------------------------
// POST /v1/compositions
// ---------------------------------------------------------------------------

describe('POST /v1/compositions', () => {
    it('returns 400 when composition_id is missing', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/compositions',
            payload: { nodes: [{ id: 'n1' }] },
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error, 'composition_id and nodes required');
    });

    it('returns 400 when nodes is empty', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/compositions',
            payload: { composition_id: 'comp_1', nodes: [] },
        });
        assert.equal(res.statusCode, 400);
    });

    it('registers a composition and returns 201', async () => {
        const app = buildApp();
        const res = await app.inject({
            method: 'POST', url: '/v1/compositions',
            payload: minDag(),
        });
        assert.equal(res.statusCode, 201);
        const body = res.json();
        assert.equal(body.composition_id, 'comp_test');
        assert.equal(body.version, '1.0');
    });
});

// ---------------------------------------------------------------------------
// POST /v1/compositions/:id/execute
// ---------------------------------------------------------------------------

describe('POST /v1/compositions/:id/execute', () => {
    it('executes a composition and returns result', async () => {
        const app = buildApp();
        // Register first
        await app.inject({ method: 'POST', url: '/v1/compositions', payload: minDag() });
        const res = await app.inject({
            method: 'POST', url: '/v1/compositions/comp_test/execute',
            payload: { initial_inputs: { prospect: 'Alice' } },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        // Stub always returns success: true
        assert.equal(body.success, true);
        assert.ok('run_id' in body);
    });
});

// ---------------------------------------------------------------------------
// GET /v1/compositions
// ---------------------------------------------------------------------------

describe('GET /v1/compositions', () => {
    it('returns list of compositions', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/compositions' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.compositions));
        assert.equal(typeof body.total, 'number');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/compositions/:id/runs/:runId
// ---------------------------------------------------------------------------

describe('GET /v1/compositions/:id/runs/:runId', () => {
    it('returns 404 for unknown run', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/compositions/comp_1/runs/nonexistent' });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error, 'Run not found');
    });
});
