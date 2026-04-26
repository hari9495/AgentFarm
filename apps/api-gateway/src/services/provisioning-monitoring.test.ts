import test from 'node:test';
import assert from 'node:assert/strict';
import {
    evaluateMonitoringActions,
    PROVISIONING_STUCK_ALERT_MS,
    PROVISIONING_TIMEOUT_MS,
    STUCK_ALERT_COOLDOWN_MS,
} from './provisioning-monitoring.js';

test('flags timeout for active provisioning job older than 24h', () => {
    const nowMs = Date.now();
    const jobs = [
        {
            id: 'job-timeout',
            status: 'bootstrapping_vm',
            startedAt: new Date(nowMs - PROVISIONING_TIMEOUT_MS - 60_000),
            updatedAt: new Date(nowMs - 60_000),
        },
    ];

    const result = evaluateMonitoringActions(jobs, nowMs, new Map());

    assert.deepEqual(result.timedOutJobIds, ['job-timeout']);
    assert.deepEqual(result.stuckAlertJobIds, []);
});

test('emits stuck alert when monitored state is stale beyond threshold', () => {
    const nowMs = Date.now();
    const jobs = [
        {
            id: 'job-stuck',
            status: 'cleanup_pending',
            startedAt: new Date(nowMs - 2 * 60_000),
            updatedAt: new Date(nowMs - PROVISIONING_STUCK_ALERT_MS - 5_000),
        },
    ];

    const result = evaluateMonitoringActions(jobs, nowMs, new Map());

    assert.deepEqual(result.timedOutJobIds, []);
    assert.deepEqual(result.stuckAlertJobIds, ['job-stuck']);
    assert.equal(result.nextAlertMap.get('job-stuck'), nowMs);
});

test('does not emit repeated stuck alert inside cooldown window', () => {
    const nowMs = Date.now();
    const jobs = [
        {
            id: 'job-cooldown',
            status: 'failed',
            startedAt: new Date(nowMs - 10 * 60_000),
            updatedAt: new Date(nowMs - PROVISIONING_STUCK_ALERT_MS - 5_000),
        },
    ];

    const alertMap = new Map<string, number>([
        ['job-cooldown', nowMs - STUCK_ALERT_COOLDOWN_MS + 30_000],
    ]);

    const result = evaluateMonitoringActions(jobs, nowMs, alertMap);

    assert.deepEqual(result.stuckAlertJobIds, []);
    assert.equal(result.nextAlertMap.get('job-cooldown'), nowMs - STUCK_ALERT_COOLDOWN_MS + 30_000);
});
