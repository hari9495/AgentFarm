'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, AlertTriangle, TrendingUp, RefreshCw, Bot } from 'lucide-react';

type SupportStats = {
    thisWeek: number;
    thisMonth: number;
    totalResolved: number;
    tierBreakdown: { 1: number; 2: number; 3: number; 4: number };
    tier1AutoFixRate: number;
};

const API_BASE = '';

const FALLBACK: SupportStats = {
    thisWeek: 0,
    thisMonth: 0,
    totalResolved: 0,
    tierBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0 },
    tier1AutoFixRate: 0,
};

function StatCard({ label, value, icon: Icon, accent, sub }: { label: string; value: string | number; icon: React.ElementType; accent: string; sub?: string }) {
    return (
        <div style={{ flex: '1 1 140px', minWidth: 0, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: accent + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={16} color={accent} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)', fontWeight: 500 }}>{label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--ink-soft)', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{sub}</div>}
        </div>
    );
}

function TierBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 52, fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, height: 8, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ width: 36, fontSize: 11, color: 'var(--ink-muted)', textAlign: 'right' as const, flexShrink: 0 }}>{count}</span>
            <span style={{ width: 32, fontSize: 10, color: 'var(--ink-muted)', textAlign: 'right' as const, flexShrink: 0 }}>{pct}%</span>
        </div>
    );
}

export default function SupportStatsPanel() {
    const [stats, setStats] = useState<SupportStats>(FALLBACK);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await fetch(`${API_BASE}/api/v1/support/stats`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setStats({ ...FALLBACK, ...data });
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const tierTotal = Object.values(stats.tierBreakdown).reduce((a, b) => a + b, 0);
    const autoFixPct = Math.round(stats.tier1AutoFixRate * 100);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--info-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <BarChart3 size={18} color="var(--accent)" />
                    </div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Support Agent Stats</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>Resolution metrics across all tiers</div>
                    </div>
                </div>
                <button type="button" onClick={load} disabled={loading} title="Refresh" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 12, color: 'var(--ink-muted)', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1 }}>
                    <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                    Refresh
                </button>
            </div>

            {error && (
                <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={14} />
                    Could not load support stats. The support agent may not be active.
                </div>
            )}

            {/* KPI cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <StatCard
                    label="Resolved this week"
                    value={loading ? '—' : stats.thisWeek}
                    icon={TrendingUp}
                    accent="#0066cc"
                />
                <StatCard
                    label="Resolved this month"
                    value={loading ? '—' : stats.thisMonth}
                    icon={CheckCircle2}
                    accent="#16a34a"
                />
                <StatCard
                    label="Total resolved"
                    value={loading ? '—' : stats.totalResolved}
                    icon={Bot}
                    accent="#7c3aed"
                    sub="all time"
                />
                <StatCard
                    label="Tier 1 auto-fix rate"
                    value={loading ? '—' : `${autoFixPct}%`}
                    icon={BarChart3}
                    accent="#d97706"
                    sub="no human needed"
                />
            </div>

            {/* Tier breakdown */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 14, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Resolution tier breakdown</div>
                {loading ? (
                    <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>Loading…</div>
                ) : tierTotal === 0 ? (
                    <div style={{ color: 'var(--ink-muted)', fontSize: 12 }}>No resolved issues yet.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <TierBar label="Tier 1" count={stats.tierBreakdown[1]} total={tierTotal} color="var(--accent)" />
                        <TierBar label="Tier 2" count={stats.tierBreakdown[2]} total={tierTotal} color="#7c3aed" />
                        <TierBar label="Tier 3" count={stats.tierBreakdown[3]} total={tierTotal} color="#d97706" />
                        <TierBar label="Tier 4" count={stats.tierBreakdown[4]} total={tierTotal} color="var(--danger)" />
                    </div>
                )}
                {!loading && tierTotal > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--ink-muted)' }}>
                        <CheckCircle2 size={12} color="#16a34a" />
                        <span>Tier 1 auto-fixes resolve <strong style={{ color: 'var(--ok)' }}>{autoFixPct}%</strong> of issues with no code changes or escalation required.</span>
                    </div>
                )}
            </div>
        </div>
    );
}
