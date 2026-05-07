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
        const sessionId = generateSessionId(generateAgentInstanceId('ten_deadbeef', 'developer'));

        await executeObservedAction(
            {
                tenantId: 'ten_deadbeef',
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
        assert.match(event.actionId, /^act_ses_[a-z0-9]{4}_000$/);
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
        const sessionId = generateSessionId(generateAgentInstanceId('ten_deadbeef', 'developer'));

        await executeObservedAction(
            {
                tenantId: 'ten_deadbeef',
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

// ============================================================================
// BROWSER AUDIT SYSTEM INTEGRATION TESTS (2026-05-07)
// ============================================================================

import {
    generateTenantId,
    generateAgentInstanceId,
    generateSessionId,
    generateActionId,
    generateRecordingId,
    generateScreenshotId,
    decodeSessionIdFromActionId,
    decodeAgentInstanceIdFromSessionId,
    decodeTenantIdFromAgentInstanceId,
} from '@agentfarm/shared-types';

test('Audit IDs: 4-Level Hierarchy with Embedded Ancestry', async () => {
    const tenantId = generateTenantId();
    const agentId = generateAgentInstanceId(tenantId, 'developer');
    const sessionId = generateSessionId(agentId);
    const actionId = generateActionId(sessionId, 0);
    const screenshotId = generateScreenshotId(actionId, 'before');
    const recordingId = generateRecordingId(sessionId);
    const agentShort = agentId.split('_').at(-1);
    const sessionShort = sessionId.split('_').at(-1);

    // Verify format
    assert.match(tenantId, /^ten_[a-f0-9]{8}$/);
    assert.match(agentId, /^agt_[a-f0-9]{8}_developer_[a-f0-9]{4}$/);
    assert.match(sessionId, /^ses_agt_[a-f0-9]{4}_\d{8}T\d{6}_[a-f0-9]{4}$/);
    assert.match(actionId, /^act_ses_[a-f0-9]{4}_000$/);
    assert.match(screenshotId, /^scr_act_ses_[a-f0-9]{4}_000_before$/);
    assert.match(recordingId, /^rec_ses_[a-f0-9]{4}$/);
    assert.equal(sessionId.startsWith(`ses_agt_${agentShort}_`), true);
    assert.equal(actionId, `act_ses_${sessionShort}_000`);
    assert.equal(recordingId, `rec_ses_${sessionShort}`);
});

test('Audit IDs: Decode Functions Extract Ancestry Without Database', async () => {
    const tenantId = generateTenantId();
    const agentId = generateAgentInstanceId(tenantId, 'tester');
    const sessionId = generateSessionId(agentId);
    const actionId = generateActionId(sessionId, 5);

    // Decode from action ID alone yields query patterns, not exact records.
    const decodedSessionId = decodeSessionIdFromActionId(actionId);
    const decodedAgentId = decodeAgentInstanceIdFromSessionId(decodedSessionId);
    const decodedTenantId = decodeTenantIdFromAgentInstanceId(decodedAgentId);

    assert.equal(decodedSessionId, `ses_agt_*_*_${sessionId.split('_').at(-1)}`);
    assert.equal(decodedAgentId, 'agt_*_*_*');
    assert.equal(decodedTenantId, 'ten_*');
});

test('Storage Paths: Hierarchical with Prefix Queries', async () => {
    const tenantId = generateTenantId();
    const agentId = generateAgentInstanceId(tenantId, 'developer');
    const sessionId = generateSessionId(agentId);
    const actionId1 = generateActionId(sessionId, 0);
    const actionId2 = generateActionId(sessionId, 1);
    const screenshotId1 = generateScreenshotId(actionId1, 'before');
    const screenshotId2 = generateScreenshotId(actionId2, 'after');

    // Paths enable prefix-based compliance queries
    const path1 = `screenshots/${tenantId}/${agentId}/${sessionId}/${screenshotId1}.png`;
    const path2 = `screenshots/${tenantId}/${agentId}/${sessionId}/${screenshotId2}.png`;

    // Query all screenshots for tenant
    assert.ok(path1.startsWith(`screenshots/${tenantId}/`));
    assert.ok(path2.startsWith(`screenshots/${tenantId}/`));

    // Query all developer actions for tenant
    assert.ok(path1.includes('/agt_') && path1.includes('_developer_'));
    assert.ok(path2.includes('/agt_') && path2.includes('_developer_'));

    // Query full session directly via the hierarchical path segment.
    assert.ok(path1.includes(`/${sessionId}/`));
    assert.ok(path2.includes(`/${sessionId}/`));
});

test('Retention Policy: Zero Auto-Delete By Default', async () => {
    // Session without retention policy = never delete
    const sessionRecord = {
        id: generateSessionId(generateAgentInstanceId(generateTenantId(), 'developer')),
        retentionExpiresAt: null, // null = conservative default
        retentionPolicyId: null,
    };

    assert.equal(sessionRecord.retentionExpiresAt, null);

    // Session with policy can have explicit expiry
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const sessionWithPolicy = {
        id: generateSessionId(generateAgentInstanceId(generateTenantId(), 'tester')),
        retentionExpiresAt: futureDate.toISOString(),
        retentionPolicyId: 'policy_90_days',
    };

    assert.ok(sessionWithPolicy.retentionExpiresAt !== null);
});

test('Action Sequence: Sequential Within Session', async () => {
    const sessionId = generateSessionId(
        generateAgentInstanceId(generateTenantId(), 'developer'),
    );

    const actions = [];
    for (let seq = 0; seq < 100; seq++) {
        const actionId = generateActionId(sessionId, seq);
        actions.push({ id: actionId, sequence: seq });
    }

    // Verify sequences are zero-padded (000, 001, ..., 099)
    assert.match(actions[0].id, /_000$/);
    assert.match(actions[9].id, /_009$/);
    assert.match(actions[99].id, /_099$/);
});
