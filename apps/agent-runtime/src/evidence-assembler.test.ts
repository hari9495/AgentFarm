import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleEvidenceRecord, extractExecutionLogsFromBuffer, getEvidenceSummary } from './evidence-assembler.js';
import type { TaskEnvelope } from './execution-engine.js';
import type { ActionResultRecord } from './action-result-contract.js';
import type { ExecutionLogEntry } from './evidence-record-contract.js';

const createMockTask = (overrides = {}): TaskEnvelope => ({
    taskId: 'task_001',
    payload: {
        tenantId: 'tenant_acme_001',
        workspaceId: 'ws_primary_001',
        botId: 'bot_dev_001',
        capability: 'modify_code',
        intent: 'refactor database schema',
    },
    enqueuedAt: Date.now(),
    ...overrides,
});

const createMockActionResult = (overrides = {}): ActionResultRecord => ({
    recordId: 'rec_001',
    recordedAt: new Date().toISOString(),
    tenantId: 'tenant_acme_001',
    workspaceId: 'ws_primary_001',
    botId: 'bot_dev_001',
    roleProfile: 'developer_agent',
    policyPackVersion: '2.1.0',
    correlationId: 'corr_task_001',
    taskId: 'task_001',
    actionType: 'modify_code',
    riskLevel: 'high',
    confidence: 0.95,
    route: 'execute',
    status: 'success',
    attempts: 1,
    retries: 0,
    ...overrides,
});

const createMockExecutionLogs = (): ExecutionLogEntry[] => [
    {
        timestamp: '2026-04-20T09:11:00.000Z',
        level: 'info',
        message: 'Starting action execution',
    },
    {
        timestamp: '2026-04-20T09:11:05.000Z',
        level: 'info',
        message: '[lint] check_type=lint Running linter checks',
        context: { check_type: 'lint' },
    },
    {
        timestamp: '2026-04-20T09:11:06.000Z',
        level: 'info',
        message: 'Linter passed all checks',
    },
    {
        timestamp: '2026-04-20T09:11:10.000Z',
        level: 'info',
        message: '[test] check_type=test Running test suite',
        context: { check_type: 'test' },
    },
    {
        timestamp: '2026-04-20T09:11:15.000Z',
        level: 'info',
        message: 'All tests passed',
    },
    {
        timestamp: '2026-04-20T09:11:20.000Z',
        level: 'info',
        message: 'Action completed successfully',
    },
];

test('assembleEvidenceRecord creates complete evidence from task and action result', () => {
    const task = createMockTask();
    const actionResult = createMockActionResult();
    const logs = createMockExecutionLogs();
    const startedAt = '2026-04-20T09:11:00.000Z';
    const completedAt = '2026-04-20T09:11:20.000Z';
    const durationMs = 20000;

    const evidence = assembleEvidenceRecord({
        task,
        actionResult,
        executionLogs: logs,
        approvalId: 'APR-1001',
        startedAt,
        completedAt,
        durationMs,
    });

    assert.equal(evidence.taskId, 'task_001');
    assert.equal(evidence.approvalId, 'APR-1001');
    assert.equal(evidence.actionType, 'modify_code');
    assert.equal(evidence.actionStatus, 'success');
    assert.equal(evidence.executionDurationMs, 20000);
    assert.ok(evidence.executionLogs.length > 0);
    assert.equal(evidence.actionOutcome.success, true);
});

test('assembleEvidenceRecord includes quality gate results from logs', () => {
    const task = createMockTask();
    const actionResult = createMockActionResult();
    const logs = createMockExecutionLogs();

    const evidence = assembleEvidenceRecord({
        task,
        actionResult,
        executionLogs: logs,
        startedAt: '2026-04-20T09:11:00.000Z',
        completedAt: '2026-04-20T09:11:20.000Z',
        durationMs: 20000,
    });

    assert.ok(evidence.qualityGateResults.length > 0);
});

