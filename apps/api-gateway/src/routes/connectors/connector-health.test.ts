import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerConnectorHealthRoutes } from './connector-health.js';

// The route uses globalHealthMonitor via dynamic import with fallback to
// agent-runtime-stubs.js — the stub returns { id: 'stub', status: 'unknown' }
// for ping and [] for getAllStatuses.

const mockSession = {
    userId: 'user_test',
    tenantId: 'tenant_test',
    workspaceIds: ['ws_test'],
    scope: 'customer' as const,
    expiresAt: Date.now() + 3_600_000,
};
const getSession = () => mockSession;

const buildApp = () => {
    const app = Fastify();
    registerConnectorHealthRoutes(app, { getSession });
    return app;
};

// ---------------------------------------------------------------------------
// GET /connectors/:id/health
// ---------------------------------------------------------------------------

describe('GET /connectors/:id/health', () => {
    it('returns 404 for an unregistered connector', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/connectors/github/health' });
        // No connectors are registered in the test environment → 404
        assert.equal(res.statusCode, 404);
        assert.ok('error' in res.json());
    });
});

// ---------------------------------------------------------------------------
// GET /connectors/health/all
// ---------------------------------------------------------------------------

describe('GET /connectors/health/all', () => {
    it('returns all connector statuses', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/connectors/health/all' });
        assert.equal(res.statusCode, 200);
        assert.ok(Array.isArray(res.json().statuses));
    });
});

// ---------------------------------------------------------------------------
// POST /connectors/health/ping-all
// ---------------------------------------------------------------------------

describe('POST /connectors/health/ping-all', () => {
    it('pings all connectors and returns statuses', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/connectors/health/ping-all' });
        assert.equal(res.statusCode, 200);
        assert.ok(Array.isArray(res.json().statuses));
    });
});
