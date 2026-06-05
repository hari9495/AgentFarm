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
// Sprint 20: Chat reply
// ---------------------------------------------------------------------------

describe('agentfarm_support_chat_reply', () => {
    it('returns ok:false when customerMessage is missing', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_chat_reply',
            payload: {},
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('customerMessage'));
    });

    it('returns ok:true with reply text when no diagnosis report', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_chat_reply',
            payload: { customerMessage: 'Why is the agent stuck?' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { text: string };
        assert.ok(typeof parsed.text === 'string' && parsed.text.length > 0);
    });

    it('includes diagnosis summary bullet points when report is provided', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_chat_reply',
            payload: {
                customerMessage: 'What is wrong?',
                diagnosisReport: { summary: ['1 connector unhealthy: github', 'Billing: 90% monthly budget used'] },
            },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { text: string };
        assert.ok(parsed.text.includes('connector unhealthy'));
        assert.ok(parsed.text.includes('Billing'));
    });
});

// ---------------------------------------------------------------------------
// Sprint 22: Voice reply — implemented
// ---------------------------------------------------------------------------

describe('agentfarm_support_voice_reply', () => {
    it('returns ok:false when transcript is missing', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_voice_reply',
            payload: {},
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('transcript is required'));
    });

    it('returns ok:true with reply text and languageCode for English', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_voice_reply',
            payload: { transcript: 'My account is broken', languageCode: 'en-IN' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { text?: string; languageCode?: string };
        assert.ok(typeof parsed.text === 'string' && parsed.text.length > 0);
        assert.equal(parsed.languageCode, 'en-IN');
    });

    it('returns Hindi reply text for hi-IN language', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_voice_reply',
            payload: { transcript: 'मेरी समस्या है', languageCode: 'hi-IN' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { text?: string };
        assert.ok(parsed.text?.includes('आपकी'), 'Hindi reply should be in Hindi');
    });
});

// ---------------------------------------------------------------------------
// Sprint 23: Code fix dispatch
// ---------------------------------------------------------------------------

describe('agentfarm_support_code_fix_dispatch', () => {
    it('returns ok:false when diagnosisReport is missing', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_code_fix_dispatch',
            payload: { issueId: 'issue-1', issueDescription: 'Auth broken' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('diagnosisReport'));
    });

    it('returns ok:false when DEVELOPER_AGENT_BOT_ID is not configured', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const diagnosisReport = {
            tenantId: 'tenant-1', generatedAt: new Date().toISOString(),
            taskLogs: { status: 'ok', entries: [] }, otelTraces: { status: 'ok', spans: [] },
            connectorHealth: { status: 'ok', connectors: [] },
            approvalQueue: { status: 'ok', state: { pendingCount: 0, isJammed: false, oldestPendingAgeMinutes: 0 } },
            billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: false, dailyUsagePercent: 0, monthlyUsagePercent: 0, isThrottled: false, isHardStopped: false } },
            provisioning: { status: 'ok', state: { runningJobs: 0, stuckJobs: [] } },
            auditLog: { status: 'ok', entries: [] }, summary: [],
        };
        // Env var not set → dispatchToDeveloperAgent returns dispatched:false
        const savedEnv = process.env['DEVELOPER_AGENT_BOT_ID'];
        delete process.env['DEVELOPER_AGENT_BOT_ID'];
        try {
            const result = await handleAgentfarmSupportAction({
                ...BASE,
                actionType: 'agentfarm_support_code_fix_dispatch',
                payload: { diagnosisReport, issueId: 'issue-1', issueDescription: 'Auth broken' },
            });
            assert.equal(result.ok, false);
            assert.ok(result.errorOutput?.includes('DEVELOPER_AGENT_BOT_ID'));
        } finally {
            if (savedEnv !== undefined) process.env['DEVELOPER_AGENT_BOT_ID'] = savedEnv;
        }
    });
});

// ---------------------------------------------------------------------------
// Sprint 23: Infra fix dispatch
// ---------------------------------------------------------------------------