test('assembleEvidenceRecord captures failed action status', () => {
    const task = createMockTask();
    const actionResult = createMockActionResult({
        status: 'failed',
        errorMessage: 'Database migration rollback timeout',
        failureClass: 'transient_error',
    });
    const logs = createMockExecutionLogs();

    const evidence = assembleEvidenceRecord({
        task,
        actionResult,
        executionLogs: logs,
        startedAt: '2026-04-20T09:11:00.000Z',
        completedAt: '2026-04-20T09:11:20.000Z',
        durationMs: 20000,
    });

    assert.equal(evidence.actionStatus, 'failed');
    assert.equal(evidence.actionOutcome.success, false);
    assert.equal(evidence.actionOutcome.errorReason, 'Database migration rollback timeout');
});

test('extractExecutionLogsFromBuffer parses ISO timestamp log format', () => {
    const logBuffer = `[2026-04-20T09:11:00.000Z] [info] Starting action
[2026-04-20T09:11:05.000Z] [warn] Warning message
[2026-04-20T09:11:10.000Z] [error] Error occurred`;

    const logs = extractExecutionLogsFromBuffer(logBuffer);

    assert.equal(logs.length, 3);
    assert.equal(logs[0]?.level, 'info');
    assert.equal(logs[1]?.level, 'warn');
    assert.equal(logs[2]?.level, 'error');
    assert.ok(logs[0]?.timestamp.includes('2026-04-20'));
});

test('extractExecutionLogsFromBuffer handles missing timestamp gracefully', () => {
    const logBuffer = `Starting action
Warning message
Error occurred`;

    const logs = extractExecutionLogsFromBuffer(logBuffer);

    assert.equal(logs.length, 3);
    assert.ok(logs[0]?.message);
    assert.ok(logs[0]?.timestamp);
});

test('getEvidenceSummary formats evidence for display', () => {
    const task = createMockTask();
    const actionResult = createMockActionResult({
        status: 'success',
    });
    const logs = createMockExecutionLogs();

    const evidence = assembleEvidenceRecord({
        task,
        actionResult,
        executionLogs: logs,
        startedAt: '2026-04-20T09:11:00.000Z',
        completedAt: '2026-04-20T09:11:20.000Z',
        durationMs: 20000,
    });

    const summary = getEvidenceSummary(evidence);

    assert.ok(summary.includes('modify_code'));
    assert.ok(summary.includes('success'));
    assert.ok(summary.includes('20000ms'));
});

test('getEvidenceSummary includes error reason for failed actions', () => {
    const task = createMockTask();
    const actionResult = createMockActionResult({
        status: 'failed',
        errorMessage: 'Network timeout',
    });
    const logs = createMockExecutionLogs();

    const evidence = assembleEvidenceRecord({
        task,
        actionResult,
        executionLogs: logs,
        startedAt: '2026-04-20T09:11:00.000Z',
        completedAt: '2026-04-20T09:11:20.000Z',
        durationMs: 20000,
    });

    const summary = getEvidenceSummary(evidence);

    assert.ok(summary.includes('Error'));
    assert.ok(summary.includes('Network timeout'));
});

test('assembleEvidenceRecord preserves evidence ID uniqueness', () => {
    const task = createMockTask();
    const actionResult = createMockActionResult();
    const logs = createMockExecutionLogs();

    const evidence1 = assembleEvidenceRecord({
        task,
        actionResult,
        executionLogs: logs,
        startedAt: '2026-04-20T09:11:00.000Z',
        completedAt: '2026-04-20T09:11:20.000Z',
        durationMs: 20000,
    });

    const evidence2 = assembleEvidenceRecord({
        task,
        actionResult,
        executionLogs: logs,
        startedAt: '2026-04-20T09:11:00.000Z',
        completedAt: '2026-04-20T09:11:20.000Z',
        durationMs: 20000,
    });

    assert.notEqual(evidence1.evidenceId, evidence2.evidenceId);
    assert.ok(evidence1.evidenceId.startsWith('ev_'));
    assert.ok(evidence2.evidenceId.startsWith('ev_'));
});
