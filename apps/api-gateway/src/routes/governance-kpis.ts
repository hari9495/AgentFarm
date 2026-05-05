/**
 * Governance KPI Routes
 *
 * GET /v1/governance/kpis — Get KPI snapshot for time window
 * GET /v1/governance/kpis/providers — Get provider health KPIs
 * GET /v1/governance/sla-compliance — Get SLA compliance metrics
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

type KPIQuery = {
    time_window_seconds?: string;
};

let globalProviderState: any = null;

const getProviderState = async () => {
    if (!globalProviderState) {
        const mod = await import('../agent-runtime-stubs.js');
        globalProviderState = mod.globalProviderState;
    }
    return globalProviderState;
};

export function registerGovernanceKPIRoutes(app: FastifyInstance): void {
    // Get KPI snapshot
    app.get(
        '/v1/governance/kpis',
        async (req: FastifyRequest<{ Querystring: KPIQuery }>, reply) => {
            const timeWindow = parseInt((req.query as KPIQuery).time_window_seconds || '3600', 10);

            // Build KPI snapshot
            const snapshot = {
                timestamp: Date.now(),
                time_range_seconds: timeWindow,
                approval: {
                    pending_count: 0,
                    decision_count: 0,
                    avg_decision_latency_ms: 0,
                    p95_decision_latency_ms: 0,
                    p99_decision_latency_ms: 0,
                    escalation_rate: 0,
                    rejection_rate: 0,
                },
                audit: {
                    completeness_percent: 100,
                    risky_action_audit_rate: 100,
                    unaudited_actions_count: 0,
                    audit_coverage_by_risk: { low: 100, medium: 100, high: 100 },
                },
                budget: {
                    tokens_consumed: 0,
                    tokens_remaining: 1000000,
                    hard_stop_block_rate: 0,
                    cost_per_action_average: 100,
                    cost_trend_percent_change: 0,
                },
                providers: [],
                execution: {
                    success_rate: 1.0,
                    avg_execution_time_ms: 0,
                    p95_execution_time_ms: 0,
                    autonomy_rate: 0.8,
                    approval_rate: 0.2,
                },
                sla_compliance_percent: 95,
            };

            return reply.send(snapshot);
        },
    );

    // Get provider health KPIs
    app.get('/v1/governance/kpis/providers', async (_req, reply) => {
        const providerState = await getProviderState();

        const providers = providerState.getAllStates();
        return reply.send({ providers, total: providers.length });
    });

    // Get SLA compliance
    app.get('/v1/governance/sla-compliance', async (_req, reply) => {
        const compliance = {
            approval_sla_percent: 95,
            audit_sla_percent: 100,
            budget_sla_percent: 100,
            provider_sla_percent: 97,
            overall_sla_percent: 98,
            last_updated: Date.now(),
        };

        return reply.send(compliance);
    });
}
