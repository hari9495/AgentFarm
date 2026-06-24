import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeferredTaskSweep } from './deferred-task-sweep.js';

type Capture = { url: string; body?: string };

const makePrisma = (tasks: any[]) => {
    const updates: any[] = [];
    const prisma = {
        deferredTask: {
            findMany: async (args: any) => {
                const now: Date = args.where.runAfter.lte;
                return tasks.filter((t) => t.status === 'pending' && t.runAfter <= now);
            },
            update: async (args: any) => {
                updates.push(args);
                const t = tasks.find((x) => x.id === args.where.id);
                if (t) Object.assign(t, args.data);
                return {};
            },
        },
    } as any;
    return { prisma, updates };
};

// 1. Releases a due task to the runtime and marks it released
test('runDeferredTaskSweep — releases due task and marks released', async () => {
    const tasks = [
        {
            id: 'd1',
            status: 'pending',
            attempts: 0,
            runAfter: new Date('2026-06-29T09:00:00Z'),
            payload: { tenantId: 't1', agentId: 'a1', goal: '{"task":"x"}', triggeredBy: 'tracker_poll' },
        },
    ];
    const { prisma, updates } = makePrisma(tasks);
    const calls: Capture[] = [];
    const fetcher = async (url: string, init?: any) => {
        calls.push({ url, body: init?.body });
        return { ok: true, status: 200, text: async () => 'ok' } as any;
    };

    const now = new Date('2026-06-29T09:00:30Z'); // just after shift open
    const result = await runDeferredTaskSweep(prisma, { fetcher, agentRuntimeUrl: 'http://rt', now: () => now });

    assert.equal(result.released, 1);
    assert.equal(result.failed, 0);
    assert.equal(calls[0]!.url, 'http://rt/run-task');
    assert.equal(JSON.parse(calls[0]!.body!).agentId, 'a1');
    assert.equal(updates[0].data.status, 'released');
    assert.ok(updates[0].data.releasedAt instanceof Date);
});

// 2. Not-yet-due tasks are left alone
test('runDeferredTaskSweep — leaves future tasks untouched', async () => {
    const tasks = [
        { id: 'd1', status: 'pending', attempts: 0, runAfter: new Date('2026-07-01T09:00:00Z'), payload: {} },
    ];
    const { prisma, updates } = makePrisma(tasks);
    let called = false;
    const fetcher = async () => {
        called = true;
        return { ok: true, status: 200, text: async () => 'ok' } as any;
    };

    const now = new Date('2026-06-29T09:00:30Z');
    const result = await runDeferredTaskSweep(prisma, { fetcher, now: () => now });

    assert.equal(result.released, 0);
    assert.equal(called, false);
    assert.equal(updates.length, 0);
});

// 3. Runtime error keeps task pending and records attempts/lastError
test('runDeferredTaskSweep — failed release stays pending and records error', async () => {
    const tasks = [
        { id: 'd1', status: 'pending', attempts: 0, runAfter: new Date('2026-06-29T09:00:00Z'), payload: {} },
    ];
    const { prisma, updates } = makePrisma(tasks);
    const fetcher = async () => ({ ok: false, status: 503, text: async () => 'down' }) as any;

    const now = new Date('2026-06-29T10:00:00Z');
    const result = await runDeferredTaskSweep(prisma, { fetcher, now: () => now });

    assert.equal(result.released, 0);
    assert.equal(result.failed, 1);
    assert.equal(updates[0].data.status, 'pending'); // retried next sweep
    assert.equal(updates[0].data.attempts, 1);
    assert.match(updates[0].data.lastError, /503/);
});

// 4. After MAX_ATTEMPTS the task is marked failed (no infinite loop)
test('runDeferredTaskSweep — gives up after max attempts', async () => {
    const tasks = [
        { id: 'd1', status: 'pending', attempts: 4, runAfter: new Date('2026-06-29T09:00:00Z'), payload: {} },
    ];
    const { prisma, updates } = makePrisma(tasks);
    const fetcher = async () => ({ ok: false, status: 500, text: async () => 'err' }) as any;

    const now = new Date('2026-06-29T10:00:00Z');
    await runDeferredTaskSweep(prisma, { fetcher, now: () => now });

    assert.equal(updates[0].data.attempts, 5);
    assert.equal(updates[0].data.status, 'failed');
});
