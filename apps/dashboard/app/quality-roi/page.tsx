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
    avgCostUsd: number | null;
    weeklyTrend: WeeklyTrendEntry[];
};

const toDateValue = (d: Date): string => d.toISOString().slice(0, 10);

const defaultFrom = (): string => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toDateValue(d);
};

const defaultTo = (): string => toDateValue(new Date());

type RoiRow = {
    week: string;
    tasks: number;
    successes: number;
    cost: number;
    successRate: number;
    costPerSuccess: number | null;
    roiScore: number | null;
};

function roiColor(score: number | null): string {
    if (score === null) return 'var(--ink-muted)';
    if (score >= 10) return 'var(--ok)';
    if (score >= 3) return 'var(--warn)';
    return 'var(--danger)';
}

function roiLabel(score: number | null): string {
    if (score === null) return '—';
    if (score >= 10) return 'Excellent';
    if (score >= 3) return 'Good';
    return 'Needs attention';
}

function ScoreBar({ value, max }: { value: number | null; max: number }) {
    const pct = value === null || max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
    const color = roiColor(value);
    return (
        <div style={{ width: '100%', background: 'var(--bg)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
    );
}

export default function QualityRoiPage() {
    const [from, setFrom] = useState<string>(defaultFrom);
    const [to, setTo] = useState<string>(defaultTo);
    const [workspaceId, setWorkspaceId] = useState('');
    const [data, setData] = useState<AgentPerformanceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                if (!res.ok) { setError('Failed to load data.'); return; }
                setData((await res.json()) as AgentPerformanceData);
            })
            .catch(() => setError('Failed to load data.'))
            .finally(() => setIsLoading(false));
    }, [from, to, workspaceId]);

    const trend = data?.weeklyTrend ?? [];

    const rows: RoiRow[] = trend.map((w) => {
        const successRate = w.taskCount > 0 ? (w.successCount / w.taskCount) * 100 : 0;
        const costPerSuccess = w.successCount > 0 ? w.totalCostUsd / w.successCount : null;
        // ROI score = successes per dollar (higher = better). Scale by 100 for readability.
        const roiScore = w.totalCostUsd > 0 ? (w.successCount / w.totalCostUsd) : null;
        return { week: w.weekStart, tasks: w.taskCount, successes: w.successCount, cost: w.totalCostUsd, successRate, costPerSuccess, roiScore };
    });

    const maxRoi = rows.reduce((m, r) => (r.roiScore !== null && r.roiScore > m ? r.roiScore : m), 0.001);
    const totalSuccesses = rows.reduce((s, r) => s + r.successes, 0);
    const totalCost = rows.reduce((s, r) => s + r.cost, 0);
    const overallRoi = totalCost > 0 ? totalSuccesses / totalCost : null;
    const bestWeek = rows.reduce<RoiRow | null>((best, r) => {
        if (r.roiScore === null) return best;
        if (best === null || (best.roiScore !== null && r.roiScore > best.roiScore)) return r;
        return best;
    }, null);

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
                <div style={{ marginRight: 'auto' }}>
                    <div style={{ fontFamily: 'var(--font-plex-mono), monospace', textTransform: 'uppercase', letterSpacing: '0.16em', fontSize: 9, color: 'var(--accent)', lineHeight: 1 }}>Return on Investment</div>
                    <h1 style={{ fontFamily: 'var(--font-fraunces), Georgia, serif', fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', margin: '3px 0 0', lineHeight: 1, whiteSpace: 'nowrap' }}>
                        Weekly Quality ROI
                    </h1>
                </div>
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

            <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                {/* Summary scorecard */}
                {data && (
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {[
                            { label: 'Total Tasks', value: data.taskCount.toLocaleString(), sub: 'value delivered' },
                            { label: 'Total Successes', value: totalSuccesses.toLocaleString(), sub: 'completed successfully' },
                            { label: 'Total Cost', value: `$${totalCost.toFixed(2)}`, sub: 'period spend' },
                            {
                                label: 'Overall ROI Score',
                                value: overallRoi !== null ? overallRoi.toFixed(1) : '—',
                                sub: 'successes per $1 spent',
                                highlight: overallRoi !== null ? roiColor(overallRoi) : undefined,
                            },
                            {
                                label: 'Best Week',
                                value: bestWeek ? bestWeek.week.slice(5) : '—',
                                sub: bestWeek && bestWeek.roiScore !== null ? `ROI ${bestWeek.roiScore.toFixed(1)}` : 'no data',
                            },
                        ].map(({ label, value, sub, highlight }) => (
                            <div key={label} style={{
                                flex: '1 1 0', minWidth: 140, padding: '0.9rem 1rem',
                                border: `1px solid ${highlight ?? 'var(--line)'}`,
                                borderRadius: 8, background: 'var(--card)',
                            }}>
                                <p style={{ margin: '0 0 0.2rem', fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
                                <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: highlight ?? 'var(--ink)' }}>{value}</p>
                                <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: 'var(--ink-muted)' }}>{sub}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* ROI explanation */}
                <div style={{ padding: '0.75rem 1rem', background: 'var(--info-bg)', border: '1px solid var(--info-border)', borderRadius: 8, fontSize: '0.82rem', color: 'var(--info)' }}>
                    <strong>ROI Score</strong> = successful tasks ÷ total cost (USD). Higher is better.
                    A score ≥ 10 is <strong>Excellent</strong>, 3–10 is <strong>Good</strong>, below 3 needs attention.
                    <strong> Cost per success</strong> shows the inverse — dollars spent per delivered outcome.
                </div>

                {/* Weekly ROI table */}
                <section style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem 1.5rem', overflowX: 'auto' }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 1rem' }}>Weekly ROI Breakdown</h2>

                    {isLoading && <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Loading…</p>}
                    {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}

                    {!isLoading && !error && rows.length === 0 && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                            No data in this period. Try expanding the date range.
                        </p>
                    )}

                    {!isLoading && rows.length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)' }}>Week</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Tasks</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Successes</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Success Rate</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Cost</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>Cost / Success</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)' }}>ROI Score</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--ink)', minWidth: 100 }}>ROI Bar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.week} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.5rem 0.6rem', color: 'var(--ink)', fontFamily: 'monospace' }}>{r.week}</td>
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>{r.tasks.toLocaleString()}</td>
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--ok)' }}>{r.successes.toLocaleString()}</td>
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: r.successRate >= 80 ? 'var(--ok)' : r.successRate >= 50 ? 'var(--warn)' : 'var(--danger)', fontWeight: 600 }}>
                                            {r.successRate.toFixed(1)}%
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--ink-muted)' }}>${r.cost.toFixed(3)}</td>
                                        <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: 'var(--ink-muted)' }}>
                                            {r.costPerSuccess !== null ? `$${r.costPerSuccess.toFixed(4)}` : '—'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                color: roiColor(r.roiScore),
                                                display: 'block',
                                            }}>
                                                {r.roiScore !== null ? r.roiScore.toFixed(1) : '—'}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--ink-muted)' }}>{roiLabel(r.roiScore)}</span>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <ScoreBar value={r.roiScore} max={maxRoi} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </section>

                {/* ROI sparkline */}
                {!isLoading && rows.length > 1 && (
                    <section style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', margin: '0 0 0.75rem' }}>ROI Score Trend</h2>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: 100 }}>
                            {rows.map((r) => {
                                const barH = maxRoi > 0 && r.roiScore !== null
                                    ? Math.max(2, Math.round((r.roiScore / maxRoi) * 100))
                                    : 2;
                                return (
                                    <div key={r.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        {r.roiScore !== null && (
                                            <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)' }}>{r.roiScore.toFixed(0)}</span>
                                        )}
                                        <div
                                            style={{ width: '100%', height: barH, background: roiColor(r.roiScore), borderRadius: '3px 3px 0 0', transition: 'height 0.3s' }}
                                            title={`${r.week}: ROI ${r.roiScore?.toFixed(1) ?? '—'}`}
                                        />
                                        <span style={{ fontSize: '0.6rem', color: 'var(--ink-muted)' }}>{r.week.slice(5)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}
