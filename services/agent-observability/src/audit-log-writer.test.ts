import assert from 'node:assert/strict';
import test from 'node:test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditLogWriter } from './audit-log-writer.js';

test('AuditLogWriter appends and reads session records', () => {
    const dbPath = join(tmpdir(), `agent-observability-${Date.now()}.sqlite`);
    const writer = new AuditLogWriter(dbPath);

    try {
        writer.append({
            actionId: 'action-1',
            agentId: 'agent-1',
            workspaceId: 'ws-1',
            taskId: 'task-1',
            sessionId: 'session-1',
            type: 'browser',
            action: 'click',
            actionType: 'click',
            target: '#submit',
            payload: { selector: '#submit' },
            screenshotBefore: 'before',
            screenshotAfter: 'after',
            startedAt: new Date('2026-05-07T00:00:00.000Z'),
            completedAt: new Date('2026-05-07T00:00:01.000Z'),
            durationMs: 1000,
            success: true,
            riskLevel: 'low',
            verified: true,
        });

        const records = writer.listSession('session-1');
        assert.equal(records.length, 1);
        assert.equal(records[0]?.actionType, 'click');
        assert.equal(records[0]?.verified, true);
    } finally {
        writer.close();
        rmSync(dbPath, { force: true });
    }
});