describe('agentfarm_support_infra_fix_dispatch', () => {
    it('returns ok:false when diagnosisReport is missing', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_infra_fix_dispatch',
            payload: { issueId: 'issue-2', issueDescription: 'Infra down' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('diagnosisReport'));
    });

    it('returns ok:false when DEVOPS_AGENT_BOT_ID is not configured', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const diagnosisReport = {
            tenantId: 'tenant-1', generatedAt: new Date().toISOString(),
            taskLogs: { status: 'ok', entries: [] }, otelTraces: { status: 'ok', spans: [] },
            connectorHealth: { status: 'ok', connectors: [] },
            approvalQueue: { status: 'ok', state: { pendingCount: 0, isJammed: false, oldestPendingAgeMinutes: 0 } },
            billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: false, dailyUsagePercent: 0, monthlyUsagePercent: 0, isThrottled: false, isHardStopped: false } },
            provisioning: { status: 'ok', state: { runningJobs: 0, stuckJobs: [] } },
            auditLog: { status: 'ok', entries: [] }, summary: [],
        };
        const savedEnv = process.env['DEVOPS_AGENT_BOT_ID'];
        delete process.env['DEVOPS_AGENT_BOT_ID'];
        try {
            const result = await handleAgentfarmSupportAction({
                ...BASE,
                actionType: 'agentfarm_support_infra_fix_dispatch',
                payload: { diagnosisReport, issueId: 'issue-2', issueDescription: 'Infra down' },
            });
            assert.equal(result.ok, false);
            assert.ok(result.errorOutput?.includes('DEVOPS_AGENT_BOT_ID'));
        } finally {
            if (savedEnv !== undefined) process.env['DEVOPS_AGENT_BOT_ID'] = savedEnv;
        }
    });
});

// ---------------------------------------------------------------------------
// Sprint 23: Escalate
// ---------------------------------------------------------------------------

describe('agentfarm_support_escalate', () => {
    it('returns ok:false when diagnosisReport is missing', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_escalate',
            payload: { issueId: 'issue-3', issueDescription: 'All tiers failed' },
        });
        assert.equal(result.ok, false);
        assert.ok(result.errorOutput?.includes('diagnosisReport'));
    });

    it('returns ok:true with escalated field when no channel configured', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const diagnosisReport = {
            tenantId: 'tenant-1', generatedAt: new Date().toISOString(),
            taskLogs: { status: 'ok', entries: [] }, otelTraces: { status: 'ok', spans: [] },
            connectorHealth: { status: 'ok', connectors: [] },
            approvalQueue: { status: 'ok', state: { pendingCount: 0, isJammed: false, oldestPendingAgeMinutes: 0 } },
            billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: false, dailyUsagePercent: 0, monthlyUsagePercent: 0, isThrottled: false, isHardStopped: false } },
            provisioning: { status: 'ok', state: { runningJobs: 0, stuckJobs: [] } },
            auditLog: { status: 'ok', entries: [] }, summary: [],
        };
        // No MCP URLs in env → sendEscalation returns escalated:false
        const savedSlack = process.env['MCP_SLACK_URL'];
        const savedPd = process.env['MCP_PAGERDUTY_URL'];
        delete process.env['MCP_SLACK_URL'];
        delete process.env['MCP_PAGERDUTY_URL'];
        try {
            const result = await handleAgentfarmSupportAction({
                ...BASE,
                actionType: 'agentfarm_support_escalate',
                payload: { diagnosisReport, issueId: '', issueDescription: 'All tiers failed', triedTiers: ['tier1', 'tier2'] },
            });
            assert.equal(result.ok, true);
            const parsed = JSON.parse(result.output) as Record<string, unknown>;
            assert.ok('escalated' in parsed);
            assert.ok('escalatedAt' in parsed);
        } finally {
            if (savedSlack !== undefined) process.env['MCP_SLACK_URL'] = savedSlack;
            if (savedPd !== undefined) process.env['MCP_PAGERDUTY_URL'] = savedPd;
        }
    });
});

// ---------------------------------------------------------------------------
// Sprint 23: Resolve
// ---------------------------------------------------------------------------

describe('agentfarm_support_resolve', () => {
    it('returns ok:true with resolved:true and default notes', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_resolve',
            payload: { issueId: '' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['resolved'], true);
        assert.ok(parsed['resolvedAt']);
        assert.ok(typeof parsed['resolutionNotes'] === 'string');
    });

    it('echoes provided resolutionNotes in output', async () => {
        const { handleAgentfarmSupportAction } = await import('./action-handler.js');
        const result = await handleAgentfarmSupportAction({
            ...BASE,
            actionType: 'agentfarm_support_resolve',
            payload: { issueId: '', resolutionNotes: 'Connector credentials refreshed manually.' },
        });
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['resolutionNotes'], 'Connector credentials refreshed manually.');
    });
});
