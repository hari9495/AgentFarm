import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerKnowledgeGraphRoutes } from './knowledge-graph.js';

const makeSession = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

// ── Auth guard tests ──────────────────────────────────────────────────────────

test('GET /knowledge-graph/snapshot — no session → 401', async () => {
    const app = Fastify({ logger: false });
    registerKnowledgeGraphRoutes(app, { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/knowledge-graph/snapshot',
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json<{ error: string }>().error, 'unauthorized');
    } finally {
        await app.close();
    }
});

test('GET /knowledge-graph/snapshot — with session → 200', async () => {
    const app = Fastify({ logger: false });
    registerKnowledgeGraphRoutes(app, { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/knowledge-graph/snapshot',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ symbols: unknown[] }>();
        assert.ok(Array.isArray(body.symbols));
    } finally {
        await app.close();
    }
});

test('GET /knowledge-graph/symbols — no session → 401', async () => {
    const app = Fastify({ logger: false });
    registerKnowledgeGraphRoutes(app, { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/knowledge-graph/symbols',
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /knowledge-graph/symbols — with session → 200', async () => {
    const app = Fastify({ logger: false });
    registerKnowledgeGraphRoutes(app, { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/knowledge-graph/symbols',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ symbols: unknown[] }>();
        assert.ok(Array.isArray(body.symbols));
    } finally {
        await app.close();
    }
});

test('POST /knowledge-graph/index — no session → 401', async () => {
    const app = Fastify({ logger: false });
    registerKnowledgeGraphRoutes(app, { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/knowledge-graph/index',
            payload: {},
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /knowledge-graph/index — with session → 200', async () => {
    const app = Fastify({ logger: false });
    registerKnowledgeGraphRoutes(app, { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/knowledge-graph/index',
            payload: {},
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ ok: boolean }>();
        assert.equal(body.ok, true);
    } finally {
        await app.close();
    }
});
