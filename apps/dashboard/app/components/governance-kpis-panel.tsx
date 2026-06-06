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
    if (s === 'healthy') return { bg: 'var(--ok-bg)', text: 'var(--ok)', border: '#bbf7d0' };
    if (s === 'watch') return { bg: '#fefce8', text: '#854d0e', border: 'var(--warn)' };
    return { bg: 'var(--danger-bg)', text: 'var(--danger)', border: '#fecaca' };
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
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
            <div style={{ fontSize: '1.55rem', fontWeight: 700, color: text, lineHeight: 1.1 }}>
                {value}
                {unit && <span style={{ fontSize: '0.85rem', fontWeight: 400, marginLeft: '0.2rem', color: 'var(--ink-muted)' }}>{unit}</span>}
            </div>
            {sub && <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{sub}</div>}
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

const LABELS: Record<string, Record<string, string>> = {
    en: { approvals: 'Approvals', executions: 'Executions', budget: 'Budget', sla: 'SLA Compliance' },
    ja: { approvals: '承認', executions: '実行', budget: '予算', sla: 'SLA準拠' },
    ar: { approvals: 'موافقات', executions: 'تنفيذات', budget: 'ميزانية', sla: 'امتثال SLA' },
    ko: { approvals: '승인', executions: '실행', budget: '예산', sla: 'SLA 준수' },
};

function getLabel(lang: string, key: keyof typeof LABELS['en']): string {
    return LABELS[lang]?.[key] ?? LABELS['en'][key];
}

// ── Safe accessors — guard against undefined from real API ────────────────────
function n(v: number | undefined | null, fallback = 0): number { return v ?? fallback; }
function pct(v: number | undefined | null): string { return `${n(v).toFixed(1)}%`; }
function ms(v: number | undefined | null): string {
    const m = n(v);
    if (m === 0) return '—';
    return m >= 1000 ? `${(m / 1000).toFixed(1)}s` : `${m}ms`;
}
function safeDate(iso: string | undefined | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ── Mini progress bar ──────────────────────────────────────────────────────────
function Bar({ value, max = 100, color }: { value: number; max?: number; color: string }) {
    const w = Math.min(100, max > 0 ? (value / max) * 100 : 0);
    return (
        <div style={{ height: 4, borderRadius: 9999, background: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginTop: 6 }}>
            <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 9999, transition: 'width 0.6s ease' }} />
        </div>
    );
}

// ── Metric row ─────────────────────────────────────────────────────────────────
function Metric({ label, value, sub, bar, barColor, why }: {
    label: string; value: string; sub?: string;
    bar?: { value: number; max?: number }; barColor?: string;
    why?: string;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{label}</span>
                {why && <span style={{ fontSize: 10, color: 'var(--line)', flexShrink: 0 }}>{why}</span>}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.4 }}>{sub}</div>}
            {bar && <Bar value={bar.value} max={bar.max} color={barColor ?? 'var(--accent)'} />}
        </div>
    );
}

// ── Section card ───────────────────────────────────────────────────────────────
function Section({ title, accent, children, span2 }: {
    title: string; accent: string;
    children: React.ReactNode; span2?: boolean;
}) {
    return (
        <div style={{
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
            overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            gridColumn: span2 ? 'span 2' : undefined,
        }}>
            {/* Accent top bar */}
            <div style={{ height: 3, background: accent }} />
            <div style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>{title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '16px 24px' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ ok }: { ok: boolean }) {
    return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: ok ? 'var(--ok)' : 'var(--danger)', marginRight: 5, verticalAlign: 'middle' }} />;
}

type Props = { workspaceId?: string; language?: string };

