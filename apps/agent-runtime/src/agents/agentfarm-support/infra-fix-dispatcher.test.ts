/**
 * Tests for infra-fix-dispatcher.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiagnosisReport } from './platform-diagnostics.js';
import {
    buildInfraFixRequest,
    dispatchToDevopsAgent,
    pollRunbookStatus,
    notifyCustomerInfraFixed,
} from './infra-fix-dispatcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_DEPS = {
    gatewayBaseUrl: 'http://gw:3000',
    serviceToken: 'test-token',
    devopsBotId: 'devops-bot-1',
    workspaceId: 'ws-1',
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

function okDispatchFetch(): (url: string, init?: RequestInit) => Promise<Response> {
    return async () => ({
        ok: true,
        status: 202,
        json: async () => ({ dispatchId: 'infra-dispatch-xyz', status: 'queued', queuedAt: new Date().toISOString() }),
        text: async () => '{}',
    } as Response);
}

// ---------------------------------------------------------------------------
// buildInfraFixRequest
// ---------------------------------------------------------------------------

describe('buildInfraFixRequest', () => {
    it('lists failing connectors as failing services', () => {
        const report = makeReport({
            connectorHealth: {
                status: 'ok',
                connectors: [
                    { connectorId: 'c-1', connectorType: 'datadog', status: 'error', lastCheckedAt: new Date().toISOString() },
                    { connectorId: 'c-2', connectorType: 'github', status: 'healthy', lastCheckedAt: new Date().toISOString() },
                ],
            },
        });
        const req = buildInfraFixRequest(report, 'Monitoring down', 'issue-1');
        assert.equal(req.failingServices.length, 1);
        assert.ok(req.failingServices[0]!.includes('datadog'));
    });

    it('lists stuck provisioning jobs', () => {
        const report = makeReport({
            provisioning: {
                status: 'ok',
                state: {
                    runningJobs: 1,
                    stuckJobs: [
                        { jobId: 'job-1', status: 'pending', ageMinutes: 45 },
                        { jobId: 'job-2', status: 'running', ageMinutes: 60 },
                    ],
                },
            },
        });
        const req = buildInfraFixRequest(report, 'Provisioning stuck', 'issue-2');
        assert.equal(req.stuckJobIds.length, 2);
        assert.ok(req.stuckJobIds.some((j) => j.includes('job-1')));
    });

    it('captures billing state as hard-stopped', () => {
        const report = makeReport({
            billing: {
                status: 'ok',
                state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 100, monthlyUsagePercent: 100, isThrottled: false, isHardStopped: true },
            },
        });
        const req = buildInfraFixRequest(report, 'Agent stopped', 'issue-3');
        assert.ok(req.billingState.includes('hard-stopped'));
    });

    it('captures billing state as throttled', () => {
        const report = makeReport({
            billing: {
                status: 'ok',
                state: { subscriptionStatus: 'active', budgetPolicyEnabled: true, dailyUsagePercent: 90, monthlyUsagePercent: 95, isThrottled: true, isHardStopped: false },
            },
        });
        const req = buildInfraFixRequest(report, 'Agent slow', 'issue-4');
        assert.ok(req.billingState.includes('throttled'));
    });

    it('sets tenantId, issueId, issueDescription', () => {
        const report = makeReport({ tenantId: 'infra-tenant' });
        const req = buildInfraFixRequest(report, 'Database unreachable', 'issue-99');
        assert.equal(req.tenantId, 'infra-tenant');
        assert.equal(req.issueId, 'issue-99');
        assert.equal(req.issueDescription, 'Database unreachable');
    });

    it('returns empty arrays when all healthy', () => {
        const req = buildInfraFixRequest(makeReport(), 'Routine check', 'issue-x');
        assert.deepEqual(req.failingServices, []);
        assert.deepEqual(req.stuckJobIds, []);
    });
});

// ---------------------------------------------------------------------------
// dispatchToDevopsAgent
// ---------------------------------------------------------------------------

describe('dispatchToDevopsAgent', () => {
    it('returns dispatched:true with dispatchId on success', async () => {
        const req = buildInfraFixRequest(makeReport(), 'DB down', 'issue-1');
        const result = await dispatchToDevopsAgent(req, BASE_DEPS, okDispatchFetch());
        assert.equal(result.dispatched, true);
        assert.equal(result.dispatchId, 'infra-dispatch-xyz');
    });

    it('returns dispatched:false when devopsBotId is empty', async () => {
        const req = buildInfraFixRequest(makeReport(), 'DB down', 'issue-1');
        const result = await dispatchToDevopsAgent(req, { ...BASE_DEPS, devopsBotId: '' }, okDispatchFetch());
        assert.equal(result.dispatched, false);
        assert.ok(result.detail?.includes('DEVOPS_AGENT_BOT_ID'));
    });

    it('returns dispatched:false on HTTP error', async () => {
        const req = buildInfraFixRequest(makeReport(), 'DB down', 'issue-1');
        const failFetch = async () => ({ ok: false, status: 503, json: async () => ({ error: 'unavailable' }), text: async () => '' } as Response);
        const result = await dispatchToDevopsAgent(req, BASE_DEPS, failFetch);
        assert.equal(result.dispatched, false);
    });

    it('returns dispatched:false on network error', async () => {
        const req = buildInfraFixRequest(makeReport(), 'DB down', 'issue-1');
        const throwFetch = async () => { throw new Error('ECONNREFUSED'); };
        const result = await dispatchToDevopsAgent(req, BASE_DEPS, throwFetch as never);
        assert.equal(result.dispatched, false);
        assert.ok(result.detail?.includes('ECONNREFUSED'));
    });

    it('includes failing service context in task description', async () => {
        let capturedBody: Record<string, unknown> = {};
        const captureFetch = async (_url: string, init?: RequestInit) => {
            capturedBody = JSON.parse(init?.body as string ?? '{}') as Record<string, unknown>;
            return { ok: true, status: 202, json: async () => ({ dispatchId: 'x' }), text: async () => '' } as Response;
        };
        const report = makeReport({
            connectorHealth: {
                status: 'ok',
                connectors: [{ connectorId: 'c-1', connectorType: 'grafana', status: 'degraded', lastCheckedAt: new Date().toISOString() }],
            },
        });
        const req = buildInfraFixRequest(report, 'Grafana degraded', 'issue-1');
        await dispatchToDevopsAgent(req, BASE_DEPS, captureFetch);
        const desc = capturedBody['taskDescription'] as string;
        assert.ok(desc.includes('grafana'));
    });
});

// ---------------------------------------------------------------------------
// pollRunbookStatus
// ---------------------------------------------------------------------------

describe('pollRunbookStatus', () => {
    it('returns completed with runbookSummary', async () => {
        const statusFetch = async () => ({
            ok: true, status: 200,
            json: async () => ({ status: 'completed', output: { summary: 'Restarted postgres replica' } }),
        } as Response);
        const result = await pollRunbookStatus('dispatch-1', BASE_DEPS, { pollIntervalMs: 1 }, statusFetch);
        assert.equal(result.status, 'completed');
        if (result.status === 'completed') {
            assert.equal(result.runbookSummary, 'Restarted postgres replica');
        }
    });

    it('returns failed when dispatch reports failure', async () => {
        const statusFetch = async () => ({
            ok: true, status: 200,
            json: async () => ({ status: 'failed', output: { error: 'runbook failed' } }),
        } as Response);
        const result = await pollRunbookStatus('dispatch-1', BASE_DEPS, { pollIntervalMs: 1 }, statusFetch);
        assert.equal(result.status, 'failed');
    });

    it('returns timeout when deadline passes', async () => {
        const pendingFetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'running' }) } as Response);
        const result = await pollRunbookStatus('d-1', BASE_DEPS, { maxWaitMs: 50, pollIntervalMs: 10 }, pendingFetch);
        assert.equal(result.status, 'timeout');
    });
});

// ---------------------------------------------------------------------------
// notifyCustomerInfraFixed
// ---------------------------------------------------------------------------

describe('notifyCustomerInfraFixed', () => {
    it('PATCHes the issue and does not throw', async () => {
        let called = false;
        const captureFetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response; };
        await notifyCustomerInfraFixed('issue-1', 'Restarted service', BASE_DEPS, captureFetch);
        assert.equal(called, true);
    });

    it('does not throw when fetch errors', async () => {
        const throwFetch = async () => { throw new Error('network down'); };
        await assert.doesNotReject(() => notifyCustomerInfraFixed('issue-1', 'summary', BASE_DEPS, throwFetch as never));
    });

    it('skips fetch when issueId is empty', async () => {
        let called = false;
        const captureFetch = async () => { called = true; return { ok: true } as Response; };
        await notifyCustomerInfraFixed('', 'summary', BASE_DEPS, captureFetch);
        assert.equal(called, false);
    });
});
