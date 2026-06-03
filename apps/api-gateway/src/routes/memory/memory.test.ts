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
        // $executeRaw is used by writeEpisodicMemoryNoEmbed and writeSemanticMemory
        $executeRaw: async () => 0,
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
            deleteMany: async () => ({ count: 0 }),
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

// ===========================================================================
// Tests: POST /v1/episodic-memory/search
// ===========================================================================

const stubEmbed = async (_text: string): Promise<number[]> =>
    Array<number>(1536).fill(0.1);

const fakeEpisodicSearchRow = {
    id: 'ep-1',
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    botId: null as string | null,
    pattern: 'code-review',
    summary: 'Reviewed PR #42',
    embeddingModel: 'text-embedding-3-small',
    confidence: 0.85,
    observedCount: 3,
    lastSeen: new Date('2026-05-01'),
    createdAt: new Date('2026-04-01'),
    similarity: 0.91,
};

const fakeEpisodicWriteRow = {
    id: 'ep-2',
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    botId: null as string | null,
    pattern: 'deploy-hotfix',
    summary: 'Deployed hotfix to production',
    embeddingModel: 'text-embedding-3-small',
    confidence: 0.9,
    observedCount: 1,
    lastSeen: new Date('2026-05-10'),
    createdAt: new Date('2026-05-10'),
};

function makePrismaForEpisodicSearch(): PrismaClient {
    return {
        ...makePrisma(),
        $queryRaw: async () => [fakeEpisodicSearchRow],
    } as unknown as PrismaClient;
}

function makePrismaForEpisodicWrite(): PrismaClient {
    return {
        ...makePrisma(),
        $queryRaw: async () => [fakeEpisodicWriteRow],
        $executeRaw: async () => 0,
    } as unknown as PrismaClient;
}

test('POST /v1/episodic-memory/search — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => null, embedFn: stubEmbed });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/search',
            payload: { tenantId: 'tenant-1', workspaceId: 'ws-1', queryText: 'test' },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json<{ error: string }>().error, 'unauthorized');
    } finally {
        await app.close();
    }
});

test('POST /v1/episodic-memory/search — no embedFn → 503', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession(), embedFn: null });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/search',
            payload: { tenantId: 'tenant-1', workspaceId: 'ws-1', queryText: 'test' },
        });
        assert.equal(res.statusCode, 503);
    } finally {
        await app.close();
    }
});

test('POST /v1/episodic-memory/search — missing required fields → 400', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession(), embedFn: stubEmbed });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/search',
            payload: { tenantId: 'tenant-1' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/episodic-memory/search — success → 200 with results', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrismaForEpisodicSearch(), {
        getSession: () => makeSession(),
        embedFn: stubEmbed,
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/search',
            payload: { tenantId: 'tenant-1', workspaceId: 'ws-1', queryText: 'code review' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json<{ results: unknown[]; count: number }>();
        assert.equal(body.count, 1);
        assert.equal(body.results.length, 1);
    } finally {
        await app.close();
    }
});

// ===========================================================================
// Tests: POST /v1/episodic-memory/write
// ===========================================================================

test('POST /v1/episodic-memory/write — no session → 401', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => null, embedFn: stubEmbed });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/write',
            payload: { tenantId: 'tenant-1', workspaceId: 'ws-1', summary: 'Did a thing', pattern: 'code-review' },
        });
        assert.equal(res.statusCode, 401);
        assert.equal(res.json<{ error: string }>().error, 'unauthorized');
    } finally {
        await app.close();
    }
});

test('POST /v1/episodic-memory/write — no embedFn → 503', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession(), embedFn: null });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/write',
            payload: { tenantId: 'tenant-1', workspaceId: 'ws-1', summary: 'Did a thing', pattern: 'code-review' },
        });
        assert.equal(res.statusCode, 503);
    } finally {
        await app.close();
    }
});

test('POST /v1/episodic-memory/write — missing required fields → 400', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrisma(), { getSession: () => makeSession(), embedFn: stubEmbed });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/write',
            payload: { tenantId: 'tenant-1', workspaceId: 'ws-1' },
        });
        assert.equal(res.statusCode, 400);
    } finally {
        await app.close();
    }
});

test('POST /v1/episodic-memory/write — success → 201 with record', async () => {
    const app = Fastify({ logger: false });
    await registerMemoryRoutes(app, makePrismaForEpisodicWrite(), {
        getSession: () => makeSession(),
        embedFn: stubEmbed,
        embeddingDeployment: 'text-embedding-3-small',
    });
    try {
        const res = await app.inject({
            method: 'POST',
            url: '/v1/episodic-memory/write',
            payload: {
                tenantId: 'tenant-1',
                workspaceId: 'ws-1',
                summary: 'Deployed hotfix to production',
                pattern: 'deploy-hotfix',
                confidence: 0.9,
            },
        });
        assert.equal(res.statusCode, 201);
        const body = res.json<{ pattern: string; message: string }>();
        assert.equal(body.pattern, 'deploy-hotfix');
        assert.ok(body.message, 'message should be present');
    } finally {
        await app.close();
    }
});
