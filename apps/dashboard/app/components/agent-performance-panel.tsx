'use client';

import { useEffect, useState } from 'react';

type ByProviderEntry = {
    taskCount: number;
    totalCostUsd: number;
    avgLatencyMs: number;
};

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
    avgCostUsd: number | null;
    totalTokens: number;
    avgQualityScore: number | null;
    byProvider: Record<string, ByProviderEntry>;
    weeklyTrend: WeeklyTrendEntry[];
    from: string;
    to: string;
};

const DAYS_OPTIONS = [30, 60, 90] as const;
type DaysOption = (typeof DAYS_OPTIONS)[number];

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            flex: '1 1 0',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 16,
            background: '#fff',
            minWidth: 0,
        }}>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '0.4rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
            </p>
            <p style={{ fontSize: '1.4rem', fontWeight: 700, color: '#111827', margin: 0 }}>{value}</p>
        </div>
    );
}

function SkeletonBox({ width, height }: { width: string | number; height: number }) {
    return (
        <div style={{
            width,
            height,
            background: '#f3f4f6',
            borderRadius: 6,
            animation: 'pulse 1.5s ease-in-out infinite',
        }} />
    );
}

export default function AgentPerformancePanel() {
    const [days, setDays] = useState<DaysOption>(30);
    const [data, setData] = useState<AgentPerformanceData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        const to = new Date().toISOString();
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        void fetch(
            `/api/analytics/agent-performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
            { cache: 'no-store' },
        )
            .then(async (res) => {
                if (!res.ok) {
                    setError('Failed to load agent performance data.');
                    return;
                }
                const body = await res.json() as AgentPerformanceData;
                setData(body);
            })
            .catch(() => {
                setError('Failed to load agent performance data.');
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [days]);

    const providers = data ? Object.entries(data.byProvider) : [];
    const trend = data?.weeklyTrend ?? [];
    const maxTrendCount = trend.length > 0 ? Math.max(...trend.map((w) => w.taskCount), 1) : 1;

    return (
        <section style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '1.25rem 1.5rem', marginTop: '1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>Agent Performance</h2>
                <div style={{ display: 'flex', gap: 4 }}>
                    {DAYS_OPTIONS.map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            style={{
                                padding: '3px 10px',
                                borderRadius: 6,
                                border: '1px solid #e5e7eb',
                                background: days === d ? '#6366f1' : '#f9fafb',
                                color: days === d ? '#fff' : '#374151',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            {d}d
                        </button>
                    ))}
                </div>
            </div>

            {/* Error */}
            {error && (
                <p style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>
            )}

            {/* Loading skeleton */}
            {isLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <SkeletonBox width="25%" height={72} />
                        <SkeletonBox width="25%" height={72} />
                        <SkeletonBox width="25%" height={72} />
                        <SkeletonBox width="25%" height={72} />
                    </div>
                    <SkeletonBox width="100%" height={100} />
                    <SkeletonBox width="100%" height={80} />
                </div>
            )}

            {/* Empty state */}
            {!isLoading && data && data.taskCount === 0 && (
                <p style={{ color: '#6b7280', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                    No tasks in this period.
                </p>
            )}

            {/* Content */}
            {!isLoading && data && data.taskCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Metric cards */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <MetricCard label="Tasks" value={data.taskCount.toLocaleString()} />
                        <MetricCard
                            label="Success Rate"
                            value={data.successRate !== null ? `${(data.successRate * 100).toFixed(1)}%` : '—'}
                        />
                        <MetricCard
                            label="Avg Cost"
                            value={data.avgCostUsd !== null ? `$${data.avgCostUsd.toFixed(3)}` : '—'}
                        />
                        <MetricCard
                            label="Avg Latency"
                            value={data.avgLatencyMs !== null ? `${data.avgLatencyMs.toLocaleString()}ms` : '—'}
                        />
                    </div>

                    {/* Weekly trend chart */}
                    {trend.length > 0 && (
                        <div>
                            <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                                Weekly Trend
                            </p>
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                                {trend.map((w) => {
                                    const barHeight = Math.max(2, Math.round((w.taskCount / maxTrendCount) * 80));
                                    return (
                                        <div key={w.weekStart} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                            <div
                                                style={{
                                                    width: 24,
                                                    height: barHeight,
                                                    background: '#6366f1',
                                                    borderRadius: '3px 3px 0 0',
                                                }}
                                                title={`${w.weekStart}: ${w.taskCount} tasks`}
                                            />
                                            <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>
                                                {w.weekStart.slice(5)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* By provider table */}
                    {providers.length > 0 && (
                        <div>
                            <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                                By Provider
                            </p>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: '0.72rem' }}>PROVIDER</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: '0.72rem' }}>TASKS</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: '0.72rem' }}>TOTAL COST</th>
                                        <th style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: '0.72rem' }}>AVG LATENCY</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {providers.map(([provider, stats]) => (
                                        <tr key={provider} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '0.45rem 0.5rem', color: '#374151' }}>{provider}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#374151' }}>{stats.taskCount.toLocaleString()}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#059669' }}>${stats.totalCostUsd.toFixed(3)}</td>
                                            <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', color: '#6b7280' }}>{stats.avgLatencyMs.toLocaleString()}ms</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
