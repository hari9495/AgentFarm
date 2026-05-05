/**
 * Governance KPI Types
 *
 * Metrics for SLA tracking, approval latency, audit completeness, and policy enforcement.
 */

export type KPICategory = 'approval' | 'audit' | 'budget' | 'provider' | 'execution';

export type KPIMetric = {
    metric_id: string;
    category: KPICategory;
    name: string;
    value: number;
    unit: string;
    timestamp: number;
    time_window_seconds?: number;
    percentile?: number;
};

export type ApprovalKPIs = {
    pending_count: number;
    decision_count: number;
    avg_decision_latency_ms: number;
    p95_decision_latency_ms: number;
    p99_decision_latency_ms: number;
    escalation_rate: number;
    rejection_rate: number;
};

export type AuditKPIs = {
    completeness_percent: number;
    risky_action_audit_rate: number;
    unaudited_actions_count: number;
    audit_coverage_by_risk: Record<'low' | 'medium' | 'high', number>;
};

export type BudgetKPIs = {
    tokens_consumed: number;
    tokens_remaining: number;
    hard_stop_block_rate: number;
    cost_per_action_average: number;
    cost_trend_percent_change: number;
};

export type ProviderKPIs = {
    provider_id: string;
    fallback_rate: number;
    error_rate: number;
    avg_latency_ms: number;
    health_score: number;
    requests_in_cooldown: number;
};

export type ExecutionKPIs = {
    success_rate: number;
    avg_execution_time_ms: number;
    p95_execution_time_ms: number;
    autonomy_rate: number;
    approval_rate: number;
};

export type GovernanceKPISnapshot = {
    timestamp: number;
    time_range_seconds: number;
    approval: ApprovalKPIs;
    audit: AuditKPIs;
    budget: BudgetKPIs;
    providers: ProviderKPIs[];
    execution: ExecutionKPIs;
    sla_compliance_percent: number;
};
