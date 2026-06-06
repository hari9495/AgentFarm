'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type WeeklyTrendEntry = {
    weekStart: string;
    taskCount: number;
    successCount: number;
    totalCostUsd: number;
};

type AgentPerformanceData = {
    taskCount: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    totalCostUsd: number;
    totalTokens: number;
    weeklyTrend: WeeklyTrendEntry[];
};

const toDateValue = (d: Date): string => d.toISOString().slice(0, 10);

const defaultFrom = (): string => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toDateValue(d);
};

const defaultTo = (): string => toDateValue(new Date());

function MetricBar({
    value,
    max,
    color,
    label,
}: {
    value: number;
    max: number;
    color: string;
    label: string;
}) {
    const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)', fontWeight: 600 }}>{label}</span>
            <div style={{ width: '100%', background: 'var(--line)', borderRadius: 4, height: 100, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                <div style={{ width: '100%', height: `${pct}%`, background: color, borderRadius: '3px 3px 0 0', transition: 'height 0.3s ease' }} />
            </div>
        </div>
    );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
    return (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            {items.map((item) => (
                <span key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--ink)' }}>
                    <span style={{ width: 10, height: 10, background: item.color, borderRadius: 2, display: 'inline-block' }} />
                    {item.label}
                </span>
            ))}
        </div>
    );
}

