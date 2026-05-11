import test from 'node:test';
import assert from 'node:assert/strict';
import {
    enqueueTask,
    dequeueTask,
    getQueueSnapshot,
    getQueueDepth,
    cancelFromQueue,
    clearQueue,
    type QueueEntry,
} from '../lib/task-queue.js';

const makeEntry = (id: string, priority: QueueEntry['priority'], offset = 0): QueueEntry => ({
    id,
    tenantId: 'tenant_1',
    workspaceId: 'ws_1',
    priority,
    payload: {},
    enqueuedAt: Date.now() + offset,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

test('high priority entry jumps ahead of normal and low', () => {
    clearQueue();
    enqueueTask(makeEntry('n1', 'normal'));
    enqueueTask(makeEntry('l1', 'low'));
    enqueueTask(makeEntry('h1', 'high'));

    const snapshot = getQueueSnapshot();
    assert.equal(snapshot[0]!.id, 'h1');
    assert.equal(snapshot[1]!.id, 'n1');
    assert.equal(snapshot[2]!.id, 'l1');
});

test('low priority entry goes to end behind normal', () => {
    clearQueue();
    enqueueTask(makeEntry('n1', 'normal'));
    enqueueTask(makeEntry('n2', 'normal'));
    enqueueTask(makeEntry('l1', 'low'));

    const snapshot = getQueueSnapshot();
    assert.equal(snapshot[0]!.id, 'n1');
    assert.equal(snapshot[1]!.id, 'n2');
    assert.equal(snapshot[2]!.id, 'l1');
});

test('same priority entries are FIFO ordered', () => {
    clearQueue();
    enqueueTask(makeEntry('n1', 'normal', 0));
    enqueueTask(makeEntry('n2', 'normal', 10));
    enqueueTask(makeEntry('n3', 'normal', 20));

    const snapshot = getQueueSnapshot();
    assert.equal(snapshot[0]!.id, 'n1');
    assert.equal(snapshot[1]!.id, 'n2');
    assert.equal(snapshot[2]!.id, 'n3');
});

test('dequeueTask returns undefined on empty queue', () => {
    clearQueue();
    const result = dequeueTask();
    assert.equal(result, undefined);
});

test('dequeueTask returns highest priority entry first', () => {
    clearQueue();
    enqueueTask(makeEntry('n1', 'normal'));
    enqueueTask(makeEntry('l1', 'low'));
    enqueueTask(makeEntry('h1', 'high'));

    const first = dequeueTask();
    assert.equal(first!.id, 'h1');
    assert.equal(getQueueDepth(), 2);
});

test('cancelFromQueue removes entry and returns true', () => {
    clearQueue();
    enqueueTask(makeEntry('n1', 'normal'));
    enqueueTask(makeEntry('n2', 'normal'));

    const removed = cancelFromQueue('n1');
    assert.equal(removed, true);
    assert.equal(getQueueDepth(), 1);
    assert.equal(getQueueSnapshot()[0]!.id, 'n2');
});

test('cancelFromQueue returns false for unknown id', () => {
    clearQueue();
    enqueueTask(makeEntry('n1', 'normal'));

    const removed = cancelFromQueue('nonexistent');
    assert.equal(removed, false);
    assert.equal(getQueueDepth(), 1);
});

test('getQueueSnapshot returns a copy — mutation does not affect queue', () => {
    clearQueue();
    enqueueTask(makeEntry('n1', 'normal'));

    const snapshot = getQueueSnapshot();
    // mutate the copy
    snapshot.splice(0);

    // original queue is unaffected
    assert.equal(getQueueDepth(), 1);
    assert.equal(getQueueSnapshot()[0]!.id, 'n1');
});
