import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileActionResultWriter, resolveActionResultPath } from './action-result-writer.js';

test('resolveActionResultPath uses configured env path when provided', () => {
    const resolved = resolveActionResultPath(
        {
            AF_ACTION_RESULT_LOG_PATH: 'custom/audit-log.ndjson',
        },
        '/workspace',
    );

    assert.ok(resolved.replace(/\\/g, '/').endsWith('/workspace/custom/audit-log.ndjson'));
});

test('file action-result writer appends NDJSON records in order', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agent-runtime-writer-'));
    const output = join(tempDir, 'records.ndjson');
    const writer = createFileActionResultWriter(output);

    await writer({
        recordId: 'rec-1',
        recordedAt: '2026-04-22T00:00:00.000Z',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-1',
        roleProfile: 'Developer Agent',
        policyPackVersion: 'mvp-v1',
        correlationId: 'corr-1',
        taskId: 'task-1',
        actionType: 'read_task',
        riskLevel: 'low',
        confidence: 0.91,
        route: 'execute',
        status: 'success',
        attempts: 1,
        retries: 0,
    });

    await writer({
        recordId: 'rec-2',
        recordedAt: '2026-04-22T00:00:01.000Z',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-1',
        roleProfile: 'Developer Agent',
        policyPackVersion: 'mvp-v1',
        correlationId: 'corr-1',
        taskId: 'task-2',
        actionType: 'read_task',
        riskLevel: 'low',
        confidence: 0.88,
        route: 'execute',
        status: 'failed',
        attempts: 1,
        retries: 0,
        failureClass: 'runtime_exception',
        errorMessage: 'NON_RETRYABLE_EXECUTOR_ERROR',
    });

    const content = await readFile(output, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0] ?? '{}') as { recordId?: string; taskId?: string; status?: string };
    const second = JSON.parse(lines[1] ?? '{}') as { recordId?: string; taskId?: string; status?: string };

    assert.equal(first.recordId, 'rec-1');
    assert.equal(first.taskId, 'task-1');
    assert.equal(first.status, 'success');

    assert.equal(second.recordId, 'rec-2');
    assert.equal(second.taskId, 'task-2');
    assert.equal(second.status, 'failed');
});
