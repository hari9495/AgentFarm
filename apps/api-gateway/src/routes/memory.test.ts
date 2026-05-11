import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerMemoryRoutes } from './memory.js';
import type { PrismaClient } from '@prisma/client';

const makeSession = () => ({
    userId: 'user-1',
    tenantId: 'tenant-1',
    workspaceIds: ['ws-1'],
    expiresAt: Date.now() + 60_000,
});

// Minimal Prisma mock satisfying MemoryStore's delegate types
function makePrisma(): PrismaClient {
    return {
        // $queryRaw is used by readLongTermMemory / writeLongTermMemory
        $queryRaw: async () => [],
        agentShortTermMemory: {
            findMany: async () => [],
            count: async () => 0,
            create: async (args: { data: Record<string, unknown> }) => ({
                id: 'mem-1',
                workspaceId: 'ws-1',
                tenantId: 'tenant-1',
                taskId: 'task-1',
                actionsTaken: [],
                approvalOutcomes: [],
                connectorsUsed: [],
                llmProvider: null,
                executionStatus: 'success',
                summary: 'ok',
                correlationId: 'corr-1',
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
                ...args.data,
            }),
            deleteMany: async () => ({ count: 0 }),
        },
        agentLongTermMemory: {
            findMany: async () => [],
            create: async (args: { data: Record<string, unknown> }) => ({
                id: 'ltm-1',
                tenantId: 'tenant-1',
                workspaceId: 'ws-1',
                pattern: 'p',
                confidence: 0.8,
                observedCount: 1,
                lastSeen: new Date(),
                createdAt: new Date(),
                ...args.data,
            }),
            updateMany: async () => ({ count: 1 }),
        },
    } as unknown as PrismaClient;
}

// ── Auth guard tests ──────────────────────────────────────────────────────────

test('GET /api/v1/workspaces/:workspaceId/memory — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/api/v1/workspaces/ws-1/memory',
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json<{ error: string }>().error, 'unauthorized');
    } finally {
        await app.close();
    }
});

test('GET /api/v1/workspaces/:workspaceId/memory — with session → 200', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/api/v1/workspaces/ws-1/memory',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ workspaceId: string }>();
        assert.equal(body.workspaceId, 'ws-1');
    } finally {
        await app.close();
    }
});

test('POST /api/v1/workspaces/:workspaceId/memory — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/workspaces/ws-1/memory',
            payload: {
                workspaceId: 'ws-1',
                tenantId: 'tenant-1',
                taskId: 'task-1',
                summary: 'did stuff',
            },
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /api/v1/workspaces/:workspaceId/memory — with session → 201', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/workspaces/ws-1/memory',
            payload: {
                workspaceId: 'ws-1',
                tenantId: 'tenant-1',
                taskId: 'task-1',
                summary: 'did stuff',
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ taskId: string }>();
        assert.equal(body.taskId, 'task-1');
    } finally {
        await app.close();
    }
});

test('POST /api/v1/memory/cleanup — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => null });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/memory/cleanup',
            payload: {},
        });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('POST /api/v1/memory/cleanup — with session → 200', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession() });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/api/v1/memory/cleanup',
            payload: {},
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ deletedCount: number }>();
        assert.ok(typeof body.deletedCount === 'number');
    } finally {
        await app.close();
    }
});

// ===========================================================================
// Tests 7–11: GET /v1/memory/search proxy route
// ===========================================================================

test('GET /v1/memory/search — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => null });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/memory/search?q=auth' });
        assert.equal(res.statusCode, 401);
    } finally {
        await app.close();
    }
});

test('GET /v1/memory/search — missing q → 400', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession() });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/memory/search' });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'q param required');
    } finally {
        await app.close();
    }
});

test('GET /v1/memory/search — forwards q param to upstream', async () => {
    let capturedUrl = '';
    const mockFetch = async (url: string | URL, _init?: RequestInit): Promise<Response> => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({ results: [], count: 0 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), {
        getSession: () => makeSession(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/memory/search?q=auth+token' });
        assert.equal(res.statusCode, 200);
        assert.ok(capturedUrl.includes('q=auth'), `expected q param in URL but got: ${capturedUrl}`);
    } finally {
        await app.close();
    }
});

test('GET /v1/memory/search — forwards optional repoName and types', async () => {
    let capturedUrl = '';
    const mockFetch = async (url: string | URL, _init?: RequestInit): Promise<Response> => {
        capturedUrl = String(url);
        return new Response(JSON.stringify({ results: [], count: 0 }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    };
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), {
        getSession: () => makeSession(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/memory/search?q=deploy&repoName=repo-a&types=short%2Clong',
        });
        assert.equal(res.statusCode, 200);
        assert.ok(capturedUrl.includes('repoName=repo-a'), `expected repoName in URL: ${capturedUrl}`);
        assert.ok(capturedUrl.includes('types='), `expected types in URL: ${capturedUrl}`);
    } finally {
        await app.close();
    }
});

test('GET /v1/memory/search — returns 502 when upstream errors', async () => {
    const mockFetch = async (): Promise<Response> => {
        throw new Error('connection refused');
    };
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), {
        getSession: () => makeSession(),
        fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    try {
        const res = await app.inject({ method: 'GET', url: '/v1/memory/search?q=auth' });
        assert.equal(res.statusCode, 502);
        assert.equal(res.json<{ error: string }>().error, 'agent-runtime unreachable');
    } finally {
        await app.close();
    }
});
