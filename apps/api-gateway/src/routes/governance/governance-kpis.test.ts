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
    registerGovernanceKPIRoutes(app, { getSession: () => ({ userId: 'u1', tenantId: 'tenant_test', workspaceIds: ['ws_test'], expiresAt: Date.now() + 3_600_000 }) });

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
    registerGovernanceKPIRoutes(app, { getSession: () => ({ userId: 'u1', tenantId: 'tenant_test', workspaceIds: ['ws_test'], expiresAt: Date.now() + 3_600_000 }) });

    try {
        const res = await app.inject({
            method: 'GET',
            // workspace_id must be in session.workspaceIds ('ws_test')
            url: '/v1/governance/kpis?time_window_seconds=7200&workspace_id=ws_test',
        });

        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;

        // The time window should be echoed back in the response
        assert.equal(body['time_range_seconds'], 7200);
    } finally {
        await app.close();
    }
});

test('B3: GET /v1/governance/kpis includes provider_failover_rate field', async () => {
    const app = Fastify();
    registerGovernanceKPIRoutes(app, { getSession: () => ({ userId: 'u1', tenantId: 'tenant_test', workspaceIds: ['ws_test'], expiresAt: Date.now() + 3_600_000 }) });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/governance/kpis' });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;
        assert.ok('provider_failover_rate' in body, 'provider_failover_rate missing from KPI response');
        assert.equal(typeof body['provider_failover_rate'], 'number');
    } finally {
        await app.close();
    }
});

test('B3: GET /v1/governance/kpis/export returns 400 when workspace_id is missing', async () => {
    const app = Fastify();
    registerGovernanceKPIRoutes(app, { getSession: () => ({ userId: 'u1', tenantId: 'tenant_test', workspaceIds: ['ws_test'], expiresAt: Date.now() + 3_600_000 }) });

    try {
        const res = await app.inject({ method: 'GET', url: '/v1/governance/kpis/export' });
        assert.equal(res.statusCode, 400);
        const body = res.json() as Record<string, unknown>;
        assert.ok(body['error']);
    } finally {
        await app.close();
    }
});

test('B3: GET /v1/governance/kpis/export returns complete quality report with timestamps', async () => {
    const app = Fastify();
    registerGovernanceKPIRoutes(app, { getSession: () => ({ userId: 'u1', tenantId: 'tenant_test', workspaceIds: ['ws_test'], expiresAt: Date.now() + 3_600_000 }) });

    try {
        const res = await app.inject({
            method: 'GET',
            // tenant_id is now always taken from the session — query param is ignored
            url: '/v1/governance/kpis/export?workspace_id=ws-b3-test&report_date=2026-05-15',
        });
        assert.equal(res.statusCode, 200);
        const body = res.json() as Record<string, unknown>;

        // Report identity
        assert.equal(body['report_date'], '2026-05-15');
        assert.equal(body['workspace_id'], 'ws-b3-test');
        // tenant_id now comes from the session (never from the query string)
        assert.equal(body['tenant_id'], 'tenant_test');
        assert.ok(body['generated_at'], 'generated_at timestamp must be present');
        assert.ok(body['period_start'], 'period_start must be present');
        assert.ok(body['period_end'], 'period_end must be present');

        // KPI snapshot fields — B3 criteria 2
        const kpis = body['kpis'] as Record<string, unknown>;
        assert.ok(kpis, 'kpis block must be present');
        assert.ok('approval_p95_latency_s' in kpis, 'approval_p95_latency_s missing');
        assert.ok('evidence_completeness_pct' in kpis, 'evidence_completeness_pct missing');
        assert.ok('budget_block_rate' in kpis, 'budget_block_rate missing');
        assert.ok('provider_failover_rate' in kpis, 'provider_failover_rate missing');
        assert.ok('sla_compliance_pct' in kpis, 'sla_compliance_pct missing');

        // Snapshots array — each entry has metric name + value + timestamp
        const snapshots = body['snapshots'] as Array<Record<string, unknown>>;
        assert.ok(Array.isArray(snapshots), 'snapshots must be an array');
        assert.ok(snapshots.length >= 4, 'at least 4 KPI snapshots required');
        for (const snap of snapshots) {
            assert.ok(typeof snap['metric'] === 'string', 'snapshot.metric must be a string');
            assert.ok(typeof snap['value'] === 'number', 'snapshot.value must be a number');
            assert.ok(typeof snap['recorded_at'] === 'string', 'snapshot.recorded_at must be a timestamp string');
        }
    } finally {
        await app.close();
    }
});

test('B3: GET /v1/governance/kpis/export is workspace-scoped', async () => {
    const app = Fastify();
    registerGovernanceKPIRoutes(app, { getSession: () => ({ userId: 'u1', tenantId: 'tenant_test', workspaceIds: ['ws_test'], expiresAt: Date.now() + 3_600_000 }) });

    try {
        const res1 = await app.inject({
            method: 'GET',
            url: '/v1/governance/kpis/export?workspace_id=ws-alpha',
        });
        const res2 = await app.inject({
            method: 'GET',
            url: '/v1/governance/kpis/export?workspace_id=ws-beta',
        });

        assert.equal(res1.statusCode, 200);
        assert.equal(res2.statusCode, 200);

        const body1 = res1.json() as Record<string, unknown>;
        const body2 = res2.json() as Record<string, unknown>;

        // Each report is scoped to its own workspace
        assert.equal(body1['workspace_id'], 'ws-alpha');
        assert.equal(body2['workspace_id'], 'ws-beta');
        assert.notEqual(body1['workspace_id'], body2['workspace_id']);
    } finally {
        await app.close();
    }
});
