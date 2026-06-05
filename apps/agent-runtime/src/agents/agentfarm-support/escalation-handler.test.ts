/**
 * Tests for escalation-handler.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiagnosisReport } from './platform-diagnostics.js';
import {
    buildEscalationReport,
    sendEscalation,
    updateIssueEscalated,
    type EscalationHandlerDeps,
} from './escalation-handler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_DEPS: EscalationHandlerDeps = {
    gatewayBaseUrl: 'http://gw:3000',
    serviceToken: 'test-token',
};

function makeReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
    return {
        tenantId: 'tenant-1',
        generatedAt: new Date().toISOString(),
        taskLogs: { status: 'ok', entries: [] },
        otelTraces: { status: 'ok', spans: [] },
        connectorHealth: { status: 'ok', connectors: [] },
        approvalQueue: { status: 'ok', state: { pendingCount: 0, isJammed: false, oldestPendingAgeMinutes: 0 } },
        billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: false, dailyUsagePercent: 0, monthlyUsagePercent: 0, isThrottled: false, isHardStopped: false } },
        provisioning: { status: 'ok', state: { runningJobs: 0, stuckJobs: [] } },
        auditLog: { status: 'ok', entries: [] },
        summary: [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// buildEscalationReport
// ---------------------------------------------------------------------------

describe('buildEscalationReport', () => {
    it('sets issueId, tenantId, issueDescription', () => {
        const r = buildEscalationReport('issue-1', 'DB unreachable', makeReport({ tenantId: 'my-tenant' }), ['tier1']);
        assert.equal(r.issueId, 'issue-1');
        assert.equal(r.tenantId, 'my-tenant');
        assert.equal(r.issueDescription, 'DB unreachable');
    });

    it('includes tier lines with results in fullContext', () => {
        const r = buildEscalationReport('id', 'Desc', makeReport(), ['tier1', 'tier2'], {
            tier1Result: 'Config fix applied — persists',
            tier2Result: 'PR raised — no improvement',
        });
        assert.ok(r.fullContext.includes('TIER1'));
        assert.ok(r.fullContext.includes('Config fix applied'));
        assert.ok(r.fullContext.includes('TIER2'));
        assert.ok(r.fullContext.includes('PR raised'));
    });

    it('uses default tier result text when no result is provided', () => {
        const r = buildEscalationReport('id', 'Desc', makeReport(), ['tier3']);
        assert.ok(r.fullContext.includes('TIER3'));
        assert.ok(r.fullContext.includes('applied — issue persists'));
    });

    it('counts failed tasks correctly', () => {
        const report = makeReport({
            taskLogs: {
                status: 'ok',
                entries: [
                    { id: 't1', status: 'failed', actionType: 'workspace_read_file', createdAt: new Date().toISOString() },
                    { id: 't2', status: 'completed', actionType: 'workspace_write_file', createdAt: new Date().toISOString() },
                    { id: 't3', status: 'failed', actionType: 'workspace_read_file', createdAt: new Date().toISOString() },
                ],
            },
        });
        const r = buildEscalationReport('id', 'Desc', report, ['tier1']);
        assert.equal(r.failedTaskCount, 2);
    });

    it('counts unhealthy connectors correctly', () => {
        const report = makeReport({
            connectorHealth: {
                status: 'ok',
                connectors: [
                    { connectorId: 'c1', connectorType: 'github', status: 'error', lastCheckedAt: new Date().toISOString() },
                    { connectorId: 'c2', connectorType: 'slack', status: 'degraded', lastCheckedAt: new Date().toISOString() },
                    { connectorId: 'c3', connectorType: 'datadog', status: 'healthy', lastCheckedAt: new Date().toISOString() },
                ],
            },
        });
        const r = buildEscalationReport('id', 'Desc', report, ['tier1']);
        assert.equal(r.unhealthyConnectorCount, 2);
    });

    it('fullContext includes action required message', () => {
        const r = buildEscalationReport('id', 'Desc', makeReport(), ['tier1']);
        assert.ok(r.fullContext.includes('Action required'));
        assert.ok(r.fullContext.includes('human intervention'));
    });

    it('sets escalatedAt to a valid ISO timestamp', () => {
        const before = Date.now();
        const r = buildEscalationReport('id', 'Desc', makeReport(), ['tier1']);
        const after = Date.now();
        const at = new Date(r.escalatedAt).getTime();
        assert.ok(at >= before && at <= after);
    });

    it('includes diagnosis summary lines in fullContext', () => {
        const report = makeReport({ summary: ['Critical: connector down', 'Warning: billing at 90%'] });
        const r = buildEscalationReport('id', 'Desc', report, ['tier1']);
        assert.ok(r.fullContext.includes('Critical: connector down'));
        assert.deepEqual(r.diagnosisSummary, report.summary);
    });

    it('shows no-notable-findings fallback when summary is empty', () => {
        const r = buildEscalationReport('id', 'Desc', makeReport(), ['tier1']);
        assert.ok(r.fullContext.includes('No notable findings'));
    });
});

// ---------------------------------------------------------------------------
// sendEscalation
// ---------------------------------------------------------------------------

describe('sendEscalation', () => {
    it('returns escalated:true via slack when slackMcpUrl is set', async () => {
        const mockInvoker = async () => ({ ok: true });
        const result = await sendEscalation(
            buildEscalationReport('id', 'Desc', makeReport(), ['tier1']),
            { ...BASE_DEPS, slackMcpUrl: 'http://slack-mcp:9000' },
            mockInvoker,
        );
        assert.equal(result.escalated, true);
        assert.equal(result.channel, 'slack');
    });

    it('falls back to pagerduty when slack mcpInvoker throws', async () => {
        let callCount = 0;
        const mockInvoker = async () => {
            callCount++;
            if (callCount === 1) throw new Error('Slack unavailable');
            return { ok: true };
        };
        const result = await sendEscalation(
            buildEscalationReport('id', 'Desc', makeReport(), ['tier1']),
            { ...BASE_DEPS, slackMcpUrl: 'http://slack-mcp:9000', pagerdutyMcpUrl: 'http://pd-mcp:9001' },
            mockInvoker,
        );
        assert.equal(result.escalated, true);
        assert.equal(result.channel, 'pagerduty');
    });

    it('returns escalated:true via pagerduty when only pagerdutyMcpUrl is set', async () => {
        const mockInvoker = async () => ({ ok: true });
        const result = await sendEscalation(
            buildEscalationReport('id', 'Desc', makeReport(), ['tier1']),
            { ...BASE_DEPS, pagerdutyMcpUrl: 'http://pd-mcp:9001' },
            mockInvoker,
        );
        assert.equal(result.escalated, true);
        assert.equal(result.channel, 'pagerduty');
    });

    it('returns escalated:false with detail when pagerduty also fails', async () => {
        const mockInvoker = async () => { throw new Error('service down'); };
        const result = await sendEscalation(
            buildEscalationReport('id', 'Desc', makeReport(), ['tier1']),
            { ...BASE_DEPS, slackMcpUrl: 'http://slack-mcp:9000', pagerdutyMcpUrl: 'http://pd-mcp:9001' },
            mockInvoker,
        );
        assert.equal(result.escalated, false);
        assert.ok(result.detail?.includes('PagerDuty failed'));
    });

    it('returns escalated:false with detail when no channel configured', async () => {
        const mockInvoker = async () => ({ ok: true });
        const result = await sendEscalation(
            buildEscalationReport('id', 'Desc', makeReport(), ['tier1']),
            BASE_DEPS,
            mockInvoker,
        );
        assert.equal(result.escalated, false);
        assert.ok(result.detail?.includes('No escalation channel'));
    });
});

// ---------------------------------------------------------------------------
// updateIssueEscalated
// ---------------------------------------------------------------------------

describe('updateIssueEscalated', () => {
    it('PATCHes the issue endpoint and does not throw', async () => {
        let called = false;
        const captureFetch = async () => {
            called = true;
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response;
        };
        await updateIssueEscalated(
            'issue-1',
            { channel: 'slack', escalatedAt: new Date().toISOString() },
            BASE_DEPS,
            captureFetch,
        );
        assert.equal(called, true);
    });

    it('does not throw when fetch errors', async () => {
        const throwFetch = async () => { throw new Error('network down'); };
        await assert.doesNotReject(() =>
            updateIssueEscalated(
                'issue-1',
                { channel: 'pagerduty', escalatedAt: new Date().toISOString() },
                BASE_DEPS,
                throwFetch as never,
            )
        );
    });

    it('skips fetch when issueId is empty', async () => {
        let called = false;
        const captureFetch = async () => { called = true; return { ok: true } as Response; };
        await updateIssueEscalated('', { escalatedAt: new Date().toISOString() }, BASE_DEPS, captureFetch);
        assert.equal(called, false);
    });
});
