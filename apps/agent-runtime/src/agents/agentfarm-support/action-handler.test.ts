/**
 * Tests for action-handler.ts
 *
 * Smoke tests each implemented action (Sprint 19) and verifies stubs return
 * the correct not-yet-implemented shape (Sprint 20-23 actions).
 */

import assert from 'node:assert/strict';
import { describe, it, afterEach, mock } from 'node:test';
import type { AgentfarmSupportActionParams } from './action-handler.js';

const BASE: AgentfarmSupportActionParams = {
    actionType: 'agentfarm_support_issue_ingest',
    tenantId: 'tenant-1',
    botId: 'bot-1',
    taskId: 'task-1',
    payload: {},
    gatewayBaseUrl: 'http://gw:3000',
    serviceToken: 'test-token',
};

function okFetch() {
    return mock.method(globalThis, 'fetch', async () => ({
        ok: true, status: 200,
        json: async () => ({ tasks: [], spans: [], connectors: [], approvals: [], jobs: [], entries: [] }),
        text: async () => '{}',
    }));
}

// ---------------------------------------------------------------------------
// isAgentfarmSupportActionType
// ---------------------------------------------------------------------------

describe('isAgentfarmSupportActionType', () => {
    it('returns true for all 9 support action types', async () => {
        const { isAgentfarmSupportActionType } = await import('./action-handler.js');
        const types = [
            'agentfarm_support_issue_ingest', 'agentfarm_support_diagnose', 'agentfarm_support_config_fix',
            'agentfarm_support_chat_reply', 'agentfarm_support_voice_reply',
            'agentfarm_support_code_fix_dispatch', 'agentfarm_support_infra_fix_dispatch',
            'agentfarm_support_escalate', 'agentfarm_support_resolve',
        ];
        for (const t of types) {
            assert.equal(isAgentfarmSupportActionType(t), true, `expected true for ${t}`);
        }
    });

    it('returns false for unknown types', async () => {
        const { isAgentfarmSupportActionType } = await import('./action-handler.js');
        assert.equal(isAgentfarmSupportActionType('workspace_read_file'), false);
        assert.equal(isAgentfarmSupportActionType(''), false);
    });
});

// ---------------------------------------------------------------------------
// agentfarm_support_issue_ingest
// ---------------------------------------------------------------------------

describe('agentfarm_support_issue_ingest', () => {
    it('returns ok:true with ingested status and echoes title/description', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_issue_ingest',
            payload: { title: 'Slack connector broken', description: 'Token expired, cannot send messages', severity: 'high' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['status'], 'ingested');
        assert.equal(parsed['title'], 'Slack connector broken');
        assert.equal(parsed['severity'], 'high');
        assert.ok(parsed['ingestedAt']);
    });

    it('returns ok:false when description is missing', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_issue_ingest',
            payload: { title: 'No description here' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('description'));
    });

    it('uses default title when not provided', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_issue_ingest',
            payload: { description: 'Something broke' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['title'], 'Untitled issue');
    });
});

// ---------------------------------------------------------------------------
// agentfarm_support_diagnose
// ---------------------------------------------------------------------------

describe('agentfarm_support_diagnose', () => {
    afterEach(() => mock.restoreAll());

    it('returns ok:true with a diagnosis report', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        okFetch();
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_diagnose',
            payload: { timeWindowHours: 2 },
        });
        assert.equal(result.ok, true);
        const report = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(report['tenantId'], 'tenant-1');
        assert.ok(report['generatedAt']);
        assert.ok(report['taskLogs']);
        assert.ok(report['connectorHealth']);
    });
});

// ---------------------------------------------------------------------------
// agentfarm_support_config_fix
// ---------------------------------------------------------------------------

describe('agentfarm_support_config_fix', () => {
    afterEach(() => mock.restoreAll());

    it('returns ok:false when diagnosisReport payload is missing', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_config_fix',
            payload: {},
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('diagnosisReport'));
    });

    it('returns ok:true with fix result for a valid report', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        okFetch();
        const diagnosisReport = {
            tenantId: 'tenant-1',
            generatedAt: new Date().toISOString(),
            taskLogs: { status: 'ok', entries: [] },
            otelTraces: { status: 'ok', spans: [] },
            connectorHealth: { status: 'ok', connectors: [] },
            approvalQueue: { status: 'ok', state: { pendingCount: 0, isJammed: false, oldestPendingAgeMinutes: 0 } },
            billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: false, dailyUsagePercent: 5, monthlyUsagePercent: 5, isThrottled: false, isHardStopped: false } },
            provisioning: { status: 'ok', state: { runningJobs: 0, stuckJobs: [] } },
            auditLog: { status: 'ok', entries: [] },
            summary: [],
        };
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_config_fix',
            payload: { diagnosisReport },
        });
        assert.equal(result.ok, true);
        const fixResult = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok(Array.isArray(fixResult['fixes']));
    });
});

// ---------------------------------------------------------------------------
// Sprint 20-23 stubs — must return ok:false with informative message
// ---------------------------------------------------------------------------

describe('unimplemented action stubs', () => {
    const stubs: Array<AgentfarmSupportActionParams['actionType']> = [
        'agentfarm_support_chat_reply',
        'agentfarm_support_voice_reply',
        'agentfarm_support_code_fix_dispatch',
        'agentfarm_support_infra_fix_dispatch',
        'agentfarm_support_escalate',
        'agentfarm_support_resolve',
    ];

    for (const actionType of stubs) {
        it(`${actionType} returns ok:false with not-yet-implemented message`, async () => {
            const { handleAgentfarmSupportAction } = await import('./action-handler.js');
            const result = await handleAgentfarmSupportAction({ ...BASE, actionType, payload: {} });
            assert.equal(result.ok, false);
            assert.ok(result.errorOutput?.includes('not yet implemented'));
        });
    }
});
