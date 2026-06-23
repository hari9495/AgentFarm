import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    persistPendingApproval,
    deletePersistedPendingApproval,
    loadPersistedPendingApproval,
    loadAllPersistedPendingApprovals,
} from '../pending-approval-store.js';

// Minimal in-memory fake of the ioredis surface the store uses.
const makeFakeRedis = () => {
    const store = new Map<string, string>();
    return {
        store,
        async set(key: string, value: string, _mode: 'EX', _ttl: number) { store.set(key, value); return 'OK'; },
        async get(key: string) { return store.get(key) ?? null; },
        async del(key: string) { return store.delete(key) ? 1 : 0; },
        async keys(pattern: string) {
            const prefix = pattern.replace(/\*$/, '');
            return [...store.keys()].filter((k) => k.startsWith(prefix));
        },
        async mget(...keys: string[]) { return keys.map((k) => store.get(k) ?? null); },
    };
};

const record = (taskId: string) => ({ taskId, task: { taskId, payload: { actionType: 'mcp_tool_call' } }, riskLevel: 'medium' });

describe('pending-approval-store', () => {
    it('persists and loads a single pending approval', async () => {
        const redis = makeFakeRedis();
        await persistPendingApproval('t1', 'task-1', record('task-1'), redis);
        const loaded = await loadPersistedPendingApproval<{ taskId: string }>('t1', 'task-1', redis);
        assert.equal(loaded?.taskId, 'task-1');
    });

    it('returns null for a missing key', async () => {
        const redis = makeFakeRedis();
        assert.equal(await loadPersistedPendingApproval('t1', 'nope', redis), null);
    });

    it('deletes a persisted approval', async () => {
        const redis = makeFakeRedis();
        await persistPendingApproval('t1', 'task-1', record('task-1'), redis);
        await deletePersistedPendingApproval('t1', 'task-1', redis);
        assert.equal(await loadPersistedPendingApproval('t1', 'task-1', redis), null);
    });

    it('loads all pending approvals for a tenant, scoped by tenant', async () => {
        const redis = makeFakeRedis();
        await persistPendingApproval('t1', 'task-1', record('task-1'), redis);
        await persistPendingApproval('t1', 'task-2', record('task-2'), redis);
        await persistPendingApproval('t2', 'task-3', record('task-3'), redis);
        const all = await loadAllPersistedPendingApprovals<{ taskId: string }>('t1', redis);
        const ids = all.map((r) => r.taskId).sort();
        assert.deepEqual(ids, ['task-1', 'task-2']);
    });

    it('no-ops gracefully when redis is null', async () => {
        await persistPendingApproval('t1', 'task-1', record('task-1'), null);
        assert.equal(await loadPersistedPendingApproval('t1', 'task-1', null), null);
        assert.deepEqual(await loadAllPersistedPendingApprovals('t1', null), []);
        await deletePersistedPendingApproval('t1', 'task-1', null); // must not throw
    });

    it('survives a corrupt entry in loadAll', async () => {
        const redis = makeFakeRedis();
        await persistPendingApproval('t1', 'task-1', record('task-1'), redis);
        redis.store.set('af:pending-approval:t1:bad', '{not json');
        const all = await loadAllPersistedPendingApprovals<{ taskId: string }>('t1', redis);
        assert.equal(all.length, 1);
        assert.equal(all[0]!.taskId, 'task-1');
    });
});
