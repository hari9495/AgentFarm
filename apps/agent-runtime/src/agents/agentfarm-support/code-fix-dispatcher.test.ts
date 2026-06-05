/**
 * Tests for code-fix-dispatcher.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DiagnosisReport } from './platform-diagnostics.js';
import {
    buildCodeFixRequest,
    dispatchToDeveloperAgent,
    pollPrStatus,
    notifyCustomerPrRaised,
} from './code-fix-dispatcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_DEPS = {
    gatewayBaseUrl: 'http://gw:3000',
    serviceToken: 'test-token',
    developerBotId: 'dev-bot-1',
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
        json: async () => ({ dispatchId: 'dispatch-abc-123', fromAgentId: 'support-agent', toAgentId: 'dev-bot-1', status: 'queued', queuedAt: new Date().toISOString() }),
        text: async () => '{}',
    } as Response);
}

function failFetch(status = 500, body = 'error'): (url: string, init?: RequestInit) => Promise<Response> {
    return async () => ({
        ok: false,
        status,
        json: async () => ({ error: body }),
        text: async () => body,
    } as Response);
}

// ---------------------------------------------------------------------------
// buildCodeFixRequest
// ---------------------------------------------------------------------------

describe('buildCodeFixRequest', () => {
    it('extracts failed task error messages', () => {
        const report = makeReport({
            taskLogs: {
                status: 'ok',
                entries: [
                    { id: 'task-1', status: 'failed', actionType: 'workspace_read_file', errorMessage: 'File not found', createdAt: new Date().toISOString() },
                    { id: 'task-2', status: 'completed', actionType: 'workspace_write_file', createdAt: new Date().toISOString() },
                ],
            },
        });
        const req = buildCodeFixRequest(report, 'Agent keeps failing', 'issue-1');
        assert.equal(req.failedTaskIds.length, 1);
        assert.ok(req.errorMessages.some((m) => m.includes('File not found')));
    });

    it('extracts unhealthy connector errors', () => {
        const report = makeReport({
            connectorHealth: {
                status: 'ok',
                connectors: [
                    { connectorId: 'c-1', connectorType: 'github', status: 'error', lastCheckedAt: new Date().toISOString(), errorMessage: 'Token expired' },
                ],
            },
        });
        const req = buildCodeFixRequest(report, 'GitHub integration broken', 'issue-2');
        assert.ok(req.errorMessages.some((m) => m.includes('Token expired')));
    });

    it('sets tenantId, issueId, issueDescription from inputs', () => {
        const report = makeReport({ tenantId: 'my-tenant' });
        const req = buildCodeFixRequest(report, 'Auth failing', 'issue-99');
        assert.equal(req.tenantId, 'my-tenant');
        assert.equal(req.issueId, 'issue-99');
        assert.equal(req.issueDescription, 'Auth failing');
    });

    it('returns empty arrays when no errors', () => {
        const req = buildCodeFixRequest(makeReport(), 'Minor issue', 'issue-x');
        assert.deepEqual(req.errorMessages, []);
        assert.deepEqual(req.failedTaskIds, []);
    });

    it('copies diagnosisSummary from report', () => {
        const report = makeReport({ summary: ['Connector unhealthy: github', 'Billing at 90%'] });
        const req = buildCodeFixRequest(report, 'Issue', 'id');
        assert.deepEqual(req.diagnosisSummary, report.summary);
    });
});

// ---------------------------------------------------------------------------
// dispatchToDeveloperAgent
// ---------------------------------------------------------------------------

describe('dispatchToDeveloperAgent', () => {
    it('returns dispatched:true with dispatchId on success', async () => {
        const req = buildCodeFixRequest(makeReport(), 'Fix auth', 'issue-1');
        const result = await dispatchToDeveloperAgent(req, BASE_DEPS, okDispatchFetch());
        assert.equal(result.dispatched, true);
        assert.equal(result.dispatchId, 'dispatch-abc-123');
    });

    it('returns dispatched:false when developerBotId is empty', async () => {
        const req = buildCodeFixRequest(makeReport(), 'Fix auth', 'issue-1');
        const result = await dispatchToDeveloperAgent(req, { ...BASE_DEPS, developerBotId: '' }, okDispatchFetch());
        assert.equal(result.dispatched, false);
        assert.ok(result.detail?.includes('DEVELOPER_AGENT_BOT_ID'));
    });

    it('returns dispatched:false on HTTP error', async () => {
        const req = buildCodeFixRequest(makeReport(), 'Fix auth', 'issue-1');
        const result = await dispatchToDeveloperAgent(req, BASE_DEPS, failFetch(500, 'Internal error'));
        assert.equal(result.dispatched, false);
        assert.ok(result.detail);
    });

    it('returns dispatched:false on network error', async () => {
        const req = buildCodeFixRequest(makeReport(), 'Fix auth', 'issue-1');
        const throwFetch = async () => { throw new Error('ECONNREFUSED'); };
        const result = await dispatchToDeveloperAgent(req, BASE_DEPS, throwFetch as never);
        assert.equal(result.dispatched, false);
        assert.ok(result.detail?.includes('ECONNREFUSED'));
    });

    it('includes error context and summary in task description', async () => {
        let capturedBody: Record<string, unknown> = {};
        const captureFetch = async (_url: string, init?: RequestInit) => {
            capturedBody = JSON.parse(init?.body as string ?? '{}') as Record<string, unknown>;
            return { ok: true, status: 202, json: async () => ({ dispatchId: 'x' }), text: async () => '' } as Response;
        };
        const report = makeReport({ summary: ['2 failed tasks'] });
        const req = buildCodeFixRequest(report, 'Auth broken', 'issue-1');
        await dispatchToDeveloperAgent(req, BASE_DEPS, captureFetch);
        assert.ok(typeof capturedBody['taskDescription'] === 'string');
        assert.ok((capturedBody['taskDescription'] as string).includes('Auth broken'));
    });
});

// ---------------------------------------------------------------------------
// pollPrStatus
// ---------------------------------------------------------------------------

describe('pollPrStatus', () => {
    it('returns completed with prUrl when dispatch is done', async () => {
        const statusFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ status: 'completed', output: { prUrl: 'https://github.com/org/repo/pull/42' } }),
        } as Response);
        const result = await pollPrStatus('dispatch-1', BASE_DEPS, { pollIntervalMs: 1 }, statusFetch);
        assert.equal(result.status, 'completed');
        if (result.status === 'completed') {
            assert.equal(result.prUrl, 'https://github.com/org/repo/pull/42');
        }
    });

    it('returns failed when dispatch status is failed', async () => {
        const statusFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ status: 'failed', output: { error: 'compile error' } }),
        } as Response);
        const result = await pollPrStatus('dispatch-1', BASE_DEPS, { pollIntervalMs: 1 }, statusFetch);
        assert.equal(result.status, 'failed');
    });

    it('returns timeout when deadline passes without completion', async () => {
        const pendingFetch = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ status: 'queued' }),
        } as Response);
        const result = await pollPrStatus('dispatch-1', BASE_DEPS, { maxWaitMs: 50, pollIntervalMs: 10 }, pendingFetch);
        assert.equal(result.status, 'timeout');
    });
});

// ---------------------------------------------------------------------------
// notifyCustomerPrRaised
// ---------------------------------------------------------------------------

describe('notifyCustomerPrRaised', () => {
    it('PATCHes the issue with PR URL and does not throw', async () => {
        let called = false;
        const captureFetch = async () => { called = true; return { ok: true, status: 200, json: async () => ({}), text: async () => '' } as Response; };
        await notifyCustomerPrRaised('issue-1', 'https://github.com/org/repo/pull/1', BASE_DEPS, captureFetch);
        assert.equal(called, true);
    });

    it('does not throw when fetch errors', async () => {
        const throwFetch = async () => { throw new Error('network down'); };
        await assert.doesNotReject(() => notifyCustomerPrRaised('issue-1', 'https://pr.url', BASE_DEPS, throwFetch as never));
    });

    it('skips fetch when issueId is empty', async () => {
        let called = false;
        const captureFetch = async () => { called = true; return { ok: true } as Response; };
        await notifyCustomerPrRaised('', 'https://pr.url', BASE_DEPS, captureFetch);
        assert.equal(called, false);
    });
});
