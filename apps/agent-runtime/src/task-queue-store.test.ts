import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createTaskQueueStore, type RedisLike } from './task-queue-store.js';

// ---------------------------------------------------------------------------
// Fake Redis — just the hash surface the store uses
// ---------------------------------------------------------------------------

const makeFakeRedis = (): RedisLike & { hashes: Map<string, Map<string, string>> } => {
    const hashes = new Map<string, Map<string, string>>();
    return {
        hashes,
        async hset(key: string, field: string, value: string): Promise<number> {
            if (!hashes.has(key)) hashes.set(key, new Map());
            hashes.get(key)!.set(field, value);
            return 1;
        },
        async hdel(key: string, field: string): Promise<number> {
            return hashes.get(key)?.delete(field) ? 1 : 0;
        },
        async hgetall(key: string): Promise<Record<string, string>> {
            return Object.fromEntries(hashes.get(key) ?? new Map());
        },
        async expire(): Promise<number> {
            return 1;
        },
    };
};

const sampleTask = (taskId: string) => ({
    taskId,
    payload: { action_type: 'read_task', summary: `work item ${taskId}`, target: 'x' },
    enqueuedAt: 1_700_000_000_000,
});

// ---------------------------------------------------------------------------
// Redis-backed store
// ---------------------------------------------------------------------------

test('redis store persists, restores, and removes queued tasks per bot', async () => {
    const redis = makeFakeRedis();
    const store = createTaskQueueStore({ redis });

    await store.persist('bot-1', sampleTask('t-1'));
    await store.persist('bot-1', sampleTask('t-2'));
    await store.persist('bot-other', sampleTask('t-9'));

    const restored = await store.loadAll('bot-1');
    assert.equal(restored.length, 2);
    assert.deepEqual(restored.map((t) => t.taskId).sort(), ['t-1', 't-2']);
    assert.equal(restored[0]!.payload['action_type'], 'read_task');

    await store.remove('bot-1', 't-1');
    const afterRemove = await store.loadAll('bot-1');
    assert.deepEqual(afterRemove.map((t) => t.taskId), ['t-2']);

    // Other bot's queue untouched
    assert.equal((await store.loadAll('bot-other')).length, 1);
});

test('redis store skips corrupt entries instead of failing the whole restore', async () => {
    const redis = makeFakeRedis();
    const store = createTaskQueueStore({ redis });
    await store.persist('bot-1', sampleTask('t-1'));
    redis.hashes.get('af:runtime:queue:v1:bot-1')!.set('t-bad', 'not-json{');

    const restored = await store.loadAll('bot-1');
    assert.deepEqual(restored.map((t) => t.taskId), ['t-1']);
});

// ---------------------------------------------------------------------------
// File fallback store (no Redis)
// ---------------------------------------------------------------------------

test('file-fallback store round-trips tasks across store instances (restart survival)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'af-task-queue-test-'));

    const store = createTaskQueueStore({ redis: null, dir });
    await store.persist('bot-1', sampleTask('t-1'));
    await store.persist('bot-1', sampleTask('t-2'));
    await store.remove('bot-1', 't-2');

    // Fresh instance over the same dir — simulates a process restart.
    const reborn = createTaskQueueStore({ redis: null, dir });
    const restored = await reborn.loadAll('bot-1');
    assert.deepEqual(restored.map((t) => t.taskId), ['t-1']);
    assert.equal(restored[0]!.payload['summary'], 'work item t-1');
});

test('file-fallback loadAll returns empty for a bot with no persisted tasks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'af-task-queue-test-'));
    const store = createTaskQueueStore({ redis: null, dir });
    assert.deepEqual(await store.loadAll('bot-never-seen'), []);
});

test('store operations never throw when the backend errors (durability is best-effort)', async () => {
    const brokenRedis: RedisLike = {
        async hset(): Promise<number> { throw new Error('redis down'); },
        async hdel(): Promise<number> { throw new Error('redis down'); },
        async hgetall(): Promise<Record<string, string>> { throw new Error('redis down'); },
        async expire(): Promise<number> { throw new Error('redis down'); },
    };
    const store = createTaskQueueStore({ redis: brokenRedis });

    await store.persist('bot-1', sampleTask('t-1'));
    await store.remove('bot-1', 't-1');
    assert.deepEqual(await store.loadAll('bot-1'), []);
});
