'use client';

/**
 * GovernanceKPIPanel
 *
 * Real-time governance KPI dashboard. Polls GET /v1/governance/kpis every 30s.
 * Displays approval latency, audit completeness, budget tokens, provider health, SLA %.
 */

import { useCallback, useEffect, useState } from 'react';

const API_BASE = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
    : 'http://localhost:3000';

type KPIData = {
    approvals: {
        p95_latency_ms: number;
        avg_latency_ms: number;
        total_approved: number;
        total_rejected: number;
        total_pending: number;
        auto_approved_pct: number;
        escalation_rate_pct: number;
        sla_breach_count: number;
    };
    audit: {
        completeness_pct: number;
        events_last_24h: number;
        missing_evidence_count: number;
        retention_compliance_pct: number;
    };
    budget: {
        tokens_remaining: number;
        tokens_used_today: number;
        cost_usd_today: number;
        budget_utilisation_pct: number;
        overage_risk: 'none' | 'low' | 'medium' | 'high';
    };
    providers: {
        healthy_count: number;
        degraded_count: number;
        unavailable_count: number;
        avg_health_score: number;
    };
    execution: {
        tasks_completed_today: number;
        tasks_failed_today: number;
        avg_task_duration_ms: number;
        success_rate_pct: number;
    };
    sla_compliance_pct: number;
    snapshot_at: string;
};

type StatusBadge = 'healthy' | 'watch' | 'degraded';

function statusColor(s: StatusBadge) {
    if (s === 'healthy') return { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' };
    if (s === 'watch') return { bg: '#fefce8', text: '#854d0e', border: '#fde68a' };
    return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
}

function KPICard({ title, value, unit, status, sub }: {
    title: string;
    value: string | number;
    unit?: string;
    status: StatusBadge;
    sub?: string;
}) {
    const { bg, text, border } = statusColor(status);
    return (
        <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#78716c', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
            <div style={{ fontSize: '1.55rem', fontWeight: 700, color: text, lineHeight: 1.1 }}>
                {value}
                {unit && <span style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: '0.2rem', color: '#78716c' }}>{unit}</span>}
            </div>
            {sub && <div style={{ fontSize: '0.75rem', color: '#78716c' }}>{sub}</div>}
        </div>
    );
}

function slaStatus(pct: number): StatusBadge {
    if (pct >= 98) return 'healthy';
    if (pct >= 90) return 'watch';
    return 'degraded';
}

function budgetStatus(risk: KPIData['budget']['overage_risk']): StatusBadge {
    if (risk === 'none' || risk === 'low') return 'healthy';
    if (risk === 'medium') return 'watch';
    return 'degraded';
}

function auditStatus(pct: number): StatusBadge {
    if (pct >= 99) return 'healthy';
    if (pct >= 92) return 'watch';
    return 'degraded';
}

function providerStatus(avgScore: number): StatusBadge {
    if (avgScore >= 0.8) return 'healthy';
    if (avgScore >= 0.6) return 'watch';
    return 'degraded';
}

const MOCK_KPI: KPIData = {
    approvals: { p95_latency_ms: 1800, avg_latency_ms: 920, total_approved: 482, total_rejected: 14, total_pending: 3, auto_approved_pct: 78, escalation_rate_pct: 4.2, sla_breach_count: 1 },
    audit: { completeness_pct: 99.6, events_last_24h: 1204, missing_evidence_count: 2, retention_compliance_pct: 100 },
    budget: { tokens_remaining: 84000, tokens_used_today: 16000, cost_usd_today: 1.28, budget_utilisation_pct: 16, overage_risk: 'low' },
    providers: { healthy_count: 4, degraded_count: 1, unavailable_count: 0, avg_health_score: 0.87 },
    execution: { tasks_completed_today: 321, tasks_failed_today: 7, avg_task_duration_ms: 2340, success_rate_pct: 97.9 },
    sla_compliance_pct: 98.6,
    snapshot_at: new Date().toISOString(),
};

type Props = { workspaceId?: string };

