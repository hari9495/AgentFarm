'use client';

import { useEffect, useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

type WeekPoint = { weekStart: string; taskCount: number; successCount: number; totalCostUsd: number };

type AgentCostEntry = {
    botId: string;
    botRole: string | null;
    taskCount: number;
    successCount: number;
    totalCostUsd: number;
    avgLatencyMs: number;
};

type PerfData = {
    taskCount: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    totalCostUsd: number;
    avgCostUsd: number | null;
    avgQualityScore: number | null;
    weeklyTrend: WeekPoint[];
};

type AgentCostData = {
    agents: AgentCostEntry[];
};

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MINS_PER_TASK = 30;
const DEFAULT_HOURLY_RATE = 50;

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtUsd = (v: number) =>
    v >= 1000
        ? `$${(v / 1000).toFixed(1)}k`
        : `$${v.toFixed(2)}`;

const fmtHours = (h: number) =>
    h >= 1 ? `${h.toFixed(1)} hrs` : `${Math.round(h * 60)} min`;

const pct = (v: number | null) =>
    v === null ? '—' : `${(v * 100).toFixed(1)}%`;

const delta = (current: number, prev: number): { text: string; up: boolean } | null => {
    if (prev === 0) return null;
    const d = ((current - prev) / prev) * 100;
    return { text: `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`, up: d >= 0 };
};

// Mini bar chart using CSS
function SparkBars({ points, valueKey }: { points: WeekPoint[]; valueKey: 'taskCount' | 'totalCostUsd' }) {
    if (points.length === 0) return <span style={{ color: 'var(--ink-muted)', fontSize: '0.78rem' }}>No data</span>;
    const values = points.map((p) => p[valueKey] as number);
    const max = Math.max(...values, 1);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
            {points.map((p, i) => {
                const h = Math.max(4, Math.round(((p[valueKey] as number) / max) * 48));
                const isLast = i === points.length - 1;
                return (
                    <div
                        key={p.weekStart}
                        title={`${p.weekStart}: ${valueKey === 'taskCount' ? p.taskCount + ' tasks' : fmtUsd(p.totalCostUsd)}`}
                        style={{
                            flex: 1, height: h,
                            background: isLast ? 'var(--accent)' : 'var(--info-bg)',
                            borderRadius: '2px 2px 0 0',
                            minWidth: 6,
                            transition: 'height 0.2s',
                        }}
                    />
                );
            })}
        </div>
    );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
    label, value, sub, deltaObj, accent,
}: {
    label: string;
    value: string;
    sub?: string;
    deltaObj?: { text: string; up: boolean } | null;
    accent?: string;
}) {
    return (
        <div className="card" style={{ padding: '1rem 1.15rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
                {label}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: accent ?? 'var(--ink)', lineHeight: 1.1 }}>
                {value}
            </div>
            {sub && <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginTop: '0.25rem' }}>{sub}</div>}
            {deltaObj && (
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', fontWeight: 600, color: deltaObj.up ? 'var(--ok)' : 'var(--danger)' }}>
                    {deltaObj.text} vs prev period
                </div>
            )}
        </div>
    );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function RoiPageClient() {
    const [perf, setPerf] = useState<PerfData | null>(null);
    const [prevPerf, setPrevPerf] = useState<PerfData | null>(null);
    const [agentCost, setAgentCost] = useState<AgentCostData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Assumption sliders
    const [minsPerTask, setMinsPerTask] = useState(DEFAULT_MINS_PER_TASK);
    const [hourlyRate, setHourlyRate] = useState(DEFAULT_HOURLY_RATE);

    // Date range: last 30 days
    const [days, setDays] = useState(30);

    const fetchData = useCallback(async (rangeDays: number) => {
        setLoading(true);
        setError(null);
        try {
            const now = new Date();
            const to = now.toISOString();
            const from = new Date(now.getTime() - rangeDays * 86_400_000).toISOString();
            const prevFrom = new Date(now.getTime() - rangeDays * 2 * 86_400_000).toISOString();
            const prevTo = from;

            const [perfRes, prevPerfRes, agentRes] = await Promise.all([
                fetch(`/api/analytics/agent-performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
                fetch(`/api/analytics/agent-performance?from=${encodeURIComponent(prevFrom)}&to=${encodeURIComponent(prevTo)}`),
                fetch(`/api/analytics/agent-cost?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
            ]);

            if (!perfRes.ok) {
                const body = await perfRes.json().catch(() => ({})) as { message?: string };
                setError(body.message ?? 'Failed to load analytics.');
                return;
            }

            const [perfData, prevData, agentData] = await Promise.all([
                perfRes.json() as Promise<PerfData>,
                prevPerfRes.ok ? prevPerfRes.json() as Promise<PerfData> : Promise.resolve(null),
                agentRes.ok ? agentRes.json() as Promise<AgentCostData> : Promise.resolve(null),
            ]);

            setPerf(perfData);
            setPrevPerf(prevData);
            setAgentCost(agentData);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void fetchData(days); }, [fetchData, days]);

    // ── Derived ROI metrics ────────────────────────────────────────────────

    const taskCount = perf?.taskCount ?? 0;
    const totalCostUsd = perf?.totalCostUsd ?? 0;
    const hoursSaved = (taskCount * minsPerTask) / 60;
    const valueCreated = hoursSaved * hourlyRate;
    const roiMultiple = totalCostUsd > 0 ? valueCreated / totalCostUsd : null;
    const netValue = valueCreated - totalCostUsd;

    const prevTaskCount = prevPerf?.taskCount ?? 0;
    const prevCost = prevPerf?.totalCostUsd ?? 0;
    const prevHours = (prevTaskCount * minsPerTask) / 60;
    const prevValue = prevHours * hourlyRate;

    // ── Top agents ─────────────────────────────────────────────────────────

    const topAgents = (agentCost?.agents ?? [])
        .filter((a) => a.taskCount > 0)
        .sort((a, b) => b.taskCount - a.taskCount)
        .slice(0, 5);

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>

            {/* Range picker */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-muted)' }}>Period:</span>
                {[7, 30, 60, 90].map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setDays(d)}
                        className={days === d ? 'primary-action' : 'chip-button'}
                        style={{ padding: '0.3rem 0.75rem' }}
                    >
                        {d}d
                    </button>
                ))}
                {loading && <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>Loading…</span>}
            </div>

            {error && (
                <p style={{ margin: 0, padding: '0.6rem 1rem', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '0.82rem' }}>
                    {error}
                </p>
            )}

            {/* ── KPI grid ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                <KpiCard
                    label="Tasks Automated"
                    value={taskCount.toLocaleString()}
                    sub={`${pct(perf?.successRate ?? null)} success rate`}
                    deltaObj={delta(taskCount, prevTaskCount)}
                    accent="#0052cc"
                />
                <KpiCard
                    label="Time Saved"
                    value={fmtHours(hoursSaved)}
                    sub={`@ ${minsPerTask} min / task`}
                    deltaObj={delta(hoursSaved, prevHours)}
                    accent="#0369a1"
                />
                <KpiCard
                    label="Value Created"
                    value={`$${Math.round(valueCreated).toLocaleString()}`}
                    sub={`@ $${hourlyRate}/hr labour rate`}
                    deltaObj={delta(valueCreated, prevValue)}
                    accent="#166534"
                />
                <KpiCard
                    label="AI Cost"
                    value={fmtUsd(totalCostUsd)}
                    sub={perf ? `avg ${fmtUsd((perf.avgCostUsd ?? 0))} / task` : ''}
                    deltaObj={delta(totalCostUsd, prevCost)}
                    accent="#b45309"
                />
                <KpiCard
                    label="Net Saving"
                    value={`$${Math.round(netValue).toLocaleString()}`}
                    sub="value created minus AI cost"
                    accent={netValue >= 0 ? 'var(--ok)' : 'var(--danger)'}
                />
                <KpiCard
                    label="ROI Multiple"
                    value={roiMultiple !== null ? `${roiMultiple.toFixed(1)}×` : '—'}
                    sub={roiMultiple !== null ? `${Math.round((roiMultiple - 1) * 100)}% return` : 'no cost yet'}
                    accent={roiMultiple !== null && roiMultiple >= 1 ? 'var(--ok)' : 'var(--ink-muted)'}
                />
            </div>

            {/* ── Assumptions panel ── */}
            <div className="card" style={{ padding: '1rem 1.15rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>
                    Adjust assumptions
                </h3>
                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-muted)' }}>
                        Minutes saved per task
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="range" min={5} max={240} step={5}
                                value={minsPerTask}
                                onChange={(e) => setMinsPerTask(Number(e.target.value))}
                                style={{ width: 140 }}
                            />
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)', minWidth: 40 }}>
                                {minsPerTask} min
                            </span>
                        </div>
                    </label>
                    <label style={{ display: 'grid', gap: '0.3rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink-muted)' }}>
                        Human hourly rate (USD)
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <input
                                type="range" min={10} max={300} step={5}
                                value={hourlyRate}
                                onChange={(e) => setHourlyRate(Number(e.target.value))}
                                style={{ width: 140 }}
                            />
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)', minWidth: 40 }}>
                                ${hourlyRate}/hr
                            </span>
                        </div>
                    </label>
                </div>
            </div>

            {/* ── Charts row ── */}
            {perf && perf.weeklyTrend.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="card" style={{ padding: '1rem 1.15rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                            Weekly task volume
                        </div>
                        <SparkBars points={perf.weeklyTrend} valueKey="taskCount" />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--ink-muted)', marginTop: '0.3rem' }}>
                            <span>{perf.weeklyTrend[0]?.weekStart?.slice(5)}</span>
                            <span>{perf.weeklyTrend.at(-1)?.weekStart?.slice(5)}</span>
                        </div>
                    </div>
                    <div className="card" style={{ padding: '1rem 1.15rem' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
                            Weekly AI cost (USD)
                        </div>
                        <SparkBars points={perf.weeklyTrend} valueKey="totalCostUsd" />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--ink-muted)', marginTop: '0.3rem' }}>
                            <span>{perf.weeklyTrend[0]?.weekStart?.slice(5)}</span>
                            <span>{perf.weeklyTrend.at(-1)?.weekStart?.slice(5)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Top agents ── */}
            {topAgents.length > 0 && (
                <div className="card" style={{ padding: '1rem 1.15rem' }}>
                    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)' }}>
                        Top agents by tasks automated
                    </h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {topAgents.map((a) => {
                            const agentHours = (a.taskCount * minsPerTask) / 60;
                            const agentValue = agentHours * hourlyRate;
                            const agentRoi = a.totalCostUsd > 0 ? agentValue / a.totalCostUsd : null;
                            const successRate = a.taskCount > 0 ? a.successCount / a.taskCount : 0;
                            return (
                                <div key={a.botId} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: 'var(--bg)', borderRadius: '0.4rem', flexWrap: 'wrap' }}>
                                    <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                                        {a.botRole ?? a.botId.slice(0, 10)}
                                    </span>
                                    <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem', color: 'var(--ink-soft)', flexWrap: 'wrap' }}>
                                        <span><strong>{a.taskCount}</strong> tasks</span>
                                        <span><strong>{pct(successRate)}</strong> success</span>
                                        <span><strong>{fmtHours(agentHours)}</strong> saved</span>
                                        <span><strong>{fmtUsd(a.totalCostUsd)}</strong> cost</span>
                                        {agentRoi !== null && (
                                            <span style={{ color: agentRoi >= 1 ? 'var(--ok)' : 'var(--warn)' }}>
                                                <strong>{agentRoi.toFixed(1)}×</strong> ROI
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Quality signal ── */}
            {perf?.avgQualityScore !== null && perf?.avgQualityScore !== undefined && (
                <div className="card" style={{ padding: '0.85rem 1.15rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg quality score</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink)' }}>
                            {(perf.avgQualityScore * 100).toFixed(0)}
                            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--ink-muted)' }}>/100</span>
                        </div>
                    </div>
                    <div style={{ flex: 1, height: 8, background: 'var(--line)', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(perf.avgQualityScore * 100).toFixed(0)}%`, background: perf.avgQualityScore >= 0.7 ? 'var(--ok)' : perf.avgQualityScore >= 0.5 ? 'var(--warn)' : 'var(--danger)', borderRadius: 9999, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', flexShrink: 0 }}>
                        Based on approval signals
                    </div>
                </div>
            )}

            {!loading && perf?.taskCount === 0 && (
                <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.6rem' }}>📊</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>No task data yet for this period</div>
                    <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                        Once agents start running tasks, your ROI will appear here.
                    </p>
                </div>
            )}
        </div>
    );
}
