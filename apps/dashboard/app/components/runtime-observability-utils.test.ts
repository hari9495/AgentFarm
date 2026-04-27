import assert from 'node:assert/strict';
import test from 'node:test';
import { computeHeartbeatSuccessRate, filterRuntimeLogs, type RuntimeLogEntry } from './runtime-observability-utils';

const sampleLogs: RuntimeLogEntry[] = [
    {
        at: '2026-04-27T10:00:00.000Z',
        eventType: 'runtime.task_classified',
        runtimeState: 'active',
        correlationId: 'corr_123',
    },
    {
        at: '2026-04-27T10:00:01.000Z',
        eventType: 'runtime.approval_required',
        runtimeState: 'ready',
        correlationId: 'corr_456',
    },
    {
        at: '2026-04-27T10:00:02.000Z',
        eventType: 'runtime.heartbeat_failed',
        runtimeState: 'degraded',
        correlationId: null,
    },
];

test('filterRuntimeLogs returns all logs for blank filter', () => {
    assert.equal(filterRuntimeLogs(sampleLogs, '').length, 3);
    assert.equal(filterRuntimeLogs(sampleLogs, '   ').length, 3);
});

test('filterRuntimeLogs matches event type and is case-insensitive', () => {
    const result = filterRuntimeLogs(sampleLogs, 'APPROVAL_REQUIRED');
    assert.equal(result.length, 1);
    assert.equal(result[0]?.eventType, 'runtime.approval_required');
});

test('filterRuntimeLogs matches runtimeState and correlation id', () => {
    assert.equal(filterRuntimeLogs(sampleLogs, 'degraded').length, 1);
    assert.equal(filterRuntimeLogs(sampleLogs, 'corr_123').length, 1);
});

test('filterRuntimeLogs returns empty list for non-matching filter', () => {
    assert.equal(filterRuntimeLogs(sampleLogs, 'does-not-exist').length, 0);
});

test('computeHeartbeatSuccessRate returns null for zero attempts', () => {
    assert.equal(computeHeartbeatSuccessRate(undefined, undefined), null);
    assert.equal(computeHeartbeatSuccessRate(0, 0), null);
});

test('computeHeartbeatSuccessRate computes rounded percentage', () => {
    assert.equal(computeHeartbeatSuccessRate(9, 1), 90);
    assert.equal(computeHeartbeatSuccessRate(2, 1), 67);
});

test('computeHeartbeatSuccessRate handles failed-only heartbeat stream', () => {
    assert.equal(computeHeartbeatSuccessRate(0, 5), 0);
});
