/**
 * Tests for platform-diagnostics.ts
 *
 * All HTTP calls are stubbed via mock.method on global fetch.
 * Each test verifies the correct report structure and source status.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { DiagnosticsDeps } from './platform-diagnostics.js';
import { writeDiagnosticAccessAudit } from './platform-diagnostics.js';

const DEPS: DiagnosticsDeps = {
    gatewayBaseUrl: 'http://gw:3000',
    serviceToken: 'test-token',
    timeoutMs: 2_000,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchOnce(responses: Array<{ ok: boolean; json?: unknown; status?: number }>) {
    let callIndex = 0;
    return mock.method(globalThis, 'fetch', async () => {
        const response = responses[callIndex % responses.length];
        callIndex++;
        return {
            ok: response.ok,
            status: response.status ?? (response.ok ? 200 : 500),
            json: async () => response.json ?? {},
            text: async () => JSON.stringify(response.json ?? {}),
        };
    });
}

// ---------------------------------------------------------------------------
// readTaskLogs
// ---------------------------------------------------------------------------

describe('readTaskLogs', () => {
    afterEach(() => mock.restoreAll());

    it('returns parsed task entries on success', async () => {
        const { readTaskLogs } = await import('./platform-diagnostics.js');
        mockFetchOnce([{
            ok: true,
            json: {
                tasks: [
                    { id: 't1', status: 'failed', actionType: 'workspace_read_file', errorMessage: 'not found', createdAt: '2024-01-01T00:00:00Z' },
                    { id: 't2', status: 'completed', actionType: 'workspace_grep', createdAt: '2024-01-01T01:00:00Z', completedAt: '2024-01-01T01:01:00Z' },
                ],
            },
        }]);
        const entries = await readTaskLogs('tenant-1', 4, DEPS);
        assert.equal(entries.length, 2);
        assert.equal(entries[0]?.id, 't1');
        assert.equal(entries[0]?.status, 'failed');
        assert.equal(entries[1]?.status, 'completed');
    });

    it('returns empty array when API returns no tasks', async () => {
        const { readTaskLogs } = await import('./platform-diagnostics.js');
        mockFetchOnce([{ ok: true, json: { tasks: [] } }]);
        const entries = await readTaskLogs('tenant-1', 4, DEPS);
        assert.equal(entries.length, 0);
    });

    it('throws on HTTP error', async () => {
        const { readTaskLogs } = await import('./platform-diagnostics.js');
        mockFetchOnce([{ ok: false, status: 500 }]);
        await assert.rejects(() => readTaskLogs('tenant-1', 4, DEPS), /HTTP 500/);
    });
});

// ---------------------------------------------------------------------------
// readConnectorHealth
// ---------------------------------------------------------------------------

describe('readConnectorHealth', () => {
    afterEach(() => mock.restoreAll());

    it('returns connector health entries', async () => {
        const { readConnectorHealth } = await import('./platform-diagnostics.js');
        mockFetchOnce([{
            ok: true,
            json: {
                connectors: [
                    { id: 'c1', type: 'github', status: 'healthy', lastCheckedAt: '2024-01-01T00:00:00Z' },
                    { id: 'c2', type: 'slack',  status: 'error',   lastCheckedAt: '2024-01-01T00:00:00Z', errorMessage: 'token expired' },
                ],
            },
        }]);
        const connectors = await readConnectorHealth('tenant-1', DEPS);
        assert.equal(connectors.length, 2);
        assert.equal(connectors[0]?.status, 'healthy');
        assert.equal(connectors[1]?.status, 'error');
        assert.equal(connectors[1]?.errorMessage, 'token expired');
    });
});

// ---------------------------------------------------------------------------
// readApprovalQueueState
// ---------------------------------------------------------------------------

describe('readApprovalQueueState', () => {
    afterEach(() => mock.restoreAll());

    it('detects jammed queue (≥10 pending, oldest ≥30 min)', async () => {
        const { readApprovalQueueState } = await import('./platform-diagnostics.js');
        const now = Date.now();
        const oldApprovals = Array.from({ length: 11 }, (_, i) => ({
            id: `a${i}`,
            createdAt: new Date(now - 35 * 60_000).toISOString(),
        }));
        mockFetchOnce([{ ok: true, json: { approvals: oldApprovals } }]);
        const state = await readApprovalQueueState('tenant-1', DEPS);
        assert.equal(state.isJammed, true);
        assert.equal(state.pendingCount, 11);
        assert.ok(state.oldestPendingAgeMinutes >= 30);
    });

    it('not jammed when only 3 pending', async () => {
        const { readApprovalQueueState } = await import('./platform-diagnostics.js');
        mockFetchOnce([{ ok: true, json: { approvals: [{}, {}, {}] } }]);
        const state = await readApprovalQueueState('tenant-1', DEPS);
        assert.equal(state.isJammed, false);
        assert.equal(state.pendingCount, 3);
    });
});

// ---------------------------------------------------------------------------
// readProvisioningState
// ---------------------------------------------------------------------------

describe('readProvisioningState', () => {
    afterEach(() => mock.restoreAll());

    it('identifies stuck jobs older than 30 minutes', async () => {
        const { readProvisioningState } = await import('./platform-diagnostics.js');
        const now = Date.now();
        mockFetchOnce([{
            ok: true,
            json: {
                jobs: [
                    { id: 'j1', status: 'pending', createdAt: new Date(now - 40 * 60_000).toISOString() },
                    { id: 'j2', status: 'running', createdAt: new Date(now - 5 * 60_000).toISOString() },
                    { id: 'j3', status: 'completed', createdAt: new Date(now - 60 * 60_000).toISOString(), completedAt: new Date(now - 55 * 60_000).toISOString() },
                ],
            },
        }]);
        const state = await readProvisioningState('tenant-1', DEPS);
        assert.equal(state.stuckJobs.length, 1);
        assert.equal(state.stuckJobs[0]?.jobId, 'j1');
        assert.ok(state.stuckJobs[0]?.ageMinutes >= 30);
        assert.equal(state.runningJobs, 1);
    });
});

// ---------------------------------------------------------------------------
// buildDiagnosisReport
// ---------------------------------------------------------------------------

describe('buildDiagnosisReport', () => {
    afterEach(() => mock.restoreAll());

    it('returns structured report with all 7 sources populated', async () => {
        const { buildDiagnosisReport } = await import('./platform-diagnostics.js');

        // 7 API calls in Promise.all order: tasks, otel, connectors, approvals, billing, provisioning, audit
        mockFetchOnce([
            { ok: true, json: { tasks: [{ id: 't1', status: 'failed', actionType: 'workspace_read_file', createdAt: '2024-01-01T00:00:00Z' }] } },
            { ok: true, json: { spans: [] } },
            { ok: true, json: { connectors: [{ id: 'c1', type: 'slack', status: 'error', lastCheckedAt: '2024-01-01T00:00:00Z' }] } },
            { ok: true, json: { approvals: [] } },
            { ok: true, json: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 50, monthlyUsagePercent: 82, isThrottled: false, isHardStopped: false } },
            { ok: true, json: { jobs: [] } },
            { ok: true, json: { entries: [] } },
        ]);

        const report = await buildDiagnosisReport('tenant-1', DEPS);

        assert.equal(report.tenantId, 'tenant-1');
        assert.ok(report.generatedAt);
        assert.equal(report.taskLogs.status, 'ok');
        assert.equal(report.taskLogs.entries.length, 1);
        assert.equal(report.otelTraces.status, 'ok');
        assert.equal(report.connectorHealth.status, 'ok');
        assert.equal(report.connectorHealth.connectors[0]?.status, 'error');
        assert.equal(report.approvalQueue.status, 'ok');
        assert.equal(report.billing.status, 'ok');
        assert.equal(report.billing.state?.monthlyUsagePercent, 82);
        assert.equal(report.provisioning.status, 'ok');
        assert.equal(report.auditLog.status, 'ok');
        // Summary should mention the unhealthy connector and billing usage
        assert.ok(report.summary.some((s) => s.includes('connector')));
        assert.ok(report.summary.some((s) => s.includes('Billing')));
    });

    it('marks timed-out sources as timeout and continues', async () => {
        const { buildDiagnosisReport } = await import('./platform-diagnostics.js');

        let callCount = 0;
        mock.method(globalThis, 'fetch', async () => {
            callCount++;
            if (callCount === 1) {
                // task logs: timeout
                await new Promise((resolve) => setTimeout(resolve, 3_000));
                return { ok: true, json: async () => ({ tasks: [] }), status: 200 };
            }
            return {
                ok: true,
                status: 200,
                json: async () => ({}),
                text: async () => '{}',
            };
        });

        const depsShortTimeout: DiagnosticsDeps = { ...DEPS, timeoutMs: 50 };
        const report = await buildDiagnosisReport('tenant-1', depsShortTimeout);

        // At least one source should be non-ok due to the short timeout
        const statuses = [
            report.taskLogs.status, report.otelTraces.status, report.connectorHealth.status,
            report.approvalQueue.status, report.billing.status, report.provisioning.status,
            report.auditLog.status,
        ];
        assert.ok(statuses.some((s) => s !== 'ok'));
        assert.ok(report.summary.some((s) => s.includes('Partial')));
    });
});

// ── writeDiagnosticAccessAudit ────────────────────────────────────────────

describe('writeDiagnosticAccessAudit', () => {
    afterEach(() => mock.restoreAll());

    it('POSTs an audit entry with correct eventType and fields', async () => {
        type Captured = { url: string; body: Record<string, unknown> };
        let captured: Captured | null = null;
        mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
            captured = { url, body: JSON.parse(init.body as string) } as Captured;
            return { ok: true, status: 200 };
        });

        await writeDiagnosticAccessAudit(
            {
                tenantId: 'tenant-x',
                requestedBy: 'bot-123',
                dataSources: ['task_logs', 'billing'],
                timedOutSources: [],
                timestamp: '2026-01-01T00:00:00.000Z',
                correlationId: 'corr-abc',
            },
            DEPS,
        );

        const c = captured as Captured | null;
        assert.ok(c !== null, 'fetch should have been called');
        assert.ok(c.url.includes('/v1/audit/support-diagnostic'));
        assert.equal(c.body['eventType'], 'support_agent_diagnostic_read');
        assert.equal(c.body['tenantId'], 'tenant-x');
        assert.equal(c.body['requestedBy'], 'bot-123');
        assert.deepEqual(c.body['dataSources'], ['task_logs', 'billing']);
        assert.equal(c.body['correlationId'], 'corr-abc');
    });

    it('does not throw when the audit endpoint is unavailable', async () => {
        mock.method(globalThis, 'fetch', async () => { throw new Error('network error'); });

        await assert.doesNotReject(() =>
            writeDiagnosticAccessAudit(
                { tenantId: 't', requestedBy: 'b', dataSources: [], timedOutSources: [], timestamp: '' },
                DEPS,
            ),
        );
    });

    it('does not throw when the audit endpoint returns a non-2xx status', async () => {
        mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));

        await assert.doesNotReject(() =>
            writeDiagnosticAccessAudit(
                { tenantId: 't', requestedBy: 'b', dataSources: [], timedOutSources: [], timestamp: '' },
                DEPS,
            ),
        );
    });
});
