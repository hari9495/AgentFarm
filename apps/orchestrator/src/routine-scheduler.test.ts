/**
 * Epic B4: Feature-Flagged Routine Scheduler Tests
 * Tests feature flag control, concurrency policies, and error isolation
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import { RoutineScheduler, type CreateScheduledTaskRequest } from './routine-scheduler.js';

test('B4: scheduler is disabled by default for workspace', async () => {
    const scheduler = new RoutineScheduler();

    const request: CreateScheduledTaskRequest = {
        botId: 'bot-1',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        scheduleType: 'daily',
        scheduleExpression: '0 9 * * *',
        taskPayload: { action: 'check_tasks' },
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'daily-check', concurrencyPolicy: 'queue', maxRetries: 3, retryBackoffMs: 5000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    };

    const task = await scheduler.createScheduledTask(request);
    assert.equal(task.enabled, false); // Feature flag not enabled
    assert.equal(task.isFeatureFlagged, true);
});

test('B4: scheduler can be enabled via feature flag', async () => {
    const scheduler = new RoutineScheduler();
    scheduler.enableFeatureFlag('scheduler.routine_tasks');

    const request: CreateScheduledTaskRequest = {
        botId: 'bot-2',
        tenantId: 'tenant-2',
        workspaceId: 'ws-2',
        scheduleType: 'hourly',
        scheduleExpression: '0 * * * *',
        taskPayload: { action: 'hourly_check' },
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'hourly', concurrencyPolicy: 'skip', maxRetries: 1, retryBackoffMs: 1000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    };

    const task = await scheduler.createScheduledTask(request);
    assert.equal(task.enabled, true); // Feature flag enabled
});

test('B4: scheduleRun respects queue concurrency policy', async () => {
    const scheduler = new RoutineScheduler();
    scheduler.enableFeatureFlag('scheduler.routine_tasks');

    const task = await scheduler.createScheduledTask({
        botId: 'bot-3',
        tenantId: 'tenant-3',
        workspaceId: 'ws-3',
        scheduleType: 'daily',
        scheduleExpression: '0 9 * * *',
        taskPayload: {},
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'queue-test', concurrencyPolicy: 'queue', maxRetries: 3, retryBackoffMs: 5000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    });

    const run1 = await scheduler.scheduleRun(task.id, 'corr-1');
    assert.equal(run1.deduplicated, false);

    // Second run should be queued (deduplicated)
    const run2 = await scheduler.scheduleRun(task.id, 'corr-2');
    assert.equal(run2.deduplicated, true);
    assert.notEqual(run2.runId, run1.runId);
});

test('B4: scheduleRun respects replace concurrency policy', async () => {
    const scheduler = new RoutineScheduler();
    scheduler.enableFeatureFlag('scheduler.routine_tasks');

    const task = await scheduler.createScheduledTask({
        botId: 'bot-4',
        tenantId: 'tenant-4',
        workspaceId: 'ws-4',
        scheduleType: 'daily',
        scheduleExpression: '0 9 * * *',
        taskPayload: {},
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'replace-test', concurrencyPolicy: 'replace', maxRetries: 3, retryBackoffMs: 5000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    });

    const run1 = await scheduler.scheduleRun(task.id, 'corr-1');
    const run1Id = run1.runId;

    // Second run should replace first
    const run2 = await scheduler.scheduleRun(task.id, 'corr-2');
    assert.notEqual(run2.runId, run1Id); // Different run IDs
    assert.equal(run2.deduplicated, false); // Not deduplicated, replaced
});

test('B4: scheduleRun respects skip concurrency policy', async () => {
    const scheduler = new RoutineScheduler();
    scheduler.enableFeatureFlag('scheduler.routine_tasks');

    const task = await scheduler.createScheduledTask({
        botId: 'bot-5',
        tenantId: 'tenant-5',
        workspaceId: 'ws-5',
        scheduleType: 'daily',
        scheduleExpression: '0 9 * * *',
        taskPayload: {},
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'skip-test', concurrencyPolicy: 'skip', maxRetries: 3, retryBackoffMs: 5000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    });

    const run1 = await scheduler.scheduleRun(task.id, 'corr-1');
    const run1Id = run1.runId;

    // Second run should be skipped
    const run2 = await scheduler.scheduleRun(task.id, 'corr-2');
    assert.equal(run2.runId, run1Id); // Same run ID
    assert.equal(run2.deduplicated, true); // Skipped
});

test('B4: scheduler failures do not block manual assignment', async () => {
    const scheduler = new RoutineScheduler();

    // Record a scheduler error
    scheduler.recordSchedulerError('task-1', 'Network timeout');

    // Should still be able to create new tasks
    scheduler.enableFeatureFlag('scheduler.routine_tasks');
    const task = await scheduler.createScheduledTask({
        botId: 'bot-6',
        tenantId: 'tenant-6',
        workspaceId: 'ws-6',
        scheduleType: 'daily',
        scheduleExpression: '0 9 * * *',
        taskPayload: {},
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'error-test', concurrencyPolicy: 'queue', maxRetries: 3, retryBackoffMs: 5000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    });

    assert.ok(task.id);
});

test('B4: completeScheduledRun updates task status', async () => {
    const scheduler = new RoutineScheduler();
    scheduler.enableFeatureFlag('scheduler.routine_tasks');

    const task = await scheduler.createScheduledTask({
        botId: 'bot-7',
        tenantId: 'tenant-7',
        workspaceId: 'ws-7',
        scheduleType: 'daily',
        scheduleExpression: '0 9 * * *',
        taskPayload: {},
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'complete-test', concurrencyPolicy: 'queue', maxRetries: 3, retryBackoffMs: 5000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    });

    const run = await scheduler.scheduleRun(task.id, 'corr-1');

    await scheduler.completeScheduledRun(task.id, run.runId, 'completed', 'corr-2');

    const updated = await scheduler.getScheduledTask(task.id);
    assert.equal(updated?.status, 'completed');
    assert.equal(updated?.lastCompletedRunId, run.runId);
});

test('B4: listScheduledTasksForBot returns bot tasks', async () => {
    const scheduler = new RoutineScheduler();
    scheduler.enableFeatureFlag('scheduler.routine_tasks');

    const botId = 'bot-8';
    const task1 = await scheduler.createScheduledTask({
        botId,
        tenantId: 'tenant-8',
        workspaceId: 'ws-8a',
        scheduleType: 'daily',
        scheduleExpression: '0 9 * * *',
        taskPayload: {},
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'task1', concurrencyPolicy: 'queue', maxRetries: 3, retryBackoffMs: 5000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-1',
    });

    const task2 = await scheduler.createScheduledTask({
        botId,
        tenantId: 'tenant-8',
        workspaceId: 'ws-8b',
        scheduleType: 'hourly',
        scheduleExpression: '0 * * * *',
        taskPayload: {},
        policyPackVersion: '1.0.0',
        policy: { dedupeKey: 'task2', concurrencyPolicy: 'skip', maxRetries: 1, retryBackoffMs: 1000 },
        featureFlagKey: 'scheduler.routine_tasks',
        correlationId: 'corr-2',
    });

    const tasks = await scheduler.listScheduledTasksForBot(botId);
    assert.equal(tasks.length, 2);
});

test('B4: getRecentErrors returns error log (non-blocking)', () => {
    const scheduler = new RoutineScheduler();

    scheduler.recordSchedulerError('task-1', 'Error 1');
    scheduler.recordSchedulerError('task-2', 'Error 2');
    scheduler.recordSchedulerError('task-3', 'Error 3');

    const errors = scheduler.getRecentErrors(2);
    assert.equal(errors.length, 2);
    assert.equal(errors[0].error, 'Error 2');
    assert.equal(errors[1].error, 'Error 3');
});
