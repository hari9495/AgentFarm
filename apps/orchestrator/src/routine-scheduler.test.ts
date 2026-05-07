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

test('B4: detectProactiveSignals detects stale PR, stale ticket, budget warning, CI failures, and dependency CVEs', async () => {
    const scheduler = new RoutineScheduler();

    const detected = await scheduler.detectProactiveSignals({
        tenantId: 'tenant-9',
        workspaceId: 'ws-9',
        botId: 'bot-9',
        correlationId: 'corr-signals-1',
        pullRequests: [
            { id: 'pr-1', title: 'Refactor auth', daysSinceUpdate: 20 },
            { id: 'pr-2', title: 'Fresh PR', daysSinceUpdate: 2 },
        ],
        tickets: [
            { id: 'ticket-1', title: 'Billing bug', hoursSinceUpdate: 90 },
            { id: 'ticket-2', title: 'Fresh ticket', hoursSinceUpdate: 4 },
        ],
        budgetUtilizationRatio: 0.92,
        ciFailures: [
            { workflowName: 'ci-main', branch: 'main', failureCount: 2 },
            { workflowName: 'ci-feature', branch: 'feature/refactor', failureCount: 5 },
        ],
        dependencyVulnerabilities: [
            { dependencyName: 'openssl', cveId: 'CVE-2026-0001', severity: 'critical' },
            { dependencyName: 'left-pad', cveId: 'CVE-2026-0002', severity: 'low' },
        ],
    });

    assert.equal(detected.length, 5);
    assert.equal(detected.some((signal) => signal.signalType === 'stale_pr'), true);
    assert.equal(detected.some((signal) => signal.signalType === 'stale_ticket'), true);
    assert.equal(detected.some((signal) => signal.signalType === 'budget_warning'), true);
    assert.equal(detected.some((signal) => signal.signalType === 'ci_failure_on_main'), true);
    assert.equal(detected.some((signal) => signal.signalType === 'dependency_cve'), true);

    const listed = scheduler.listProactiveSignals({ workspaceId: 'ws-9' });
    assert.equal(listed.length, 5);
});

test('B4: detectProactiveSignals deduplicates open signals by source', async () => {
    const scheduler = new RoutineScheduler();

    const first = await scheduler.detectProactiveSignals({
        tenantId: 'tenant-10',
        workspaceId: 'ws-10',
        botId: 'bot-10',
        correlationId: 'corr-signals-1',
        pullRequests: [{ id: 'pr-dedupe', title: 'Long running PR', daysSinceUpdate: 16 }],
    });
    const second = await scheduler.detectProactiveSignals({
        tenantId: 'tenant-10',
        workspaceId: 'ws-10',
        botId: 'bot-10',
        correlationId: 'corr-signals-2',
        pullRequests: [{ id: 'pr-dedupe', title: 'Long running PR', daysSinceUpdate: 18 }],
    });

    assert.equal(first.length, 1);
    assert.equal(second.length, 1);
    assert.equal(first[0]?.id, second[0]?.id);
    assert.equal(scheduler.listProactiveSignals({ workspaceId: 'ws-10' }).length, 1);
});

test('B4: resolveProactiveSignal marks signal resolved and removes from open filter', async () => {
    const scheduler = new RoutineScheduler();
    const detected = await scheduler.detectProactiveSignals({
        tenantId: 'tenant-11',
        workspaceId: 'ws-11',
        botId: 'bot-11',
        correlationId: 'corr-signals-1',
        tickets: [{ id: 'ticket-resolve', title: 'Needs owner', hoursSinceUpdate: 100 }],
    });

    assert.equal(detected.length, 1);
    const resolved = scheduler.resolveProactiveSignal(detected[0]!.id);
    assert.equal(resolved, true);
    assert.equal(scheduler.listProactiveSignals({ workspaceId: 'ws-11', status: 'open' }).length, 0);
    assert.equal(scheduler.listProactiveSignals({ workspaceId: 'ws-11', status: 'resolved' }).length, 1);
});
