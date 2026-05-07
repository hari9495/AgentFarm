import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    executeObservedAction,
    getAuditLogWriter,
    resetObservabilityForTests,
} from './action-observability.js';

const createDbPath = () => join(
    tmpdir(),
    `agent-observability-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
);

test('executeObservedAction persists dom hash, network summaries, and evidence bundle', async () => {
    const originalDbPath = process.env.AGENT_OBSERVABILITY_DB_PATH;
    process.env.AGENT_OBSERVABILITY_DB_PATH = createDbPath();
    delete process.env.AGENT_OBSERVABILITY_BLOB_ACCOUNT_URL;
    delete process.env.AGENT_OBSERVABILITY_BLOB_CONTAINER;
    delete process.env.AGENT_OBSERVABILITY_BLOB_WRITE_SAS_TOKEN;
    delete process.env.AGENT_OBSERVABILITY_BLOB_READ_SAS_TOKEN;
    resetObservabilityForTests();

    try {
        const sessionId = `session-${Date.now()}`;

        await executeObservedAction(
            {
                agentId: 'bot_1',
                workspaceId: 'ws_1',
                taskId: 'task_1',
                sessionId,
                type: 'browser',
                action: 'workspace_browser_open',
                target: 'https://example.com',
                payload: {
                    dom_checkpoint: true,
                    network_requests: [
                        { method: 'get', url: 'https://example.com/api/items', status: 200 },
                        { method: 'post', url: 'https://example.com/api/submit', status: 201 },
                        { method: 1, url: 'invalid' },
                    ],
                },
            },
            async () => {
                return { ok: true };
            },
        );

        const writer = getAuditLogWriter();
        const events = writer.listSession(sessionId);
        assert.equal(events.length, 1);

        const event = events[0];
        assert.equal(event.actionType, 'workspace_browser_open');
        assert.equal(event.success, true);
        assert.equal(event.verified, true);
        assert.equal(event.domSnapshotBefore, undefined);
        assert.equal(event.domSnapshotAfter, undefined);
        assert.equal(event.domSnapshotHash?.length, 64);
        assert.equal(event.networkRequests?.length, 2);
        assert.equal(event.networkRequests?.[0]?.method, 'GET');
        assert.match(event.screenshotBefore, /^data:image\/svg\+xml;base64,/);
        assert.match(event.screenshotAfter, /^data:image\/svg\+xml;base64,/);

        assert.equal(event.evidenceBundle?.domSnapshotStored, true);
        assert.ok(event.evidenceBundle?.domCheckpoint?.url);
        assert.equal(event.evidenceBundle?.screenshotBefore.provider, 'inline');
        assert.equal(event.evidenceBundle?.screenshotAfter.provider, 'inline');
    } finally {
        resetObservabilityForTests();
        if (originalDbPath) {
            process.env.AGENT_OBSERVABILITY_DB_PATH = originalDbPath;
        } else {
            delete process.env.AGENT_OBSERVABILITY_DB_PATH;
        }
    }
});

test('executeObservedAction keeps inline dom snapshots when checkpoint is not requested', async () => {
    const originalDbPath = process.env.AGENT_OBSERVABILITY_DB_PATH;
    process.env.AGENT_OBSERVABILITY_DB_PATH = createDbPath();
    resetObservabilityForTests();

    try {
        const sessionId = `session-${Date.now()}-inline`;

        await executeObservedAction(
            {
                agentId: 'bot_2',
                workspaceId: 'ws_2',
                taskId: 'task_2',
                sessionId,
                type: 'desktop',
                action: 'workspace_app_launch',
                target: 'vscode',
                payload: { app: 'vscode' },
            },
            async () => {
                return { launched: true };
            },
        );

        const writer = getAuditLogWriter();
        const events = writer.listSession(sessionId);
        assert.equal(events.length, 1);

        const event = events[0];
        assert.equal(typeof event.domSnapshotBefore, 'string');
        assert.equal(typeof event.domSnapshotAfter, 'string');
        assert.equal(event.evidenceBundle?.domSnapshotStored, false);
        assert.equal(event.evidenceBundle?.domCheckpoint, null);
    } finally {
        resetObservabilityForTests();
        if (originalDbPath) {
            process.env.AGENT_OBSERVABILITY_DB_PATH = originalDbPath;
        } else {
            delete process.env.AGENT_OBSERVABILITY_DB_PATH;
        }
    }
});
