import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerGovernanceKPIRoutes } from './governance-kpis.js';

const KPI_SHAPE_KEYS = [
    'timestamp',
    'time_range_seconds',
    'approval',
    'audit',
    'budget',
    'providers',
    'execution',
    'sla_compliance_percent',
] as const;

test('GET /v1/governance/kpis returns 200 with correct shape', async () => {
    const app = Fastify();
    registerGovernanceKPIRoutes(app);

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/governance/kpis' });

        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;

        for (const key of KPI_SHAPE_KEYS) {
            assert.ok(key in body, `missing key: ${key}`);
        }

        const approval = body['approval'] as Record<string, unknown>;
        assert.ok('pending_count' in approval, 'approval.pending_count missing');
        assert.ok('decision_count' in approval, 'approval.decision_count missing');
        assert.ok('avg_decision_latency_ms' in approval, 'approval.avg_decision_latency_ms missing');

        const budget = body['budget'] as Record<string, unknown>;
        assert.ok('tokens_consumed' in budget, 'budget.tokens_consumed missing');
        assert.ok('tokens_remaining' in budget, 'budget.tokens_remaining missing');
        assert.ok('cost_per_action_average' in budget, 'budget.cost_per_action_average missing');

        const execution = body['execution'] as Record<string, unknown>;
        assert.ok('success_rate' in execution, 'execution.success_rate missing');
        assert.ok('avg_execution_time_ms' in execution, 'execution.avg_execution_time_ms missing');

        assert.equal(typeof body['sla_compliance_percent'], 'number');
        assert.equal(typeof body['time_range_seconds'], 'number');
        assert.ok(Array.isArray(body['providers']), 'providers should be an array');
    } finally {
        await app.close();
    }
});

test('GET /v1/governance/kpis respects time_window_seconds and workspace_id query params', async () => {
    const app = Fastify();
    registerGovernanceKPIRoutes(app);

    try {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/governance/kpis?time_window_seconds=7200&workspace_id=ws-test',
        });

        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;

        // The time window should be echoed back in the response
        assert.equal(body['time_range_seconds'], 7200);
    } finally {
        await app.close();
    }
});
