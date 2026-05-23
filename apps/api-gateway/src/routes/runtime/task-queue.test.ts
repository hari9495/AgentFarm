import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerTaskQueueRoutes } from './task-queue.js';
import { clearQueue } from '../lib/task-queue.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildSession = (role = 'operator') => ({
    userId: 'user_1',
    tenantId: `tenant_${Date.now()}`,
    workspaceIds: ['ws_1'],
    role,
    expiresAt: Date.now() + 60_000,
});

type PrismaStubEntry = {
    id: string;
    tenantId: string;
    workspaceId: string;
    priority: string;
    status: string;
};

const buildPrismaStub = (overrides: Partial<{
    create: (args: unknown) => Promise<PrismaStubEntry>;
    findMany: (args: unknown) => Promise<PrismaStubEntry[]>;
    findFirst: (args: unknown) => Promise<PrismaStubEntry | null>;
    update: (args: unknown) => Promise<PrismaStubEntry>;
}> = {}) => ({
    taskQueueEntry: {
        create: overrides.create ?? (async (_args: unknown) => ({
            id: 'entry_1',
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            priority: 'normal',
            status: 'pending',
        })),
        findMany: overrides.findMany ?? (async (_args: unknown) => []),
        findFirst: overrides.findFirst ?? (async (_args: unknown) => null),
        update: overrides.update ?? (async (_args: unknown) => ({
            id: 'entry_1',
            tenantId: 'tenant_1',
            workspaceId: 'ws_1',
            priority: 'normal',
            status: 'cancelled',
        })),
    },
});

// ─── Tests ────────────────────────────────────────────────────────────────────

test('POST /v1/task-queue — valid body returns 202 with id and priority', async () => {
    clearQueue();
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue',
            payload: { workspaceId: 'ws_1', priority: 'high', payload: { task: 'run tests' } },
        });

        assert.equal(res.statusCode, 202);
        const body = res.json<{ queued: boolean; id: string; priority: string; position: number }>();
        assert.equal(body.queued, true);
        assert.ok(typeof body.id === 'string' && body.id.length > 0);
        assert.equal(body.priority, 'high');
        assert.ok(typeof body.position === 'number');
    } finally {
        await app.close();
    }
});

test('POST /v1/task-queue — invalid priority returns 400', async () => {
    clearQueue();
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue',
            payload: { workspaceId: 'ws_1', priority: 'ultra', payload: {} },
        });

        assert.equal(res.statusCode, 400);
        const body = res.json<{ error: string }>();
        assert.equal(body.error, 'invalid_input');
    } finally {
        await app.close();
    }
});

test('POST /v1/task-queue — viewer role returns 403', async () => {
    clearQueue();
    const session = buildSession('viewer');
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue',
            payload: { workspaceId: 'ws_1', payload: {} },
        });

        assert.equal(res.statusCode, 403);
        const body = res.json<{ error: string }>();
        assert.equal(body.error, 'forbidden');
    } finally {
        await app.close();
    }
});

test('GET /v1/task-queue — returns entries for the callers tenant', async () => {
    clearQueue();
    const session = buildSession('viewer');
    const entry = {
        id: 'entry_1',
        tenantId: session.tenantId,
        workspaceId: 'ws_1',
        priority: 'normal',
        status: 'pending',
    };
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({ findMany: async () => [entry] }) as never,
        });

        const res = await app.inject({ method: 'GET', url: '/v1/task-queue' });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ entries: unknown[]; count: number }>();
        assert.equal(body.count, 1);
        assert.equal(body.entries.length, 1);
    } finally {
        await app.close();
    }
});

test('GET /v1/task-queue/status — returns depth and snapshot', async () => {
    clearQueue();
    const session = buildSession('viewer');
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });

        const res = await app.inject({ method: 'GET', url: '/v1/task-queue/status' });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ depth: number; snapshot: unknown[] }>();
        assert.ok(typeof body.depth === 'number');
        assert.ok(Array.isArray(body.snapshot));
    } finally {
        await app.close();
    }
});

test('GET /v1/task-queue/:entryId — 200 when found, 404 when not', async () => {
    clearQueue();
    const session = buildSession('viewer');
    const existingEntry = {
        id: 'entry_found',
        tenantId: session.tenantId,
        workspaceId: 'ws_1',
        priority: 'normal',
        status: 'pending',
    };
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findFirst: async (args: unknown) => {
                    const where = (args as { where?: { id?: string } }).where;
                    return where?.id === 'entry_found' ? existingEntry : null;
                },
            }) as never,
        });

        const found = await app.inject({ method: 'GET', url: '/v1/task-queue/entry_found' });
        assert.equal(found.statusCode, 200);
        assert.equal(found.json<{ entry: { id: string } }>().entry.id, 'entry_found');

        const missing = await app.inject({ method: 'GET', url: '/v1/task-queue/no_such_entry' });
        assert.equal(missing.statusCode, 404);
    } finally {
        await app.close();
    }
});

test('DELETE /v1/task-queue/:entryId — cancels a pending entry (200)', async () => {
    clearQueue();
    const session = buildSession('operator');
    const pendingEntry = {
        id: 'entry_pending',
        tenantId: session.tenantId,
        workspaceId: 'ws_1',
        priority: 'normal',
        status: 'pending',
    };
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findFirst: async () => pendingEntry,
            }) as never,
        });

        const res = await app.inject({ method: 'DELETE', url: '/v1/task-queue/entry_pending' });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ cancelled: boolean }>();
        assert.equal(body.cancelled, true);
    } finally {
        await app.close();
    }
});

