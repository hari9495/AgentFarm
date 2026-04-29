/**
 * Epic B3: Governance KPI Completeness Tests
 * Tests evidence chain assembly, metric calculation, and report export
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import { GovernanceKpiCalculator, type EvidenceChainRequest } from './governance-kpi.js';

test('B3: calculateMetrics returns governance metrics structure', async () => {
    const kpi = new GovernanceKpiCalculator();

    const metrics = await kpi.calculateMetrics('tenant-1', 'ws-1', '2026-05-01T00:00:00Z', '2026-05-31T23:59:59Z');

    assert.ok(metrics.tenantId);
    assert.equal(metrics.tenantId, 'tenant-1');
    assert.equal(metrics.workspaceId, 'ws-1');
    assert.ok(metrics.generatedAt);
    assert.ok(metrics.correlationId);
});

test('B3: assembleEvidenceChain creates evidence chain record', async () => {
    const kpi = new GovernanceKpiCalculator();

    const request: EvidenceChainRequest = {
        tenantId: 'tenant-2',
        workspaceId: 'ws-2',
        botId: 'bot-1',
        taskId: 'task-1',
        actionId: 'action-1',
        correlationId: 'corr-1',
    };

    const chain = await kpi.assembleEvidenceChain(request);

    assert.ok(chain.id);
    assert.equal(chain.tenantId, 'tenant-2');
    assert.equal(chain.workspaceId, 'ws-2');
    assert.equal(chain.actionId, 'action-1');
    assert.ok(chain.assembledAt);
});

test('B3: validateChainCompleteness detects missing records', async () => {
    const kpi = new GovernanceKpiCalculator();

    const incompleteChain = {
        id: 'chain-1',
        tenantId: 'tenant-3',
        workspaceId: 'ws-3',
        botId: 'bot-1',
        taskId: 'task-1',
        actionId: 'action-1',
        isComplete: false,
        missingFields: [] as string[],
        correlationId: 'corr-1',
        assembledAt: new Date().toISOString(),
    };

    const result = await kpi.validateChainCompleteness(incompleteChain);

    assert.equal(result.isComplete, false);
    assert.ok(result.missingFields.length > 0);
    assert.ok(result.missingFields.includes('action_record'));
});

test('B3: validateChainCompleteness validates medium-risk requires approval', async () => {
    const kpi = new GovernanceKpiCalculator();

    const chain = {
        id: 'chain-2',
        tenantId: 'tenant-4',
        workspaceId: 'ws-4',
        botId: 'bot-1',
        taskId: 'task-2',
        actionId: 'action-2',
        actionRecord: {
            id: 'action-1',
            tenantId: 'tenant-4',
            workspaceId: 'ws-4',
            botId: 'bot-1',
            actionType: 'create_pr',
            riskLevel: 'medium' as const,
            policyPackVersion: '1.0.0',
            inputSummary: 'Create PR',
            status: 'completed' as const,
            correlationId: 'corr-1',
            createdAt: new Date().toISOString(),
        },
        // Missing approval records for medium-risk action
        auditEvents: [],
        isComplete: false,
        missingFields: [] as string[],
        correlationId: 'corr-1',
        assembledAt: new Date().toISOString(),
    };

    const result = await kpi.validateChainCompleteness(chain);

    assert.ok(result.missingFields.includes('approval_record'));
});

test('B3: calculateApprovalLatencyPercentiles returns latency metrics', async () => {
    const kpi = new GovernanceKpiCalculator();

    const latency = await kpi.calculateApprovalLatencyPercentiles(
        'tenant-5',
        'ws-5',
        '2026-05-01T00:00:00Z',
        '2026-05-31T23:59:59Z'
    );

    assert.ok(latency.p50 > 0);
    assert.ok(latency.p95 > latency.p50);
    assert.ok(latency.p99 > latency.p95);
    assert.ok(latency.timeoutRate >= 0);
    assert.ok(latency.timeoutRate <= 1);
});

test('B3: calculateBudgetBlockRate returns block rate metrics', async () => {
    const kpi = new GovernanceKpiCalculator();

    const blockRate = await kpi.calculateBudgetBlockRate(
        'tenant-6',
        'ws-6',
        '2026-05-01T00:00:00Z',
        '2026-05-31T23:59:59Z'
    );

    assert.ok(blockRate.totalAttempts > 0);
    assert.ok(blockRate.blockedAttempts >= 0);
    assert.ok(blockRate.blockRate >= 0);
    assert.ok(blockRate.blockRate <= 1);
    assert.ok(blockRate.hardStopsActivated >= 0);
});

test('B3: calculateProviderFailoverRate returns failover metrics', async () => {
    const kpi = new GovernanceKpiCalculator();

    const failover = await kpi.calculateProviderFailoverRate(
        'tenant-7',
        'ws-7',
        '2026-05-01T00:00:00Z',
        '2026-05-31T23:59:59Z'
    );

    assert.ok(failover.totalAttempts > 0);
    assert.ok(failover.failoverAttempts >= 0);
    assert.ok(failover.failoverRate >= 0);
    assert.ok(failover.failoverRate <= 1);
});

test('B3: exportGovernanceReport generates complete report', async () => {
    const kpi = new GovernanceKpiCalculator();

    const report = await kpi.exportGovernanceReport('tenant-8', 'ws-8', '2026-05-15');

    assert.equal(report.tenantId, 'tenant-8');
    assert.equal(report.workspaceId, 'ws-8');
    assert.equal(report.reportDate, '2026-05-15');
    assert.ok(report.metrics);
    assert.ok(report.generatedAt);
    assert.ok(Array.isArray(report.evidenceChains));
});

test('B3: evidence chains are tenant-scoped', async () => {
    const kpi = new GovernanceKpiCalculator();

    const request1: EvidenceChainRequest = {
        tenantId: 'tenant-9',
        workspaceId: 'ws-9a',
        botId: 'bot-1',
        taskId: 'task-1',
        actionId: 'action-1',
        correlationId: 'corr-1',
    };

    const request2: EvidenceChainRequest = {
        tenantId: 'tenant-10',
        workspaceId: 'ws-10a',
        botId: 'bot-2',
        taskId: 'task-2',
        actionId: 'action-2',
        correlationId: 'corr-2',
    };

    const chain1 = await kpi.assembleEvidenceChain(request1);
    const chain2 = await kpi.assembleEvidenceChain(request2);

    // Chains belong to different tenants
    assert.notEqual(chain1.tenantId, chain2.tenantId);
    assert.equal(chain1.tenantId, 'tenant-9');
    assert.equal(chain2.tenantId, 'tenant-10');
});
