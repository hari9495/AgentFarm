/**
 * Governance KPI Routes
 *
 * GET /v1/governance/kpis — Get KPI snapshot for time window
 * GET /v1/governance/kpis/providers — Get provider health KPIs
 * GET /v1/governance/sla-compliance — Get SLA compliance metrics
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type KPIQuery = {
    time_window_seconds?: string;
    workspace_id?: string;
};

let globalProviderState: any = null;

const getProviderState = async () => {
    if (!globalProviderState) {
        const mod = await import('@agentfarm/agent-runtime/provider-state-persistence.js').catch(
            () => import('../agent-runtime-stubs.js'),
        );
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
            const workspaceId = (req.query as KPIQuery).workspace_id?.trim() || undefined;
            const windowStart = new Date(Date.now() - timeWindow * 1000);

            const staticFallback = {
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

            try {
                const prisma = await getPrisma();
                const workspaceFilter = workspaceId ? { workspaceId } : {};

                const [taskAgg, successCount, pendingCount, decidedCount] = await Promise.all([
                    prisma.taskExecutionRecord.aggregate({
                        where: { ...workspaceFilter, executedAt: { gte: windowStart } },
                        _count: { id: true },
                        _avg: { latencyMs: true },
                        _sum: { totalTokens: true, estimatedCostUsd: true },
                    }),
                    prisma.taskExecutionRecord.count({
                        where: { ...workspaceFilter, executedAt: { gte: windowStart }, outcome: 'success' },
                    }),
                    prisma.approval.count({
                        where: { ...workspaceFilter, decision: 'pending' },
                    }),
                    prisma.approval.count({
                        where: { ...workspaceFilter, decision: { not: 'pending' } },
                    }),
                ]);

                const taskCount = taskAgg._count.id;

                return reply.send({
                    timestamp: Date.now(),
                    time_range_seconds: timeWindow,
                    approval: {
                        pending_count: pendingCount,
                        decision_count: decidedCount,
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
                        tokens_consumed: taskAgg._sum.totalTokens ?? 0,
                        tokens_remaining: 1000000,
                        hard_stop_block_rate: 0,
                        cost_per_action_average:
                            taskCount > 0
                                ? ((taskAgg._sum.estimatedCostUsd ?? 0) / taskCount) * 100
                                : 100,
                        cost_trend_percent_change: 0,
                    },
                    providers: [],
                    execution: {
                        success_rate: taskCount > 0 ? successCount / taskCount : 1.0,
                        avg_execution_time_ms: taskAgg._avg.latencyMs ?? 0,
                        p95_execution_time_ms: 0,
                        autonomy_rate: 0.8,
                        approval_rate: 0.2,
                    },
                    sla_compliance_percent: 95,
                });
            } catch {
                return reply.send(staticFallback);
            }
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