export default function HistoricalMetricsPage() {
    const [from, setFrom] = useState<string>(defaultFrom);
    const [to, setTo] = useState<string>(defaultTo);
    const [workspaceId, setWorkspaceId] = useState('');
    const [data, setData] = useState<AgentPerformanceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metric, setMetric] = useState<'tasks' | 'success' | 'cost'>('tasks');

    useEffect(() => {
        if (!from || !to) return;
        setIsLoading(true);
        setError(null);

        const fromIso = new Date(from).toISOString();
        const toIso = new Date(to).toISOString();
        const wsParam = workspaceId.trim() ? `&workspaceId=${encodeURIComponent(workspaceId.trim())}` : '';

        void fetch(
            `/api/analytics/agent-performance?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${wsParam}`,
            { cache: 'no-store' },
        )
            .then(async (res) => {
                if (!res.ok) { setError('Failed to load metrics.'); return; }
                setData((await res.json()) as AgentPerformanceData);
            })
            .catch(() => setError('Failed to load metrics.'))
            .finally(() => setIsLoading(false));
    }, [from, to, workspaceId]);

    const trend = data?.weeklyTrend ?? [];

    const maxTasks = trend.length > 0 ? Math.max(...trend.map((w) => w.taskCount), 1) : 1;
    const maxCost = trend.length > 0 ? Math.max(...trend.map((w) => w.totalCostUsd), 0.001) : 0.001;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <header style={{
                background: 'var(--card)',
                borderBottom: '1px solid var(--line)',
                padding: '0 1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                minHeight: 56,
            }}>
                <Link href="/" style={{ fontSize: '0.82rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                    ← Dashboard
                </Link>
                <h1 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', margin: 0, marginRight: 'auto' }}>
                    Historical Metrics
                </h1>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 500 }}>
                    From
                    <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 500 }}>
                    To
                    <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
                        style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem' }} />
                </label>
                <input
                    type="text"
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                    placeholder="Workspace ID (optional)"
                    style={{ border: '1px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem', width: 200 }}
                />
            </header>

            <main style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* KPI summary tiles */}
                {data && (
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Total Tasks', value: data.taskCount.toLocaleString() },
                            { label: 'Success Rate', value: data.successRate !== null ? `${(data.successRate * 100).toFixed(1)}%` : '—' },
                            { label: 'Total Cost', value: `$${data.totalCostUsd.toFixed(2)}` },
                            { label: 'Total Tokens', value: `${(data.totalTokens / 1000).toFixed(1)}k` },
                            { label: 'Avg Latency', value: data.avgLatencyMs !== null ? `${data.avgLatencyMs.toLocaleString()}ms` : '—' },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ flex: '1 1 0', minWidth: 130, padding: '0.9rem 1rem', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)' }}>
                                <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                                <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--ink)' }}>{value}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Time-series chart */}
                <section style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Weekly Time-Series</h2>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            {(['tasks', 'success', 'cost'] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMetric(m)}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                                        border: `1px solid ${metric === m ? 'var(--accent)' : 'var(--line)'}`,
                                        background: metric === m ? 'var(--accent)' : 'var(--card)',
                                        color: metric === m ? 'var(--card)' : 'var(--ink)',
                                        fontSize: '0.78rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {m === 'tasks' ? 'Task Volume' : m === 'success' ? 'Success Rate' : 'Cost'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {isLoading && <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Loading…</p>}
                    {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}

                    {!isLoading && !error && trend.length === 0 && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                            No data in this period. Try expanding the date range.
                        </p>
                    )}

                    {!isLoading && trend.length > 0 && metric === 'tasks' && (
                        <>
                            <Legend items={[{ color: 'var(--accent)', label: 'Tasks' }, { color: 'var(--ok)', label: 'Successes' }]} />
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 120, marginTop: '0.5rem' }}>
                                {trend.map((w) => {
                                    const taskH = Math.max(2, Math.round((w.taskCount / maxTasks) * 120));
                                    const successH = w.taskCount > 0 ? Math.max(2, Math.round((w.successCount / maxTasks) * 120)) : 0;
                                    return (
                                        <div key={w.weekStart} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
                                                <div style={{ width: 14, height: taskH, background: 'var(--accent)', borderRadius: '3px 3px 0 0' }} title={`${w.weekStart}: ${w.taskCount} tasks`} />
                                                <div style={{ width: 14, height: successH, background: 'var(--ok)', borderRadius: '3px 3px 0 0' }} title={`${w.weekStart}: ${w.successCount} successes`} />
                                            </div>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)' }}>{w.weekStart.slice(5)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {!isLoading && trend.length > 0 && metric === 'success' && (
                        <>
                            <Legend items={[{ color: 'var(--ok)', label: 'Success rate %' }]} />
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 120, marginTop: '0.5rem' }}>
                                {trend.map((w) => {
                                    const rate = w.taskCount > 0 ? (w.successCount / w.taskCount) * 100 : 0;
                                    const barH = Math.max(2, Math.round((rate / 100) * 120));
                                    const color = rate >= 80 ? 'var(--ok)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)';
                                    return (
                                        <div key={w.weekStart} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)' }}>{rate.toFixed(0)}%</span>
                                            <div style={{ width: '100%', height: barH, background: color, borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} title={`${w.weekStart}: ${rate.toFixed(1)}%`} />
                                            <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)' }}>{w.weekStart.slice(5)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {!isLoading && trend.length > 0 && metric === 'cost' && (
                        <>
                            <Legend items={[{ color: 'var(--warn)', label: 'Cost USD' }]} />
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 120, marginTop: '0.5rem' }}>
                                {trend.map((w) => {
                                    const barH = Math.max(2, Math.round((w.totalCostUsd / maxCost) * 120));
                                    return (
                                        <div key={w.weekStart} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                            <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)' }}>${w.totalCostUsd.toFixed(2)}</span>
                                            <div style={{ width: '100%', height: barH, background: 'var(--warn)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }} title={`${w.weekStart}: $${w.totalCostUsd.toFixed(3)}`} />
                                            <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)' }}>{w.weekStart.slice(5)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </section>

                {/* Data table */}
                {!isLoading && trend.length > 0 && (
                    <section style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem 1.5rem', overflowX: 'auto' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 1rem' }}>Weekly Breakdown</h2>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)' }}>Week</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Tasks</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Successes</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Success Rate</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Total Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trend.map((w) => {
                                    const rate = w.taskCount > 0 ? (w.successCount / w.taskCount) * 100 : 0;
                                    const rateColor = rate >= 80 ? 'var(--ok)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)';
                                    return (
                                        <tr key={w.weekStart} style={{ borderBottom: '1px solid var(--line)' }}>
                                            <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink)', fontFamily: 'monospace' }}>{w.weekStart}</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>{w.taskCount.toLocaleString()}</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--ok)' }}>{w.successCount.toLocaleString()}</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: rateColor, fontWeight: 600 }}>{rate.toFixed(1)}%</td>
                                            <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--ink-muted)' }}>${w.totalCostUsd.toFixed(3)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </section>
                )}
            </main>
        </div>
    );
}
