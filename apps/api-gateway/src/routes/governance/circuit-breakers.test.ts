/**
 * Phase 23 — Tests for apps/api-gateway/src/routes/circuit-breakers.ts
 *
 * Pattern: node:test, flat test() blocks, Fastify app.inject.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerCircuitBreakerRoutes } from './circuit-breakers.js';
import {
    recordFailure,
    resetCircuit,
    isAllowed,
} from '../lib/circuit-breaker.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (role = 'admin') => ({
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

// ── App factory ───────────────────────────────────────────────────────────────

const buildApp = (role = 'admin') => {
    const session = makeSession(role);
    const app = Fastify({ logger: false });
    void registerCircuitBreakerRoutes(app, {
        getSession: () => session,
    });
    return app;
};

const buildNoAuthApp = () => {
    const app = Fastify({ logger: false });
    void registerCircuitBreakerRoutes(app, {
        getSession: () => null,
    });
    return app;
};

// ── Test 1: GET returns array of circuit states ───────────────────────────────

test('GET /v1/circuit-breakers returns array of circuit states', async () => {
    const key = `route_list_${Date.now()}`;
    recordFailure(key);          // ensure at least one entry
    const app = buildApp('admin');
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/v1/circuit-breakers' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ circuits: unknown[] }>();
    assert.ok(Array.isArray(body.circuits));
    const entry = (body.circuits as Array<{ key: string }>).find((c) => c.key === key);
    assert.ok(entry, 'Expected seeded circuit entry in response');
});

// ── Test 2: GET returns empty array when no circuits relevant to test ─────────

test('GET /v1/circuit-breakers returns an array (may include entries from other tests)', async () => {
    const app = buildApp('admin');
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/v1/circuit-breakers' });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ circuits: unknown[] }>();
    assert.ok(Array.isArray(body.circuits));
});

// ── Test 3: GET requires admin role (403 for operator) ────────────────────────

test('GET /v1/circuit-breakers returns 403 for operator role', async () => {
    const app = buildApp('operator');
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/v1/circuit-breakers' });
    assert.equal(res.statusCode, 403);
});

// ── Test 4: GET requires auth (401 for missing session) ──────────────────────

test('GET /v1/circuit-breakers returns 401 when no session', async () => {
    const app = buildNoAuthApp();
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/v1/circuit-breakers' });
    assert.equal(res.statusCode, 401);
});

// ── Test 5: POST reset returns { reset: true, key } ──────────────────────────

test('POST /v1/circuit-breakers/:key/reset returns { reset: true, key }', async () => {
    const key = `route_reset_${Date.now()}`;
    // Open the circuit
    for (let i = 0; i < 5; i++) {
        recordFailure(key);
    }
    assert.equal(isAllowed(key), false); // verify it's open

    const app = buildApp('admin');
    await app.ready();

    const encoded = encodeURIComponent(key);
    const res = await app.inject({
        method: 'POST',
        url: `/v1/circuit-breakers/${encoded}/reset`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json<{ reset: boolean; key: string }>();
    assert.equal(body.reset, true);
    assert.equal(body.key, key);
});

// ── Test 6: after POST reset isAllowed returns true ──────────────────────────

test('after POST /v1/circuit-breakers/:key/reset isAllowed returns true', async () => {
    const key = `route_reset_allowed_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
        recordFailure(key);
    }
    assert.equal(isAllowed(key), false);

    const app = buildApp('admin');
    await app.ready();
    const encoded = encodeURIComponent(key);
    await app.inject({ method: 'POST', url: `/v1/circuit-breakers/${encoded}/reset` });

    assert.equal(isAllowed(key), true);
    // Cleanup
    resetCircuit(key);
});

// ── Test 7: POST reset requires admin role ────────────────────────────────────

test('POST /v1/circuit-breakers/:key/reset returns 403 for operator role', async () => {
    const app = buildApp('operator');
    await app.ready();
    const res = await app.inject({
        method: 'POST',
        url: '/v1/circuit-breakers/somekey/reset',
    });
    assert.equal(res.statusCode, 403);
});

// ── Test 8: POST reset requires auth ─────────────────────────────────────────

test('POST /v1/circuit-breakers/:key/reset returns 401 when no session', async () => {
    const app = buildNoAuthApp();
    await app.ready();
    const res = await app.inject({
        method: 'POST',
        url: '/v1/circuit-breakers/somekey/reset',
    });
    assert.equal(res.statusCode, 401);
});
