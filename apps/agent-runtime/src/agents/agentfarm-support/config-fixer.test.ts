/**
 * Tests for config-fixer.ts
 *
 * Mocks HTTP endpoints and verifies the correct Tier 1 fix is chosen and
 * applied for each diagnosis scenario.
 */

import assert from 'node:assert/strict';
import { describe, it, afterEach, mock } from 'node:test';
import type { DiagnosisReport } from './platform-diagnostics.js';
import type { ConfigFixerDeps } from './config-fixer.js';

const DEPS: ConfigFixerDeps = {
    gatewayBaseUrl: 'http://gw:3000',
    serviceToken: 'test-token',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(overrides: Partial<DiagnosisReport> = {}): DiagnosisReport {
    return {
        tenantId: 'tenant-1',
        generatedAt: new Date().toISOString(),
        taskLogs:       { status: 'ok', entries: [] },
        otelTraces:     { status: 'ok', spans: [] },
        connectorHealth:{ status: 'ok', connectors: [] },
        approvalQueue:  { status: 'ok', state: { pendingCount: 0, isJammed: false, oldestPendingAgeMinutes: 0 } },
        billing:        { status: 'ok', state: { subscriptionStatus: 'active', budgetPolicyEnabled: false, dailyUsagePercent: 10, monthlyUsagePercent: 10, isThrottled: false, isHardStopped: false } },
        provisioning:   { status: 'ok', state: { runningJobs: 0, stuckJobs: [] } },
        auditLog:       { status: 'ok', entries: [] },
        summary: [],
        ...overrides,
    };
}

function mockFetchAlwaysOk() {
    return mock.method(globalThis, 'fetch', async () => ({
        ok: true, status: 200,
        json: async () => ({}),
        text: async () => '{}',
    }));
}

// ---------------------------------------------------------------------------
// Individual fix functions
// ---------------------------------------------------------------------------

describe('refreshConnectorToken', () => {
    afterEach(() => mock.restoreAll());

    it('POSTs to /v1/connectors/:id/refresh and returns ok:true', async () => {
        const { refreshConnectorToken } = await import('./config-fixer.js');
        const calls: string[] = [];
        mock.method(globalThis, 'fetch', async (url: string) => {
            calls.push(url);
            return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
        });
        const result = await refreshConnectorToken('tenant-1', 'conn-abc', DEPS);
        assert.equal(result.ok, true);
        assert.ok(calls[0]?.includes('/v1/connectors/conn-abc/refresh'));
    });

    it('returns ok:false on HTTP 401', async () => {
        const { refreshConnectorToken } = await import('./config-fixer.js');
        mock.method(globalThis, 'fetch', async () => ({
            ok: false, status: 401,
            text: async () => 'Unauthorized',
        }));
        const result = await refreshConnectorToken('tenant-1', 'conn-abc', DEPS);
        assert.equal(result.ok, false);
        assert.ok(result.detail?.includes('401'));
    });
});

describe('retryStuckProvisioningJob', () => {
    afterEach(() => mock.restoreAll());

    it('POSTs to the retry endpoint', async () => {
        const { retryStuckProvisioningJob } = await import('./config-fixer.js');
        const calls: string[] = [];
        mock.method(globalThis, 'fetch', async (url: string) => {
            calls.push(url);
            return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' };
        });
        const result = await retryStuckProvisioningJob('tenant-1', 'job-xyz', DEPS);
        assert.equal(result.ok, true);
        assert.ok(calls[0]?.includes('/v1/admin/provision/jobs/job-xyz/retry'));
    });
});

// ---------------------------------------------------------------------------
// applyTier1Fix — decision routing
// ---------------------------------------------------------------------------

describe('applyTier1Fix', () => {
    afterEach(() => mock.restoreAll());

    it('returns no_fix_needed when diagnosis is all-clear', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport();
        const result = await applyTier1Fix(report, DEPS);
        assert.equal(result.applied, false);
        assert.equal(result.fixes[0]?.type, 'no_fix_needed');
    });

    it('applies connector_token_refresh for error connector', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport({
            connectorHealth: {
                status: 'ok',
                connectors: [{ connectorId: 'c1', connectorType: 'slack', status: 'error', lastCheckedAt: new Date().toISOString() }],
            },
        });
        const result = await applyTier1Fix(report, DEPS);
        assert.ok(result.applied);
        assert.ok(result.fixes.some((f) => f.type === 'connector_token_refresh'));
    });

    it('applies connector_needs_reconnect for needs_reconnect connector', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport({
            connectorHealth: {
                status: 'ok',
                connectors: [{ connectorId: 'c2', connectorType: 'github', status: 'needs_reconnect', lastCheckedAt: new Date().toISOString() }],
            },
        });
        const result = await applyTier1Fix(report, DEPS);
        assert.ok(result.applied);
        assert.ok(result.fixes.some((f) => f.type === 'connector_needs_reconnect'));
    });

    it('retries stuck provisioning jobs', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport({
            provisioning: {
                status: 'ok',
                state: { runningJobs: 0, stuckJobs: [{ jobId: 'job-1', status: 'pending', ageMinutes: 45 }] },
            },
        });
        const result = await applyTier1Fix(report, DEPS);
        assert.ok(result.applied);
        assert.ok(result.fixes.some((f) => f.type === 'provisioning_job_retry'));
    });

    it('sends billing notification when monthly usage >= 80%', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport({
            billing: {
                status: 'ok',
                state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 60, monthlyUsagePercent: 85, isThrottled: false, isHardStopped: false },
            },
        });
        const result = await applyTier1Fix(report, DEPS);
        assert.ok(result.applied);
        assert.ok(result.fixes.some((f) => f.type === 'billing_limit_notify'));
    });

    it('surfaces jammed approval queue', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport({
            approvalQueue: {
                status: 'ok',
                state: { pendingCount: 12, isJammed: true, oldestPendingAgeMinutes: 35, jamReason: '12 pending, oldest 35 min' },
            },
        });
        const result = await applyTier1Fix(report, DEPS);
        assert.ok(result.applied);
        assert.ok(result.fixes.some((f) => f.type === 'approval_queue_surface'));
    });

    it('skips connector fixes when connector health is unavailable', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport({
            connectorHealth: { status: 'timeout', connectors: [] },
        });
        const result = await applyTier1Fix(report, DEPS);
        assert.ok(result.skipped.some((s) => s.includes('connector_fixes')));
    });

    it('applies multiple fixes in a single pass', async () => {
        const { applyTier1Fix } = await import('./config-fixer.js');
        mockFetchAlwaysOk();
        const report = makeReport({
            connectorHealth: {
                status: 'ok',
                connectors: [{ connectorId: 'c1', connectorType: 'slack', status: 'error', lastCheckedAt: new Date().toISOString() }],
            },
            provisioning: {
                status: 'ok',
                state: { runningJobs: 0, stuckJobs: [{ jobId: 'job-1', status: 'pending', ageMinutes: 40 }] },
            },
        });
        const result = await applyTier1Fix(report, DEPS);
        assert.ok(result.applied);
        assert.ok(result.fixes.length >= 2);
        assert.ok(result.fixes.some((f) => f.type === 'connector_token_refresh'));
        assert.ok(result.fixes.some((f) => f.type === 'provisioning_job_retry'));
    });
});
