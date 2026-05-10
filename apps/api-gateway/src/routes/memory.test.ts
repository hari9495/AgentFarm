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
