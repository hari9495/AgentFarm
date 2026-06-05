import assert from 'node:assert/strict';
import { describe, it, afterEach, mock } from 'node:test';
import type { DiagnosisReport, ConnectorHealthEntry } from './platform-diagnostics.js';
import { extractRootCauseKey, deduplicateIssue } from './issue-deduplicator.js';

const DEPS = { gatewayBaseUrl: 'http://gw:3000', serviceToken: 'tok' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
    return {
        tenantId: 'tenant-1',
        generatedAt: new Date().toISOString(),
        taskLogs:        { status: 'ok', entries: [] },
        otelTraces:      { status: 'ok', spans: [] },
        connectorHealth: { status: 'ok', connectors: [] },
        approvalQueue:   { status: 'ok', state: { pendingCount: 0, isJammed: false, oldestPendingAgeMinutes: 0 } },
        billing:         { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: false, dailyUsagePercent: 0, monthlyUsagePercent: 0, isThrottled: false, isHardStopped: false } },
        provisioning:    { status: 'ok', state: { runningJobs: 0, stuckJobs: [] } },
        auditLog:        { status: 'ok', entries: [] },
        summary:         [],
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// extractRootCauseKey
// ---------------------------------------------------------------------------

describe('extractRootCauseKey', () => {
    it('returns billing:hard_stopped when hard-stopped', () => {
        const report = makeReport({ billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 105, isThrottled: false, isHardStopped: true } } });
        assert.equal(extractRootCauseKey(report), 'billing:hard_stopped');
    });

    it('returns billing:throttled when throttled (not hard-stopped)', () => {
        const report = makeReport({ billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 92, isThrottled: true, isHardStopped: false } } });
        assert.equal(extractRootCauseKey(report), 'billing:throttled');
    });

    it('returns approval_queue:jammed when queue is jammed', () => {
        const report = makeReport({ approvalQueue: { status: 'ok', state: { pendingCount: 12, isJammed: true, oldestPendingAgeMinutes: 40 } } });
        assert.equal(extractRootCauseKey(report), 'approval_queue:jammed');
    });

    it('returns provisioning:stuck when stuck jobs exist', () => {
        const report = makeReport({ provisioning: { status: 'ok', state: { runningJobs: 0, stuckJobs: [{ jobId: 'j1', status: 'pending', ageMinutes: 45 }] } } });
        assert.equal(extractRootCauseKey(report), 'provisioning:stuck');
    });

    it('returns connector key with sorted types', () => {
        const connectors: ConnectorHealthEntry[] = [
            { connectorId: 'c1', connectorType: 'slack', status: 'error', lastCheckedAt: '' },
            { connectorId: 'c2', connectorType: 'github', status: 'error', lastCheckedAt: '' },
        ];
        const report = makeReport({ connectorHealth: { status: 'ok', connectors } });
        assert.equal(extractRootCauseKey(report), 'connector:github+slack:error');
    });

    it('returns tasks:high_failure_rate when ≥50% of ≥5 tasks fail', () => {
        const entries = Array.from({ length: 6 }, (_, i) => ({
            id: `t${i}`, status: i < 4 ? 'failed' : 'completed', actionType: 'a', createdAt: '',
        }));
        const report = makeReport({ taskLogs: { status: 'ok', entries } });
        assert.equal(extractRootCauseKey(report), 'tasks:high_failure_rate');
    });

    it('returns null for a clean report', () => {
        assert.equal(extractRootCauseKey(makeReport()), null);
    });

    it('billing:hard_stopped takes priority over connector errors', () => {
        const connectors: ConnectorHealthEntry[] = [{ connectorId: 'c1', connectorType: 'slack', status: 'error', lastCheckedAt: '' }];
        const report = makeReport({
            billing:         { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 105, isThrottled: false, isHardStopped: true } },
            connectorHealth: { status: 'ok', connectors },
        });
        assert.equal(extractRootCauseKey(report), 'billing:hard_stopped');
    });
});

// ---------------------------------------------------------------------------
// deduplicateIssue
// ---------------------------------------------------------------------------

describe('deduplicateIssue', () => {
    afterEach(() => mock.restoreAll());

    it('returns isDuplicate:false when no root cause key (clean report)', async () => {
        const result = await deduplicateIssue(makeReport(), 'tenant-1', DEPS);
        assert.equal(result.isDuplicate, false);
    });

    it('returns isDuplicate:false when no matching open issues', async () => {
        mock.method(globalThis, 'fetch', async () => ({
            ok: true, status: 200, json: async () => ({ issues: [] }),
        }));
        const report = makeReport({ billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 105, isThrottled: false, isHardStopped: true } } });
        const result = await deduplicateIssue(report, 'tenant-1', DEPS);
        assert.equal(result.isDuplicate, false);
        assert.equal(result.rootCauseKey, 'billing:hard_stopped');
    });

    it('returns isDuplicate:true with existingIssueId when matching issue found', async () => {
        mock.method(globalThis, 'fetch', async () => ({
            ok: true, status: 200,
            json: async () => ({ issues: [{ id: 'issue-existing', rootCauseKey: 'billing:hard_stopped', createdAt: new Date().toISOString() }] }),
        }));
        const report = makeReport({ billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 105, isThrottled: false, isHardStopped: true } } });
        const result = await deduplicateIssue(report, 'tenant-1', DEPS);
        assert.equal(result.isDuplicate, true);
        assert.equal(result.existingIssueId, 'issue-existing');
        assert.equal(result.rootCauseKey, 'billing:hard_stopped');
    });

    it('returns isDuplicate:false when gateway returns non-ok (fail-open)', async () => {
        mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 500 }));
        const report = makeReport({ billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 105, isThrottled: false, isHardStopped: true } } });
        const result = await deduplicateIssue(report, 'tenant-1', DEPS);
        assert.equal(result.isDuplicate, false);
    });

    it('returns isDuplicate:false when gateway throws (fail-open)', async () => {
        mock.method(globalThis, 'fetch', async () => { throw new Error('network error'); });
        const report = makeReport({ billing: { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 105, isThrottled: false, isHardStopped: true } } });
        const result = await deduplicateIssue(report, 'tenant-1', DEPS);
        assert.equal(result.isDuplicate, false);
    });
});
