'use client';

import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle } from 'lucide-react';

type DailyPoint = {
    date: string;
    costUsd: number;
    taskCount: number;
    isProjected: boolean;
};

type ForecastData = {
    month: string;
    today: string;
    daysInMonth: number;
    daysElapsed: number;
    daysRemaining: number;
    actualCostUsd: number;
    projectedMonthTotal: number;
    dailyRate: number;
    lastMonthCostUsd: number;
    percentChangeVsLastMonth: number | null;
    dailyData: DailyPoint[];
};

function fmt(usd: number): string {
    if (usd >= 1000) return `$${(usd / 1000).toFixed(2)}k`;
    if (usd >= 1)    return `$${usd.toFixed(2)}`;
    return `$${(usd * 100).toFixed(2)}¢`;
}

// Simple SVG bar chart — actual bars solid, projected bars hatched
function ForecastChart({ data, today }: { data: DailyPoint[]; today: string }) {
    const maxCost = Math.max(...data.map(d => d.costUsd), 0.0001);
    const barW = Math.max(3, Math.floor(560 / data.length) - 2);
    const chartH = 80;
    const totalW = data.length * (barW + 2);

    return (
        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <svg width={totalW} height={chartH + 24} style={{ display: 'block' }}>
                <defs>
                    <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="4" stroke="#94a3b8" strokeWidth="1.5" />
                    </pattern>
                </defs>
                {data.map((d, i) => {
                    const h = Math.max(2, (d.costUsd / maxCost) * chartH);
                    const x = i * (barW + 2);
                    const y = chartH - h;
                    const isToday = d.date === today;
                    const fill = d.isProjected ? 'url(#hatch)' : isToday ? 'var(--info)' : 'var(--info)';
                    return (
                        <g key={d.date}>
                            <rect x={x} y={y} width={barW} height={h} rx={2} fill={fill} opacity={d.isProjected ? 0.55 : 0.85} />
                            {isToday && (
                                <line x1={x + barW / 2} y1={0} x2={x + barW / 2} y2={chartH} stroke="#d6301f" strokeWidth={1} strokeDasharray="3 2" opacity={0.4} />
                            )}
                        </g>
                    );
                })}
                {/* X axis */}
                <line x1={0} y1={chartH} x2={totalW} y2={chartH} stroke="#e2e8f0" strokeWidth={1} />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--ink-muted)', marginTop: 4, paddingRight: 2 }}>
                <span>{data[0]?.date.slice(8)}</span>
                <span style={{ color: 'var(--info)', fontWeight: 700 }}>today</span>
                <span>{data[data.length - 1]?.date.slice(8)}</span>
            </div>
        </div>
    );
}

export default function CostForecastPanel({ tenantId }: { tenantId: string }) {
    const [data, setData]         = useState<ForecastData | null>(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true); else setRefreshing(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/analytics/cost-forecast?tenantId=${encodeURIComponent(tenantId)}`,
                { cache: 'no-store' },
            );
            const json = (await res.json()) as ForecastData & { error?: string };
            if (!res.ok) { setError(json.error ?? 'Failed to load forecast'); return; }
            setData(json);
        } catch { setError('Network error loading forecast.'); }
        finally { setLoading(false); setRefreshing(false); }
    }, [tenantId]);

    useEffect(() => { void load(); }, [load]);

    const pct = data?.percentChangeVsLastMonth;
    const TrendIcon = pct == null ? Minus : pct > 0 ? TrendingUp : TrendingDown;
    const trendColor = pct == null ? 'var(--ink-muted)' : pct > 10 ? 'var(--danger)' : pct > 0 ? 'var(--warn)' : 'var(--ok)';
    const pctLabel = pct == null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs last month`;

    return (
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '20px 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 2 }}>Cost Forecast</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                        Projected end-of-month spend based on current pace
                        {data && ` · ${data.daysElapsed} of ${data.daysInMonth} days elapsed`}
                    </div>
                </div>
                <button onClick={() => void load(true)} disabled={refreshing}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 11, cursor: 'pointer' }}>
                    <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid rgba(196,22,28,0.18)', color: 'var(--danger)', fontSize: 12, marginBottom: 16 }}>
                    <AlertCircle size={13} /> {error}
                </div>
            )}

            {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                        {[1,2,3].map(i => <div key={i} style={{ flex: 1, height: 68, borderRadius: 10, background: 'var(--bg-deep)' }} />)}
                    </div>
                    <div style={{ height: 104, borderRadius: 10, background: 'var(--bg-deep)' }} />
                </div>
            )}

            {!loading && data && (
                <>
                    {/* KPI cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                        {/* Projected total */}
                        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-deep)', border: '1px solid var(--line)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Projected total</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{fmt(data.projectedMonthTotal)}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                <TrendIcon size={12} color={trendColor} />
                                <span style={{ fontSize: 11, color: trendColor, fontWeight: 600 }}>{pctLabel}</span>
                            </div>
                        </div>

                        {/* Spent so far */}
                        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-deep)', border: '1px solid var(--line)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Spent so far</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{fmt(data.actualCostUsd)}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                                {Math.round((data.actualCostUsd / Math.max(data.projectedMonthTotal, 0.0001)) * 100)}% of projected
                            </div>
                        </div>

                        {/* Daily run rate */}
                        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-deep)', border: '1px solid var(--line)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Daily run rate</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{fmt(data.dailyRate)}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>
                                {data.daysRemaining} day{data.daysRemaining !== 1 ? 's' : ''} remaining
                            </div>
                        </div>

                        {/* Last month */}
                        <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--bg-deep)', border: '1px solid var(--line)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Last month</div>
                            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{fmt(data.lastMonthCostUsd)}</div>
                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 4 }}>actual</div>
                        </div>
                    </div>

                    {/* Bar chart */}
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 8, display: 'flex', gap: 16 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--info)', display: 'inline-block' }} /> Actual
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'repeating-linear-gradient(45deg, #94a3b8, #94a3b8 1px, transparent 1px, transparent 4px)', display: 'inline-block' }} /> Projected
                            </span>
                        </div>
                        <ForecastChart data={data.dailyData} today={data.today} />
                    </div>
                </>
            )}
        </div>
    );
}
