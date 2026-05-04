import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {
    SseTaskQueue,
    channelKey,
    formatSseEvent,
    getOrCreateQueue,
    registerSseTaskRoutes,
    sseQueues,
    SSE_BUFFER_SIZE,
    type SseTaskEvent,
} from './sse-tasks.js';

// ── SseTaskQueue — push + sliceSince ─────────────────────────────────────────

test('SseTaskQueue.push assigns sequential eventIds', () => {
    const q = new SseTaskQueue();
    const a = q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1', taskId: 'task_1' });
    const b = q.push({ type: 'task_started', tenantId: 't1', workspaceId: 'w1', taskId: 'task_1' });
    assert.equal(a.eventId, '1');
    assert.equal(b.eventId, '2');
    assert.equal(q.size(), 2);
});

test('SseTaskQueue.push adds timestamp', () => {
    const q = new SseTaskQueue();
    const e = q.push({ type: 'heartbeat', tenantId: 't1', workspaceId: 'w1' });
    assert.ok(typeof e.timestamp === 'string' && e.timestamp.length > 0);
});

test('SseTaskQueue.sliceSince returns all events when lastEventId is null', () => {
    const q = new SseTaskQueue();
    q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1' });
    q.push({ type: 'task_started', tenantId: 't1', workspaceId: 'w1' });
    const all = q.sliceSince(null);
    assert.equal(all.length, 2);
});

test('SseTaskQueue.sliceSince returns only events after lastEventId', () => {
    const q = new SseTaskQueue();
    q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1' });
    const second = q.push({ type: 'task_started', tenantId: 't1', workspaceId: 'w1' });
    q.push({ type: 'task_completed', tenantId: 't1', workspaceId: 'w1' });
    const missed = q.sliceSince('1'); // client saw event 1, missed 2+
    assert.equal(missed.length, 2);
    assert.equal(missed[0].eventId, second.eventId); // eventId '2'
});

test('SseTaskQueue.sliceSince returns empty array when client is fully caught up', () => {
    const q = new SseTaskQueue();
    q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1' });
    const missed = q.sliceSince('1');
    assert.equal(missed.length, 0);
});

test('SseTaskQueue ring buffer evicts oldest event at max capacity', () => {
    const q = new SseTaskQueue(3);
    q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1', taskId: 'a' });
    q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1', taskId: 'b' });
    q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1', taskId: 'c' });
    q.push({ type: 'task_queued', tenantId: 't1', workspaceId: 'w1', taskId: 'd' }); // evicts 'a'
    assert.equal(q.size(), 3);
    const all = q.sliceSince(null) as (SseTaskEvent & { taskId?: string })[];
    assert.equal(all[0].taskId, 'b'); // 'a' was evicted
});

test('SseTaskQueue default buffer size is SSE_BUFFER_SIZE', () => {
    const q = new SseTaskQueue();
    for (let i = 0; i < SSE_BUFFER_SIZE + 5; i++) {
        q.push({ type: 'heartbeat', tenantId: 't1', workspaceId: 'w1' });
    }
    assert.equal(q.size(), SSE_BUFFER_SIZE);
});

// ── channelKey ────────────────────────────────────────────────────────────────

test('channelKey concatenates tenantId and workspaceId', () => {
    assert.equal(channelKey('tA', 'wB'), 'tA::wB');
});

// ── formatSseEvent ────────────────────────────────────────────────────────────

test('formatSseEvent produces valid SSE wire format', () => {
    const evt: SseTaskEvent = {
        eventId: '42',
        type: 'task_completed',
        tenantId: 't1',
        workspaceId: 'w1',
        taskId: 'task_42',
        timestamp: '2026-01-01T00:00:00Z',
    };
    const wire = formatSseEvent(evt);
    assert.ok(wire.startsWith('id: 42'));
    assert.ok(wire.includes('event: task_completed'));
    assert.ok(wire.includes('"taskId":"task_42"'));
    // Must end with double newline (SSE event terminator)
    assert.ok(wire.endsWith('\n\n'));
});

// ── getOrCreateQueue ──────────────────────────────────────────────────────────

test('getOrCreateQueue returns same queue for same channel', () => {
    sseQueues.clear();
    const q1 = getOrCreateQueue('tX', 'wX');
    const q2 = getOrCreateQueue('tX', 'wX');
    assert.strictEqual(q1, q2);
});

test('getOrCreateQueue returns different queues for different channels', () => {
    sseQueues.clear();
    const q1 = getOrCreateQueue('tX', 'w1');
    const q2 = getOrCreateQueue('tX', 'w2');
    assert.notStrictEqual(q1, q2);
});

// ── HTTP route: POST /sse/tasks/push ─────────────────────────────────────────

const internalSession = {
    userId: 'user_1',
    tenantId: 'tenant_1',
    workspaceIds: ['ws_1', 'ws_2'],
    scope: 'internal' as const,
    expiresAt: Date.now() + 60_000,
};

async function buildApp() {
    sseQueues.clear();
    const testQueues = new Map<string, SseTaskQueue>();
    const app = Fastify();
    await registerSseTaskRoutes(app, {
        getSession: () => internalSession,
        getQueue: (tenantId, workspaceId) => {
            const key = channelKey(tenantId, workspaceId);
            let q = testQueues.get(key);
            if (!q) { q = new SseTaskQueue(); testQueues.set(key, q); }
            return q;
        },
    });
    return { app, testQueues };
}

test('POST /sse/tasks/push returns 200 with eventId', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
        method: 'POST',
        url: '/sse/tasks/push',
        payload: { tenantId: 'tenant_1', workspaceId: 'ws_1', type: 'task_queued', taskId: 'task_99' },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as { eventId: string };
    assert.equal(body.eventId, '1');
});

test('POST /sse/tasks/push returns 400 when tenantId missing', async () => {
    const { app } = await buildApp();
    const res = await app.inject({
        method: 'POST',
        url: '/sse/tasks/push',
        payload: { workspaceId: 'ws_1', type: 'task_queued' },
    });
    assert.equal(res.statusCode, 400);
});

test('POST /sse/tasks/push increments eventId on successive pushes', async () => {
    const { app } = await buildApp();
    await app.inject({
        method: 'POST',
        url: '/sse/tasks/push',
        payload: { tenantId: 'tenant_1', workspaceId: 'ws_1', type: 'task_queued' },
    });
    const res = await app.inject({
        method: 'POST',
        url: '/sse/tasks/push',
        payload: { tenantId: 'tenant_1', workspaceId: 'ws_1', type: 'task_started' },
    });
    const body = JSON.parse(res.body) as { eventId: string };
    assert.equal(body.eventId, '2');
});

// ── HTTP route: GET /sse/tasks — auth guard ───────────────────────────────────

test('GET /sse/tasks returns 401 for null session', async () => {
    sseQueues.clear();
    const app = Fastify();
    await registerSseTaskRoutes(app, {
        getSession: () => null,
    });
    const res = await app.inject({ method: 'GET', url: '/sse/tasks?workspaceId=ws_1' });
    assert.equal(res.statusCode, 401);
});

test('GET /sse/tasks returns 403 for workspace not in session', async () => {
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/sse/tasks?workspaceId=ws_forbidden' });
    assert.equal(res.statusCode, 403);
});