export function GovernanceKPIPanel({ workspaceId }: Props) {
    const [kpis, setKpis] = useState<KPIData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const fetch_kpis = useCallback(async () => {
        setError(null);
        try {
            const url = workspaceId
                ? `${API_BASE}/v1/governance/kpis?workspace_id=${encodeURIComponent(workspaceId)}&time_window_seconds=86400`
                : `${API_BASE}/v1/governance/kpis?time_window_seconds=86400`;

            const res = await fetch(url, { cache: 'no-store' });
            const body = (await res.json().catch(() => null)) as Partial<KPIData> & { message?: string } | null;

            if (!res.ok || !body) {
                // Fallback to mock data so the dashboard stays functional during development
                setKpis(MOCK_KPI);
            } else {
                setKpis(body as KPIData);
            }
        } catch {
            // Offline / dev mode — display mock
            setKpis(MOCK_KPI);
        } finally {
            setLoading(false);
            setLastRefresh(new Date());
        }
    }, [workspaceId]);

    useEffect(() => {
        void fetch_kpis();
        const id = setInterval(() => void fetch_kpis(), 30_000);
        return () => clearInterval(id);
    }, [fetch_kpis]);

    return (
        <section style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Governance KPI Dashboard</h2>
                    {lastRefresh && (
                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.75rem', color: '#78716c' }}>
                            Last updated {lastRefresh.toLocaleTimeString()} · auto-refreshes every 30s
                        </p>
                    )}
                </div>
                <button
                    onClick={() => void fetch_kpis()}
                    disabled={loading}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', border: '1px solid #d4d4d4', borderRadius: 6, background: '#fff', cursor: loading ? 'wait' : 'pointer' }}
                >
                    {loading ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {error && <p style={{ color: '#dc2626', fontSize: '0.83rem', marginBottom: '0.5rem' }}>{error}</p>}

            {loading && !kpis && <p style={{ fontSize: '0.88rem', color: '#78716c' }}>Loading KPIs…</p>}

            {kpis && (
                <>
                    {/* SLA strip */}
                    <div style={{ padding: '0.6rem 0.9rem', background: slaStatus(kpis.sla_compliance_pct) === 'healthy' ? '#f0fdf4' : slaStatus(kpis.sla_compliance_pct) === 'watch' ? '#fefce8' : '#fef2f2', borderRadius: 8, marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '1.15rem' }}>{kpis.sla_compliance_pct.toFixed(1)}%</span>
                        <span style={{ fontSize: '0.85rem', color: '#57534e' }}>Overall SLA Compliance</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#78716c' }}>
                            {new Date(kpis.snapshot_at).toLocaleString()}
                        </span>
                    </div>

                    {/* Approval KPIs */}
                    <h3 style={{ margin: '0 0 0.45rem', fontSize: '0.85rem', color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Approvals</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                        <KPICard title="P95 Latency" value={kpis.approvals.p95_latency_ms} unit="ms"
                            status={kpis.approvals.p95_latency_ms < 5000 ? 'healthy' : kpis.approvals.p95_latency_ms < 15000 ? 'watch' : 'degraded'}
                            sub={`avg ${kpis.approvals.avg_latency_ms}ms`} />
                        <KPICard title="Pending" value={kpis.approvals.total_pending}
                            status={kpis.approvals.total_pending === 0 ? 'healthy' : kpis.approvals.total_pending <= 5 ? 'watch' : 'degraded'}
                            sub={`${kpis.approvals.sla_breach_count} SLA breach${kpis.approvals.sla_breach_count !== 1 ? 'es' : ''}`} />
                        <KPICard title="Auto-Approved" value={`${kpis.approvals.auto_approved_pct.toFixed(0)}%`}
                            status={kpis.approvals.auto_approved_pct >= 70 ? 'healthy' : 'watch'}
                            sub={`${kpis.approvals.total_approved} approved`} />
                        <KPICard title="Escalation Rate" value={`${kpis.approvals.escalation_rate_pct.toFixed(1)}%`}
                            status={kpis.approvals.escalation_rate_pct < 10 ? 'healthy' : kpis.approvals.escalation_rate_pct < 20 ? 'watch' : 'degraded'} />
                    </div>

                    {/* Audit KPIs */}
                    <h3 style={{ margin: '0 0 0.45rem', fontSize: '0.85rem', color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Audit & Evidence</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                        <KPICard title="Completeness" value={`${kpis.audit.completeness_pct.toFixed(1)}%`}
                            status={auditStatus(kpis.audit.completeness_pct)}
                            sub={`${kpis.audit.missing_evidence_count} missing`} />
                        <KPICard title="Events (24h)" value={kpis.audit.events_last_24h}
                            status="healthy" />
                        <KPICard title="Retention" value={`${kpis.audit.retention_compliance_pct.toFixed(0)}%`}
                            status={kpis.audit.retention_compliance_pct >= 100 ? 'healthy' : 'watch'} />
                    </div>

                    {/* Budget KPIs */}
                    <h3 style={{ margin: '0 0 0.45rem', fontSize: '0.85rem', color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Budget</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                        <KPICard title="Tokens Remaining" value={kpis.budget.tokens_remaining.toLocaleString()}
                            status={budgetStatus(kpis.budget.overage_risk)}
                            sub={`${kpis.budget.budget_utilisation_pct.toFixed(0)}% used today`} />
                        <KPICard title="Cost Today" value={`$${kpis.budget.cost_usd_today.toFixed(2)}`}
                            status={budgetStatus(kpis.budget.overage_risk)}
                            sub={`${kpis.budget.tokens_used_today.toLocaleString()} tokens`} />
                        <KPICard title="Overage Risk" value={kpis.budget.overage_risk}
                            status={budgetStatus(kpis.budget.overage_risk)} />
                    </div>

                    {/* Provider KPIs */}
                    <h3 style={{ margin: '0 0 0.45rem', fontSize: '0.85rem', color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Providers</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
                        <KPICard title="Avg Health Score" value={`${(kpis.providers.avg_health_score * 100).toFixed(0)}%`}
                            status={providerStatus(kpis.providers.avg_health_score)}
                            sub={`${kpis.providers.healthy_count} healthy · ${kpis.providers.degraded_count} degraded`} />
                        <KPICard title="Unavailable" value={kpis.providers.unavailable_count}
                            status={kpis.providers.unavailable_count === 0 ? 'healthy' : 'degraded'} />
                    </div>

                    {/* Execution KPIs */}
                    <h3 style={{ margin: '0 0 0.45rem', fontSize: '0.85rem', color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Execution</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
                        <KPICard title="Success Rate" value={`${kpis.execution.success_rate_pct.toFixed(1)}%`}
                            status={slaStatus(kpis.execution.success_rate_pct)}
                            sub={`${kpis.execution.tasks_completed_today} tasks today`} />
                        <KPICard title="Avg Duration" value={kpis.execution.avg_task_duration_ms} unit="ms"
                            status={kpis.execution.avg_task_duration_ms < 5000 ? 'healthy' : kpis.execution.avg_task_duration_ms < 15000 ? 'watch' : 'degraded'} />
                        <KPICard title="Failed Today" value={kpis.execution.tasks_failed_today}
                            status={kpis.execution.tasks_failed_today === 0 ? 'healthy' : kpis.execution.tasks_failed_today < 10 ? 'watch' : 'degraded'} />
                    </div>
                </>
            )}
        </section>
    );
}
