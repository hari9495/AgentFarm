import assert from 'node:assert/strict';
import { describe, it, afterEach, mock } from 'node:test';
import type { DiagnosisReport, BillingState, ApprovalQueueState, ProvisioningState, ConnectorHealthEntry } from './platform-diagnostics.js';
import { detectCriticalConditions, checkTenantForIssues, startProactiveMonitor } from './proactive-monitor.js';

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

function billingState(overrides: Partial<BillingState>): BillingState {
    return { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 0, isThrottled: false, isHardStopped: false, ...overrides };
}

const DEPS = { gatewayBaseUrl: 'http://gw:3000', serviceToken: 'tok', supportBotId: 'bot-1' };

// ---------------------------------------------------------------------------
// detectCriticalConditions — billing
// ---------------------------------------------------------------------------

describe('detectCriticalConditions — billing', () => {
    it('hard-stop → 1 critical condition', () => {
        const report = makeReport({ billing: { status: 'ok', state: billingState({ isHardStopped: true, monthlyUsagePercent: 105 }) } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'critical');
        assert.ok(conditions[0]?.title.includes('hard-stop'));
    });

    it('throttled → 1 high condition', () => {
        const report = makeReport({ billing: { status: 'ok', state: billingState({ isThrottled: true, monthlyUsagePercent: 92 }) } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'high');
        assert.ok(conditions[0]?.title.includes('throttle'));
    });

    it('80% usage → 1 medium condition', () => {
        const report = makeReport({ billing: { status: 'ok', state: billingState({ monthlyUsagePercent: 85 }) } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'medium');
    });

    it('clean billing → no conditions', () => {
        const report = makeReport();
        assert.equal(detectCriticalConditions(report).length, 0);
    });
});

// ---------------------------------------------------------------------------
// detectCriticalConditions — approval queue
// ---------------------------------------------------------------------------

describe('detectCriticalConditions — approval queue', () => {
    it('jammed queue → 1 high condition', () => {
        const state: ApprovalQueueState = { pendingCount: 15, isJammed: true, oldestPendingAgeMinutes: 45 };
        const report = makeReport({ approvalQueue: { status: 'ok', state } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'high');
        assert.ok(conditions[0]?.title.includes('jammed'));
    });

    it('queue not jammed → no conditions', () => {
        const state: ApprovalQueueState = { pendingCount: 3, isJammed: false, oldestPendingAgeMinutes: 2 };
        const report = makeReport({ approvalQueue: { status: 'ok', state } });
        assert.equal(detectCriticalConditions(report).length, 0);
    });
});

// ---------------------------------------------------------------------------
// detectCriticalConditions — provisioning
// ---------------------------------------------------------------------------

describe('detectCriticalConditions — provisioning', () => {
    it('stuck job → 1 high condition', () => {
        const state: ProvisioningState = {
            runningJobs: 1,
            stuckJobs: [{ jobId: 'j1', status: 'pending', ageMinutes: 45 }],
        };
        const report = makeReport({ provisioning: { status: 'ok', state } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'high');
        assert.ok(conditions[0]?.description.includes('j1'));
    });
});

// ---------------------------------------------------------------------------
// detectCriticalConditions — connectors
// ---------------------------------------------------------------------------

describe('detectCriticalConditions — connectors', () => {
    it('1 unhealthy connector → high', () => {
        const conn: ConnectorHealthEntry = { connectorId: 'c1', connectorType: 'github', status: 'error', lastCheckedAt: '' };
        const report = makeReport({ connectorHealth: { status: 'ok', connectors: [conn] } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'high');
    });

    it('3+ unhealthy connectors → critical', () => {
        const connectors: ConnectorHealthEntry[] = ['c1', 'c2', 'c3'].map((id) => ({
            connectorId: id, connectorType: 'slack', status: 'error' as const, lastCheckedAt: '',
        }));
        const report = makeReport({ connectorHealth: { status: 'ok', connectors } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'critical');
    });

    it('all healthy → no conditions', () => {
        const conn: ConnectorHealthEntry = { connectorId: 'c1', connectorType: 'github', status: 'healthy', lastCheckedAt: '' };
        const report = makeReport({ connectorHealth: { status: 'ok', connectors: [conn] } });
        assert.equal(detectCriticalConditions(report).length, 0);
    });
});

// ---------------------------------------------------------------------------
// detectCriticalConditions — task failure rate
// ---------------------------------------------------------------------------

describe('detectCriticalConditions — task failure rate', () => {
    it('5 tasks, 4 failed → high', () => {
        const entries = [
            { id: 't1', status: 'failed', actionType: 'a', createdAt: '' },
            { id: 't2', status: 'failed', actionType: 'a', createdAt: '' },
            { id: 't3', status: 'failed', actionType: 'a', createdAt: '' },
            { id: 't4', status: 'failed', actionType: 'a', createdAt: '' },
            { id: 't5', status: 'completed', actionType: 'a', createdAt: '' },
        ];
        const report = makeReport({ taskLogs: { status: 'ok', entries } });
        const conditions = detectCriticalConditions(report);
        assert.equal(conditions.length, 1);
        assert.equal(conditions[0]?.severity, 'high');
    });

    it('4 tasks even if all failed → no condition (below threshold)', () => {
        const entries = Array.from({ length: 4 }, (_, i) => ({
            id: `t${i}`, status: 'failed', actionType: 'a', createdAt: '',
        }));
        const report = makeReport({ taskLogs: { status: 'ok', entries } });
        assert.equal(detectCriticalConditions(report).length, 0);
    });
});

// ---------------------------------------------------------------------------
// checkTenantForIssues
// ---------------------------------------------------------------------------

describe('checkTenantForIssues', () => {
    afterEach(() => mock.restoreAll());

    it('skips tenant with existing open auto-monitor issue', async () => {
        let fetchCalls = 0;
        mock.method(globalThis, 'fetch', async (url: string) => {
            fetchCalls++;
            // First call: open-issue check → returns an open issue
            if (String(url).includes('source=auto_monitor')) {
                return { ok: true, status: 200, json: async () => ({ issues: [{ id: 'existing-1' }] }), text: async () => '' };
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        });

        const result = await checkTenantForIssues('tenant-1', DEPS);
        assert.equal(result.issued, 0);
        // Only the open-issue check should have been called (no diagnosis fetch)
        assert.equal(fetchCalls, 1);
    });

    it('raises issue when critical condition found', async () => {
        let raiseCallBody: unknown = null;
        mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
            const u = String(url);
            // open-issue check → no open issues
            if (u.includes('source=auto_monitor')) {
                return { ok: true, status: 200, json: async () => ({ issues: [] }), text: async () => '' };
            }
            // 7 diagnosis sources
            if (u.includes('/v1/runtime/tasks'))    return { ok: true, status: 200, json: async () => ({ tasks: [] }), text: async () => '' };
            if (u.includes('/v1/observability'))    return { ok: true, status: 200, json: async () => ({ spans: [] }), text: async () => '' };
            if (u.includes('/v1/connectors/health')) return { ok: true, status: 200, json: async () => ({ connectors: [] }), text: async () => '' };
            if (u.includes('/v1/approvals'))        return { ok: true, status: 200, json: async () => ({ approvals: [] }), text: async () => '' };
            if (u.includes('/v1/billing/state'))    return { ok: true, status: 200, json: async () => ({ subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 0, monthlyUsagePercent: 0, isThrottled: false, isHardStopped: true }), text: async () => '' };
            if (u.includes('/v1/admin/provision'))  return { ok: true, status: 200, json: async () => ({ jobs: [] }), text: async () => '' };
            if (u.includes('/v1/governance/audit')) return { ok: true, status: 200, json: async () => ({ entries: [] }), text: async () => '' };
            // audit write
            if (u.includes('/v1/audit/support-diagnostic')) return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
            // issue raise
            if (u.includes('/v1/support/issues') && init?.method === 'POST') {
                raiseCallBody = JSON.parse(init.body as string);
                return { ok: true, status: 201, json: async () => ({ id: 'new-issue-1' }), text: async () => '' };
            }
            return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
        });

        const result = await checkTenantForIssues('tenant-1', DEPS);
        assert.equal(result.issued, 1);
        assert.ok(raiseCallBody !== null, 'issue raise endpoint should have been called');
        assert.equal((raiseCallBody as Record<string, unknown>)['source'], 'auto_monitor');
        assert.equal((raiseCallBody as Record<string, unknown>)['severity'], 'critical');
    });
});

// ---------------------------------------------------------------------------
// startProactiveMonitor
// ---------------------------------------------------------------------------

describe('startProactiveMonitor', () => {
    it('returns null when PROACTIVE_MONITOR_ENABLED is not set', () => {
        delete process.env['PROACTIVE_MONITOR_ENABLED'];
        const timer = startProactiveMonitor(DEPS);
        assert.equal(timer, null);
    });

    it('returns a timer when PROACTIVE_MONITOR_ENABLED=true', () => {
        process.env['PROACTIVE_MONITOR_ENABLED'] = 'true';
        process.env['PROACTIVE_MONITOR_INTERVAL_MS'] = '3600000';
        const timer = startProactiveMonitor(DEPS);
        assert.ok(timer !== null, 'expected a timer handle');
        clearInterval(timer!);
        delete process.env['PROACTIVE_MONITOR_ENABLED'];
        delete process.env['PROACTIVE_MONITOR_INTERVAL_MS'];
    });
});
