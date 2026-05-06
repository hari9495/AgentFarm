import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createFileEvidenceRecordWriter,
    resolveEvidenceRecordPath,
} from './evidence-record-writer.js';

test('resolveEvidenceRecordPath uses configured env path when provided', () => {
    const resolved = resolveEvidenceRecordPath(
        {
            AF_EVIDENCE_RECORD_PATH: 'custom/evidence-log.ndjson',
        },
        '/workspace',
    );

    assert.ok(resolved.replace(/\\/g, '/').endsWith('/workspace/custom/evidence-log.ndjson'));
});

test('file evidence writer appends NDJSON evidence records in order', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'agent-runtime-evidence-writer-'));
    const output = join(tempDir, 'evidence.ndjson');
    const writer = createFileEvidenceRecordWriter(output);

    await writer({
        evidenceId: 'ev-1',
        createdAt: '2026-05-06T00:00:00.000Z',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-1',
        taskId: 'task-1',
        approvalId: 'apr-1',
        correlationId: 'corr-1',
        actionType: 'read_task',
        actionStatus: 'success',
        riskLevel: 'low',
        route: 'execute',
        executionStartedAt: '2026-05-06T00:00:00.000Z',
        executionCompletedAt: '2026-05-06T00:00:01.000Z',
        executionDurationMs: 1000,
        executionLogs: [],
        qualityGateResults: [],
        actionOutcome: {
            success: true,
            resultSummary: 'ok',
        },
    });

    await writer({
        evidenceId: 'ev-2',
        createdAt: '2026-05-06T00:00:02.000Z',
        tenantId: 'tenant-1',
        workspaceId: 'ws-1',
        botId: 'bot-1',
        taskId: 'task-2',
        approvalId: 'apr-2',
        correlationId: 'corr-1',
        actionType: 'read_task',
        actionStatus: 'failed',
        riskLevel: 'low',
        route: 'execute',
        executionStartedAt: '2026-05-06T00:00:02.000Z',
        executionCompletedAt: '2026-05-06T00:00:03.000Z',
        executionDurationMs: 1000,
        executionLogs: [],
        qualityGateResults: [],
        actionOutcome: {
            success: false,
            errorReason: 'failed',
        },
    });

    const content = await readFile(output, 'utf8');
    const lines = content.trim().split('\n');
    assert.equal(lines.length, 2);

    const first = JSON.parse(lines[0] ?? '{}') as { evidenceId?: string; taskId?: string };
    const second = JSON.parse(lines[1] ?? '{}') as { evidenceId?: string; taskId?: string };

    assert.equal(first.evidenceId, 'ev-1');
    assert.equal(first.taskId, 'task-1');
    assert.equal(second.evidenceId, 'ev-2');
    assert.equal(second.taskId, 'task-2');
});
