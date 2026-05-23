import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerChatRoutes } from './chat.js';

// ── Session helpers ───────────────────────────────────────────────────────────

const makeSession = (tenantId = 'tenant_1', role = 'admin') => ({
    userId: 'user_1',
    tenantId,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

// ── Upstream (runtime) mock helpers ──────────────────────────────────────────

function makeUpstreamFetch(status: number, body: unknown): typeof globalThis.fetch {
    return async (_url, _init) =>
        ({
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
        }) as unknown as Response;
}

function makeUpstreamFetch204(): typeof globalThis.fetch {
    return async (_url, _init) =>
        ({
            ok: true,
            status: 204,
            json: async () => { throw new Error('no body'); },
        }) as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// 1. GET /v1/chat/sessions — 401 when no session
test('GET /v1/chat/sessions — 401 when unauthenticated', async () => {
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => null,
        fetch: makeUpstreamFetch(200, { sessions: [] }),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/chat/sessions' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

// 2. GET /v1/chat/sessions — 403 for viewer-below role
test('GET /v1/chat/sessions — 403 for insufficient role', async () => {
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_1', 'unknown_role'),
        fetch: makeUpstreamFetch(200, { sessions: [] }),
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/chat/sessions' });
        assert.equal(res.statusCode, 403);
    } finally {
        await app.close();
    }
});

// 3. GET /v1/chat/sessions — proxies and returns sessions
test('GET /v1/chat/sessions — proxies to runtime with tenantId from session', async () => {
    const sessions = [{ id: 's1', tenantId: 'tenant_1' }];
    let capturedUrl = '';
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_1', 'viewer'),
        fetch: async (url, _init) => {
            capturedUrl = String(url);
            return { ok: true, status: 200, json: async () => ({ sessions }) } as Response;
        },
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/chat/sessions' });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ sessions: unknown[] }>();
        assert.equal(body.sessions.length, 1);
        assert.ok(capturedUrl.includes('tenantId=tenant_1'));
    } finally {
        await app.close();
    }
});

// 4. POST /v1/chat/sessions — 403 for viewer role (requires operator+)
test('POST /v1/chat/sessions — 403 for viewer role', async () => {
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_1', 'viewer'),
        fetch: makeUpstreamFetch(201, { session: {} }),
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/chat/sessions',
            headers: { 'content-type': 'application/json' },
            payload: { title: 'Test' },
        });
        assert.equal(res.statusCode, 403);
    } finally {
        await app.close();
    }
});

// 5. POST /v1/chat/sessions — always injects tenantId from session
test('POST /v1/chat/sessions — injects tenantId from session, ignores body tenantId', async () => {
    let capturedBody: Record<string, unknown> = {};
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_correct', 'operator'),
        fetch: async (_url, init) => {
            capturedBody = JSON.parse(String(init?.body ?? '{}'));
            return { ok: true, status: 201, json: async () => ({ session: { id: 's1' } }) } as Response;
        },
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/chat/sessions',
            headers: { 'content-type': 'application/json' },
            payload: { title: 'New', tenantId: 'tenant_hacked' },
        });
        assert.equal(res.statusCode, 201);
        assert.equal(capturedBody['tenantId'], 'tenant_correct');
    } finally {
        await app.close();
    }
});

// 6. GET /v1/chat/sessions/:sessionId/messages — proxies with tenantId
test('GET /v1/chat/sessions/:sessionId/messages — proxies tenantId from session', async () => {
    let capturedUrl = '';
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_1', 'viewer'),
        fetch: async (url, _init) => {
            capturedUrl = String(url);
            return { ok: true, status: 200, json: async () => ({ messages: [] }) } as Response;
        },
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/chat/sessions/session_abc/messages',
        });
        assert.equal(res.statusCode, 200);
        assert.ok(capturedUrl.includes('/chat/sessions/session_abc/messages'));
        assert.ok(capturedUrl.includes('tenantId=tenant_1'));
    } finally {
        await app.close();
    }
});

// 7. POST /v1/chat/sessions/:sessionId/messages — injects tenantId from session
test('POST /v1/chat/sessions/:sessionId/messages — injects tenantId from session', async () => {
    let capturedBody: Record<string, unknown> = {};
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_correct', 'operator'),
        fetch: async (_url, init) => {
            capturedBody = JSON.parse(String(init?.body ?? '{}'));
            return { ok: true, status: 201, json: async () => ({ message: { id: 'm1' } }) } as Response;
        },
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/chat/sessions/session_abc/messages',
            headers: { 'content-type': 'application/json' },
            payload: { content: 'Hello', tenantId: 'tenant_hacked' },
        });
        assert.equal(res.statusCode, 201);
        assert.equal(capturedBody['tenantId'], 'tenant_correct');
        assert.equal(capturedBody['content'], 'Hello');
    } finally {
        await app.close();
    }
});

// 8. DELETE /v1/chat/sessions/:sessionId — admin+ required, proxies 204
test('DELETE /v1/chat/sessions/:sessionId — 403 for operator role', async () => {
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_1', 'operator'),
        fetch: makeUpstreamFetch204(),
    });
    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/chat/sessions/session_abc',
        });
        assert.equal(res.statusCode, 403);
    } finally {
        await app.close();
    }
});

test('DELETE /v1/chat/sessions/:sessionId — admin proxies and returns 204', async () => {
    let capturedUrl = '';
    const app = Fastify();
    await registerChatRoutes(app, {
        getSession: () => makeSession('tenant_1', 'admin'),
        fetch: async (url, _init) => {
            capturedUrl = String(url);
            return { ok: true, status: 204, json: async () => { throw new Error('no body'); } } as unknown as Response;
        },
    });
    try {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/chat/sessions/session_abc',
        });
        assert.equal(res.statusCode, 204);
        assert.ok(capturedUrl.includes('/chat/sessions/session_abc'));
        assert.ok(capturedUrl.includes('tenantId=tenant_1'));
    } finally {
        await app.close();
    }
});