export function GovernanceKPIPanel({ workspaceId, language = 'en' }: Props) {
    const [kpis, setKpis] = useState<KPIData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMock, setIsMock] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const fetch_kpis = useCallback(async () => {
        try {
            const langParam = language ? `&language=${encodeURIComponent(language)}` : '';
            const url = workspaceId
                ? `/api/governance/kpis?workspace_id=${encodeURIComponent(workspaceId)}&time_window_seconds=86400${langParam}`
                : `/api/governance/kpis?time_window_seconds=86400${langParam}`;

            const res = await fetch(url, { cache: 'no-store' });
            const body = (await res.json().catch(() => null)) as Partial<KPIData> | null;

            if (!res.ok || !body) {
                setKpis(MOCK_KPI); setIsMock(true);
            } else {
                setKpis(body as KPIData); setIsMock(false);
            }
        } catch {
            setKpis(MOCK_KPI); setIsMock(true);
        } finally {
            setLoading(false);
            setLastRefresh(new Date());
        }
    }, [workspaceId, language]);

    useEffect(() => {
        void fetch_kpis();
        const id = setInterval(() => void fetch_kpis(), 30_000);
        return () => clearInterval(id);
    }, [fetch_kpis]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: 120, borderRadius: 16, background: 'var(--bg)' }} />)}
            </div>
        );
    }

    if (!kpis) return null;

    const sla = n(kpis.sla_compliance_pct);
    const slaColor = sla >= 98 ? '#1a7a4a' : sla >= 90 ? 'var(--warn)' : 'var(--danger)';
    const approvalRate = kpis.approvals
        ? n(kpis.approvals.total_approved) + n(kpis.approvals.total_rejected) > 0
            ? (n(kpis.approvals.total_approved) / (n(kpis.approvals.total_approved) + n(kpis.approvals.total_rejected))) * 100
            : 0
        : 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* ── Top meta bar ────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {lastRefresh && (
                        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                            Snapshot at {safeDate(kpis.snapshot_at)} · refreshes every 30s
                        </span>
                    )}
                    {isMock && (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'color-mix(in srgb, var(--warn) 8%, transparent)', border: '1px solid rgba(180,83,9,0.22)', color: 'var(--warn)' }}>
                            Demo data
                        </span>
                    )}
                </div>
                <button onClick={() => void fetch_kpis()} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                    ↻ Refresh
                </button>
            </div>

            {/* ── Hero SLA ─────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                {/* SLA number */}
                <div style={{ background: 'var(--card)', border: `2px solid ${slaColor}33`, borderRadius: 18, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, boxShadow: `0 0 0 4px ${slaColor}0a` }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 800, color: slaColor, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Overall SLA Compliance</div>
                        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: '-0.04em', color: slaColor, lineHeight: 1 }}>{sla.toFixed(1)}<span style={{ fontSize: 24 }}>%</span></div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
                            <StatusDot ok={sla >= 98} />
                            {sla >= 98 ? 'On target' : sla >= 90 ? 'Watch — below 98% threshold' : 'Breached — below 90% threshold'}
                        </div>
                        <Bar value={sla} color={slaColor} />
                    </div>
                </div>

                {/* Approval throughput */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Approvals Today</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                        <Metric label="Approved" value={n(kpis.approvals?.total_approved).toLocaleString()} sub="decisions made" />
                        <Metric label="Pending" value={n(kpis.approvals?.total_pending).toLocaleString()}
                            sub={`${n(kpis.approvals?.sla_breach_count)} SLA breach${n(kpis.approvals?.sla_breach_count) !== 1 ? 'es' : ''}`} />
                        <Metric label="Approval rate" value={`${approvalRate.toFixed(0)}%`}
                            bar={{ value: approvalRate }} barColor="#1a7a4a" />
                        <Metric label="Auto-approved" value={`${n(kpis.approvals?.auto_approved_pct).toFixed(0)}%`}
                            bar={{ value: n(kpis.approvals?.auto_approved_pct) }} barColor="#0066cc" />
                    </div>
                </div>
            </div>

            {/* ── KPI grid ─────────────────────────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                {/* Approvals detail */}
                <Section title="Approval Performance" accent="#0066cc">
                    <Metric label="P95 Latency" value={ms(kpis.approvals?.p95_latency_ms)}
                        sub={`avg ${ms(kpis.approvals?.avg_latency_ms)}`}
                        why="agent wait time" />
                    <Metric label="Escalation rate" value={`${n(kpis.approvals?.escalation_rate_pct).toFixed(1)}%`}
                        sub={n(kpis.approvals?.escalation_rate_pct) < 10 ? 'Within normal range' : 'Review escalation triggers'}
                        bar={{ value: n(kpis.approvals?.escalation_rate_pct), max: 30 }} barColor="#b45309"
                        why="re-reviews needed" />
                    <Metric label="Rejected" value={n(kpis.approvals?.total_rejected).toLocaleString()}
                        sub="denied decisions" />
                    <Metric label="SLA breaches" value={n(kpis.approvals?.sla_breach_count).toLocaleString()}
                        sub={n(kpis.approvals?.sla_breach_count) === 0 ? 'All within SLA' : 'Review late decisions'} />
                </Section>

                {/* Execution */}
                <Section title="Task Execution" accent="#1a7a4a">
                    <Metric label="Success rate" value={pct(kpis.execution?.success_rate_pct)}
                        sub={`${n(kpis.execution?.tasks_completed_today).toLocaleString()} tasks today`}
                        bar={{ value: n(kpis.execution?.success_rate_pct) }} barColor="#1a7a4a"
                        why="quality signal" />
                    <Metric label="Failed today" value={n(kpis.execution?.tasks_failed_today).toLocaleString()}
                        sub={n(kpis.execution?.tasks_failed_today) === 0 ? 'No failures' : 'Check retry queue'}
                        why="needs investigation" />
                    <Metric label="Avg duration" value={ms(kpis.execution?.avg_task_duration_ms)}
                        sub="per task" why="performance baseline" />
                </Section>

                {/* Audit */}
                <Section title="Audit & Evidence" accent="#7c2d92">
                    <Metric label="Completeness" value={pct(kpis.audit?.completeness_pct)}
                        sub={`${n(kpis.audit?.missing_evidence_count)} missing`}
                        bar={{ value: n(kpis.audit?.completeness_pct) }} barColor="#7c2d92"
                        why="compliance coverage" />
                    <Metric label="Events (24h)" value={n(kpis.audit?.events_last_24h).toLocaleString()}
                        sub="audit trail entries" why="activity volume" />
                    <Metric label="Retention" value={`${n(kpis.audit?.retention_compliance_pct).toFixed(0)}%`}
                        sub="of policies met"
                        bar={{ value: n(kpis.audit?.retention_compliance_pct) }} barColor="#7c2d92" />
                </Section>

                {/* Budget */}
                <Section title="Budget & Cost" accent="#b45309">
                    <Metric label="Tokens remaining" value={n(kpis.budget?.tokens_remaining).toLocaleString()}
                        sub={`${n(kpis.budget?.budget_utilisation_pct).toFixed(0)}% of budget used`}
                        bar={{ value: n(kpis.budget?.budget_utilisation_pct) }} barColor="#b45309"
                        why="cost control" />
                    <Metric label="Cost today" value={`$${n(kpis.budget?.cost_usd_today).toFixed(2)}`}
                        sub={`${n(kpis.budget?.tokens_used_today).toLocaleString()} tokens`}
                        why="billing period" />
                    <Metric label="Overage risk" value={kpis.budget?.overage_risk ?? 'none'}
                        sub={kpis.budget?.overage_risk === 'none' || kpis.budget?.overage_risk === 'low' ? 'Within limits' : 'Review budget policy'} />
                </Section>

                {/* Providers */}
                <Section title="LLM Providers" accent="#c4161c" span2>
                    <Metric label="Avg health score" value={`${(n(kpis.providers?.avg_health_score) * 100).toFixed(0)}%`}
                        bar={{ value: n(kpis.providers?.avg_health_score) * 100 }} barColor="#1a7a4a"
                        why="API availability" />
                    <Metric label="Healthy" value={n(kpis.providers?.healthy_count).toLocaleString()}
                        sub="providers online" />
                    <Metric label="Degraded" value={n(kpis.providers?.degraded_count).toLocaleString()}
                        sub={n(kpis.providers?.degraded_count) === 0 ? 'None degraded' : 'Fallback in use'} />
                    <Metric label="Unavailable" value={n(kpis.providers?.unavailable_count).toLocaleString()}
                        sub={n(kpis.providers?.unavailable_count) === 0 ? 'All reachable' : 'Check connectors'} />
                </Section>
            </div>
        </div>
    );
}
