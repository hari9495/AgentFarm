import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerIdeStateRoutes } from './ide-state.js';

// ---- helpers ---------------------------------------------------------------

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
    // Each test gets its own fresh store via the in-memory repo injected through the store option.
    // We pass `store` so the route creates a fresh createInMemoryRepo per request.
    await registerIdeStateRoutes(app, {
        getSession: () => (sessionOverride !== undefined ? sessionOverride : makeSession()),
    });
    return app;
};

// ---- tests -----------------------------------------------------------------

describe('GET /v1/workspaces/:workspaceId/ide-state', () => {
    it('returns default ide state when none persisted', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws-001/ide-state',
        });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.source, 'default');
        assert.deepEqual(body.openFiles, []);
        assert.deepEqual(body.breakpoints, []);
        assert.equal(body.status, 'active');
    });

    it('returns 401 when no session', async () => {
        const app = await buildApp(null);
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/ide-state' });
        assert.equal(res.statusCode, 401);
    });

    it('returns 403 when workspace not in session', async () => {
        const app = await buildApp(makeSession({ workspaceIds: ['ws-other'] }));
        const res = await app.inject({ method: 'GET', url: '/v1/workspaces/ws-001/ide-state' });
        assert.equal(res.statusCode, 403);
    });
});

describe('PUT /v1/workspaces/:workspaceId/ide-state', () => {
    it('persists and returns ide state', async () => {
        const app = Fastify({ logger: false });
        await registerIdeStateRoutes(app, { getSession: () => makeSession() });

        const putRes = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/ide-state',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                openFiles: ['src/index.ts', 'src/app.ts'],
                activeFile: 'src/index.ts',
                breakpoints: [{ file: 'src/index.ts', line: 42 }],
                status: 'active',
            }),
        });
        assert.equal(putRes.statusCode, 200);
        const putBody = JSON.parse(putRes.body);
        assert.deepEqual(putBody.openFiles, ['src/index.ts', 'src/app.ts']);
        assert.equal(putBody.activeFile, 'src/index.ts');
        assert.equal(putBody.breakpoints.length, 1);
        assert.ok(putBody.correlationId);
    });

    it('rejects invalid openFiles type', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/ide-state',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ openFiles: 'not-an-array' }),
        });
        assert.equal(res.statusCode, 400);
    });

    it('rejects invalid status value', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/ide-state',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ status: 'broken' }),
        });
        assert.equal(res.statusCode, 400);
    });
});

describe('POST /v1/workspaces/:workspaceId/terminal-sessions', () => {
    it('creates a terminal session with defaults', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/terminal-sessions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({}),
        });
        assert.equal(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.equal(body.shell, 'bash');
        assert.equal(body.cwd, '/');
        assert.equal(body.status, 'active');
        assert.ok(body.id);
        assert.ok(body.correlationId);
    });

    it('creates a terminal session with specified shell and cwd', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/terminal-sessions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ shell: 'zsh', cwd: '/home/user' }),
        });
        assert.equal(res.statusCode, 201);
        const body = JSON.parse(res.body);
        assert.equal(body.shell, 'zsh');
        assert.equal(body.cwd, '/home/user');
    });

    it('rejects invalid shell value', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/terminal-sessions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ shell: 'unsafe-shell' }),
        });
        assert.equal(res.statusCode, 400);
    });
});

describe('GET /v1/workspaces/:workspaceId/terminal-sessions', () => {
    it('lists created sessions', async () => {
        const app = Fastify({ logger: false });
        await registerIdeStateRoutes(app, { getSession: () => makeSession() });

        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/terminal-sessions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ shell: 'bash' }),
        });
        await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/terminal-sessions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ shell: 'zsh' }),
        });

        const res = await app.inject({
            method: 'GET',
            url: '/v1/workspaces/ws-001/terminal-sessions',
        });
        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.body);
        assert.equal(body.total, 2);
        assert.equal(body.sessions.length, 2);
    });
});

describe('PUT /v1/workspaces/:workspaceId/terminal-sessions/:sessionId', () => {
    it('updates lastCommand, history, status', async () => {
        const app = Fastify({ logger: false });
        await registerIdeStateRoutes(app, { getSession: () => makeSession() });

        const createRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/terminal-sessions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ shell: 'bash', cwd: '/tmp' }),
        });
        const sessionId = JSON.parse(createRes.body).id;

        const updateRes = await app.inject({
            method: 'PUT',
            url: `/v1/workspaces/ws-001/terminal-sessions/${sessionId}`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({
                lastCommand: 'ls -la',
                history: ['pwd', 'ls -la'],
                status: 'closed',
                cwd: '/home/user',
            }),
        });
        assert.equal(updateRes.statusCode, 200);
        const body = JSON.parse(updateRes.body);
        assert.equal(body.lastCommand, 'ls -la');
        assert.deepEqual(body.history, ['pwd', 'ls -la']);
        assert.equal(body.status, 'closed');
        assert.equal(body.cwd, '/home/user');
    });

    it('returns 404 for unknown session', async () => {
        const app = await buildApp();
        const res = await app.inject({
            method: 'PUT',
            url: '/v1/workspaces/ws-001/terminal-sessions/nonexistent-id',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ status: 'closed' }),
        });
        assert.equal(res.statusCode, 404);
    });

    it('rejects invalid status on update', async () => {
        const app = Fastify({ logger: false });
        await registerIdeStateRoutes(app, { getSession: () => makeSession() });

        const createRes = await app.inject({
            method: 'POST',
            url: '/v1/workspaces/ws-001/terminal-sessions',
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({}),
        });
        const sessionId = JSON.parse(createRes.body).id;

        const res = await app.inject({
            method: 'PUT',
            url: `/v1/workspaces/ws-001/terminal-sessions/${sessionId}`,
            headers: { 'content-type': 'application/json' },
            payload: JSON.stringify({ status: 'exploded' }),
        });
        assert.equal(res.statusCode, 400);
    });
});