test('DELETE /v1/task-queue/:entryId — returns 409 for running entry', async () => {
    clearQueue();
    const session = buildSession('operator');
    const runningEntry = {
        id: 'entry_running',
        tenantId: session.tenantId,
        workspaceId: 'ws_1',
        priority: 'normal',
        status: 'running',
    };
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findFirst: async () => runningEntry,
            }) as never,
        });

        const res = await app.inject({ method: 'DELETE', url: '/v1/task-queue/entry_running' });

        assert.equal(res.statusCode, 409);
        const body = res.json<{ error: string }>();
        assert.equal(body.error, 'cannot_cancel');
    } finally {
        await app.close();
    }
});

// ─── Dependency readiness gate tests ──────────────────────────────────────────

test('POST /v1/task-queue — dependsOn with pending dep stores dependencyMet=false', async () => {
    clearQueue();
    const session = buildSession('operator');
    let capturedData: Record<string, unknown> | null = null;
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                create: async (args: unknown) => {
                    capturedData = (args as { data: Record<string, unknown> }).data;
                    return { id: 'entry_1', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal', status: 'pending' };
                },
                findMany: async () => [{ id: 'dep_1', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal', status: 'pending' }],
            }) as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue',
            payload: { workspaceId: 'ws_1', payload: { task: 'run' }, dependsOn: ['dep_1'] },
        });

        assert.equal(res.statusCode, 202);
        assert.equal(capturedData?.['dependencyMet'], false);
    } finally {
        await app.close();
    }
});

test('POST /v1/task-queue — dependsOn with done dep stores dependencyMet=true', async () => {
    clearQueue();
    const session = buildSession('operator');
    let capturedData: Record<string, unknown> | null = null;
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                create: async (args: unknown) => {
                    capturedData = (args as { data: Record<string, unknown> }).data;
                    return { id: 'entry_1', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal', status: 'pending' };
                },
                findMany: async () => [{ id: 'dep_1', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal', status: 'done' }],
            }) as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue',
            payload: { workspaceId: 'ws_1', payload: { task: 'run' }, dependsOn: ['dep_1'] },
        });

        assert.equal(res.statusCode, 202);
        assert.equal(capturedData?.['dependencyMet'], true);
    } finally {
        await app.close();
    }
});

// ─── Complete endpoint tests ───────────────────────────────────────────────────

test('POST /v1/task-queue/:entryId/complete — 400 for invalid outcome', async () => {
    clearQueue();
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub() as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue/entry_1/complete',
            payload: { outcome: 'unknown' },
        });

        assert.equal(res.statusCode, 400);
        assert.equal(res.json<{ error: string }>().error, 'invalid_input');
    } finally {
        await app.close();
    }
});

test('POST /v1/task-queue/:entryId/complete — 404 when entry not found', async () => {
    clearQueue();
    const session = buildSession('operator');
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({ findFirst: async () => null }) as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue/nonexistent/complete',
            payload: { outcome: 'success' },
        });

        assert.equal(res.statusCode, 404);
        assert.equal(res.json<{ error: string }>().error, 'not_found');
    } finally {
        await app.close();
    }
});

test('POST /v1/task-queue/:entryId/complete — marks entry done and promotes unblocked dependents', async () => {
    clearQueue();
    const session = buildSession('operator');

    const theEntry = { id: 'entry_1', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal', status: 'pending' };
    const dependent = { id: 'dep_entry_1', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal', status: 'pending', dependsOn: ['entry_1'], dependencyMet: false };
    const updatedCalls: string[] = [];

    let findManyCallCount = 0;
    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findFirst: async () => theEntry,
                findMany: async () => {
                    findManyCallCount++;
                    if (findManyCallCount === 1) {
                        // First call: find dependents blocked on entry_1
                        return [dependent] as never;
                    }
                    // Second call: checkDependenciesMet for dep_entry_1's dep list
                    return [{ id: 'entry_1', status: 'done', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal' }];
                },
                update: async (args: unknown) => {
                    const where = (args as { where: { id: string } }).where;
                    updatedCalls.push(where.id);
                    return { ...theEntry, status: 'done' };
                },
            }) as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue/entry_1/complete',
            payload: { outcome: 'success' },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ updated: string; promoted: string[] }>();
        assert.equal(body.updated, 'entry_1');
        assert.deepEqual(body.promoted, ['dep_entry_1']);
        assert.ok(updatedCalls.includes('entry_1'), 'should update the completed entry');
        assert.ok(updatedCalls.includes('dep_entry_1'), 'should promote the dependent');
    } finally {
        await app.close();
    }
});

test('POST /v1/task-queue/:entryId/complete — marks entry failed and no promotion when deps still blocked', async () => {
    clearQueue();
    const session = buildSession('operator');

    const theEntry = { id: 'entry_1', tenantId: session.tenantId, workspaceId: 'ws_1', priority: 'normal', status: 'pending' };
    const promoted: string[] = [];

    const app = Fastify({ logger: false });
    try {
        await registerTaskQueueRoutes(app, {
            getSession: () => session,
            prisma: buildPrismaStub({
                findFirst: async () => theEntry,
                findMany: async () => [],  // no dependents blocked on this entry
                update: async () => ({ ...theEntry, status: 'failed' }),
            }) as never,
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/task-queue/entry_1/complete',
            payload: { outcome: 'failed' },
        });

        assert.equal(res.statusCode, 200);
        const body = res.json<{ updated: string; promoted: string[] }>();
        assert.equal(body.updated, 'entry_1');
        assert.deepEqual(body.promoted, promoted);
    } finally {
        await app.close();
    }
});
