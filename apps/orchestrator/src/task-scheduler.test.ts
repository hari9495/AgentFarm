/**
 * Epic B1: Heartbeat Wake Model Tests
 * Tests coalescing logic, wake sources, and deterministic terminal statuses
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import { TaskScheduler, type WakeRequest } from './task-scheduler.js';

test('B1: scheduleWake creates new run on first wakeup', async () => {
    const scheduler = new TaskScheduler();
    const request: WakeRequest = {
        botId: 'bot-1',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        wakeSource: 'on_demand',
        correlationId: 'corr-1',
        timestamp: new Date().toISOString(),
    };

    const result = await scheduler.scheduleWake(request);
    assert.equal(result.isNewRun, true);
    assert.equal(result.coalesced, false);
    assert.ok(result.runId);
});

test('B1: duplicate timer wakeups coalesce into single run', async () => {
    const scheduler = new TaskScheduler();
    const botId = 'bot-2';
    const dedupeKey = TaskScheduler.generateDedupeKey('timer', botId, 'hourly');

    const request1: WakeRequest = {
        botId,
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        wakeSource: 'timer',
        dedupeKey,
        correlationId: 'corr-1',
        timestamp: new Date().toISOString(),
    };

    const result1 = await scheduler.scheduleWake(request1);
    assert.equal(result1.isNewRun, true);
    const runId = result1.runId;

    // Second wakeup within same hour should coalesce
    const request2: WakeRequest = {
        ...request1,
        correlationId: 'corr-2',
    };

    const result2 = await scheduler.scheduleWake(request2);
    assert.equal(result2.isNewRun, false);
    assert.equal(result2.coalesced, true);
    assert.equal(result2.runId, runId);
});

test('B1: automation wakeups coalesce within 5-second window', async () => {
    const scheduler = new TaskScheduler();
    const botId = 'bot-3';

    // Both wakeups get same dedupeKey for automation
    const dedupeKey = TaskScheduler.generateDedupeKey('automation', botId);

    const request1: WakeRequest = {
        botId,
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        wakeSource: 'automation',
        dedupeKey,
        correlationId: 'corr-1',
        timestamp: new Date().toISOString(),
    };

    const result1 = await scheduler.scheduleWake(request1);
    const runId = result1.runId;

    const request2: WakeRequest = {
        ...request1,
        correlationId: 'corr-2',
    };

    const result2 = await scheduler.scheduleWake(request2);
    assert.equal(result2.coalesced, true);
    assert.equal(result2.runId, runId);
});

test('B1: on_demand wakeups do not coalesce', async () => {
    const scheduler = new TaskScheduler();
    const botId = 'bot-4';

    const request1: WakeRequest = {
        botId,
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        wakeSource: 'on_demand',
        correlationId: 'corr-1',
        timestamp: new Date().toISOString(),
    };

    const result1 = await scheduler.scheduleWake(request1);
    const runId1 = result1.runId;

    const request2: WakeRequest = {
        ...request1,
        correlationId: 'corr-2',
    };

    const result2 = await scheduler.scheduleWake(request2);
    // On-demand does not coalesce even with same bot
    assert.notEqual(result2.runId, runId1);
    assert.equal(result2.isNewRun, true);
});

test('B1: completeRun marks terminal status', () => {
    const scheduler = new TaskScheduler();

    // This test verifies the API accepts valid terminal statuses
    // In production, this would update database state
    assert.doesNotThrow(() => {
        scheduler.completeRun('run-1', 'completed');
        scheduler.completeRun('run-2', 'cancelled');
        scheduler.completeRun('run-3', 'failed');
        scheduler.completeRun('run-4', 'timeout');
    });
});

test('B1: completeRun rejects invalid terminal status', () => {
    const scheduler = new TaskScheduler();

    assert.throws(
        () => {
            scheduler.completeRun('run-1', 'queued' as any);
        },
        /Invalid terminal status/
    );

    assert.throws(
        () => {
            scheduler.completeRun('run-1', 'active' as any);
        },
        /Invalid terminal status/
    );
});

test('B1: generateDedupeKey produces hourly timer keys with date+hour', () => {
    const botId = 'bot-5';
    const key = TaskScheduler.generateDedupeKey('timer', botId, 'hourly');

    assert.ok(key !== undefined, 'Expected timer wake source to produce a dedupe key');
    assert.match(key!, /^timer:bot-5:hourly:\d{4}-\d{2}-\d{2}:\d{1,2}$/);
});

test('B1: assignment wakeups generate time-based dedupe keys', () => {
    const botId = 'bot-6';
    const key = TaskScheduler.generateDedupeKey('assignment', botId);

    assert.ok(key !== undefined, 'Expected assignment wake source to produce a dedupe key');
    assert.match(key!, /^assign:bot-6:\d+$/);
});

test('B8: dispatchPendingTasks respects plan slot limit', async () => {
    const scheduler = new TaskScheduler();
    const started = await scheduler.dispatchPendingTasks({
        workspaceId: 'ws-8',
        tenantId: 'tenant-8',
        planTier: 'pro',
        pendingTasks: [
            { taskId: 'task-a' },
            { taskId: 'task-b' },
            { taskId: 'task-c' },
            { taskId: 'task-d' },
        ],
        executor: async () => {
            return;
        },
    });

    assert.equal(started.length, 3);
    assert.equal(scheduler.listTaskSlots('ws-8').length, 3);
});

test('B8: slot park/unblock/release lifecycle updates scheduler state', async () => {
    const scheduler = new TaskScheduler();
    const started = await scheduler.dispatchPendingTasks({
        workspaceId: 'ws-9',
        tenantId: 'tenant-9',
        planTier: 'free',
        pendingTasks: [{ taskId: 'task-a' }],
        executor: async () => {
            return;
        },
    });

    assert.equal(started.length, 1);
    const slotId = started[0]!.slotId;

    scheduler.parkTaskSlot('ws-9', slotId, 'waiting_approval', 'approval_received');
    assert.equal(scheduler.listTaskSlots('ws-9')[0]?.status, 'waiting_approval');

    scheduler.unblockTaskSlot('ws-9', slotId);
    assert.equal(scheduler.listTaskSlots('ws-9')[0]?.status, 'active');

    scheduler.releaseTaskSlot('ws-9', slotId);
    assert.equal(scheduler.listTaskSlots('ws-9')[0]?.status, 'idle');
});
