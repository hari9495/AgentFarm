'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import AuditLogPanel from '../components/audit-log-panel';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type ProviderStat = {
    provider: string;
    tokens_used: number;
    estimated_cost_usd: number;
};

type WeeklyBucket = {
    week: string;
    tokens_used: number;
    invocations: number;
    cost_usd: number;
};

type CostSummary = {
    period_start: string;
    period_end: string;
    total_tokens: number;
    total_cost_usd: number;
    total_invocations: number;
    success_rate: number;
    by_skill: unknown[];
    by_provider: ProviderStat[];
    weekly_trend: WeeklyBucket[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDateValue = (d: Date): string => d.toISOString().slice(0, 10);

const defaultFrom = (): string => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toDateValue(d);
};

const defaultTo = (): string => toDateValue(new Date());

// ─── Shared sub-components ────────────────────────────────────────────────────

function MetricTile({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            flex: '1 1 0',
            minWidth: 120,
            padding: '0.9rem 1rem',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            background: '#f9fafb',
        }}>
            <p style={{ margin: '0 0 0.25rem', fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
            </p>
            <p style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: '#111827' }}>{value}</p>
        </div>
    );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: '0 0 1rem' }}>{title}</h2>
            {children}
        </section>
    );
}

// ─── Agent Performance Section ────────────────────────────────────────────────

function AgentPerformanceSection({
    data,
    isLoading,
    error,
}: {
    data: AgentPerformanceData | null;
    isLoading: boolean;
    error: string | null;
}) {
    if (isLoading) {
        return (
            <SectionCard title="Agent Performance">
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading…</p>
            </SectionCard>
        );
    }

    if (error) {
        return (
            <SectionCard title="Agent Performance">
                <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>
            </SectionCard>
        );
    }

    if (!data || data.taskCount === 0) {
        return (
            <SectionCard title="Agent Performance">
                <p style={{ color: '#6b7280', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
                    No tasks in this period.
                </p>
            </SectionCard>
        );
    }

    const providers = Object.entries(data.byProvider);
    const trend = data.weeklyTrend;
    const maxTrendCount = trend.length > 0 ? Math.max(...trend.map((w) => w.taskCount), 1) : 1;

    return (
        <SectionCard title="Agent Performance">
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <MetricTile label="Tasks" value={data.taskCount.toLocaleString()} />
                <MetricTile
                    label="Success Rate"
                    value={data.successRate !== null ? `${(data.successRate * 100).toFixed(1)}%` : '—'}
                />
                <MetricTile
                    label="Avg Cost"
                    value={data.avgCostUsd !== null ? `$${data.avgCostUsd.toFixed(3)}` : '—'}
                />
                <MetricTile
                    label="Avg Latency"
                    value={data.avgLatencyMs !== null ? `${data.avgLatencyMs.toLocaleString()}ms` : '—'}
                />
                <MetricTile label="Total Tokens" value={`${(data.totalTokens / 1000).toFixed(1)}k`} />
            </div>

            {trend.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Weekly Trend
                    </p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72 }}>
                        {trend.map((w) => {
                            const barH = Math.max(2, Math.round((w.taskCount / maxTrendCount) * 72));
                            return (
                                <div key={w.weekStart} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <div
                                        style={{ width: 22, height: barH, background: '#6366f1', borderRadius: '3px 3px 0 0' }}
                                        title={`${w.weekStart}: ${w.taskCount} tasks`}
                                    />
                                    <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{w.weekStart.slice(5)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {providers.length > 0 && (
                <div>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        By Provider
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#374151' }}>Provider</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#374151', textAlign: 'right' }}>Tasks</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#374151', textAlign: 'right' }}>Cost</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#374151', textAlign: 'right' }}>Avg Latency</th>
                                </tr>
                            </thead>
                            <tbody>
                                {providers.map(([provider, stats]) => (
                                    <tr key={provider} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.4rem 0.6rem', color: '#374151' }}>{provider}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>{stats.taskCount.toLocaleString()}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#22c55e' }}>${stats.totalCostUsd.toFixed(3)}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#6b7280' }}>{stats.avgLatencyMs}ms</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </SectionCard>
    );
}

// ─── Cost Summary Section ─────────────────────────────────────────────────────

function CostSummarySection({
    data,
    isLoading,
    error,
}: {
    data: CostSummary | null;
    isLoading: boolean;
    error: string | null;
}) {
    if (isLoading) {
        return (
            <SectionCard title="Cost Summary">
                <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Loading…</p>
            </SectionCard>
        );
    }

    if (error) {
        return (
            <SectionCard title="Cost Summary">
                <p style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</p>
            </SectionCard>
        );
    }

    if (!data) {
        return (
            <SectionCard title="Cost Summary">
                <p style={{ color: '#6b7280', fontSize: '0.875rem', textAlign: 'center', padding: '1.5rem 0' }}>
                    No cost data in this period.
                </p>
            </SectionCard>
        );
    }

    const maxTokens = data.weekly_trend.length > 0 ? Math.max(...data.weekly_trend.map((b) => b.tokens_used), 1) : 1;

    return (
        <SectionCard title="Cost Summary">
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                <MetricTile label="Total Tokens" value={`${(data.total_tokens / 1000).toFixed(1)}k`} />
                <MetricTile label="Total Cost" value={`$${data.total_cost_usd.toFixed(2)}`} />
                <MetricTile label="Invocations" value={data.total_invocations.toLocaleString()} />
                <MetricTile label="Success Rate" value={`${Math.round(data.success_rate * 100)}%`} />
            </div>

            {data.weekly_trend.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        Weekly Token Usage
                    </p>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', height: 80 }}>
                        {data.weekly_trend.map((b) => {
                            const pct = Math.max(2, Math.round((b.tokens_used / maxTokens) * 80));
                            return (
                                <div key={b.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                                    <span style={{ fontSize: '0.6rem', color: '#60a5fa' }}>{(b.tokens_used / 1000).toFixed(0)}k</span>
                                    <div
                                        style={{ width: '100%', background: '#4f46e5', borderRadius: '3px 3px 0 0', height: pct, transition: 'height 0.3s ease' }}
                                        title={`${b.week}: ${b.tokens_used.toLocaleString()} tokens`}
                                    />
                                    <span style={{ fontSize: '0.6rem', color: '#9ca3af' }}>{b.week.slice(5)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {data.by_provider.length > 0 && (
                <div>
                    <p style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                        By Provider
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#374151' }}>Provider</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#374151', textAlign: 'right' }}>Tokens</th>
                                    <th style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#374151', textAlign: 'right' }}>Est. Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.by_provider.map((p) => (
                                    <tr key={p.provider} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.4rem 0.6rem', color: '#374151' }}>{p.provider}</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>{(p.tokens_used / 1000).toFixed(1)}k</td>
                                        <td style={{ padding: '0.4rem 0.6rem', textAlign: 'right', color: '#22c55e' }}>${p.estimated_cost_usd.toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </SectionCard>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const [from, setFrom] = useState<string>(defaultFrom);
    const [to, setTo] = useState<string>(defaultTo);
    const [workspaceId, setWorkspaceId] = useState('');
    const [exportError, setExportError] = useState<string | null>(null);

    const [agentData, setAgentData] = useState<AgentPerformanceData | null>(null);
    const [agentLoading, setAgentLoading] = useState(true);
    const [agentError, setAgentError] = useState<string | null>(null);

    const [costData, setCostData] = useState<CostSummary | null>(null);
    const [costLoading, setCostLoading] = useState(true);
    const [costError, setCostError] = useState<string | null>(null);

    useEffect(() => {
        if (!from || !to) return;
        const fromIso = new Date(from).toISOString();
        const toIso = new Date(to).toISOString();

        setAgentLoading(true);
        setAgentError(null);
        void fetch(
            `/api/analytics/agent-performance?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
            { cache: 'no-store' },
        )
            .then(async (res) => {
                if (!res.ok) {
                    setAgentError('Failed to load agent performance data.');
                    return;
                }
                setAgentData((await res.json()) as AgentPerformanceData);
            })
            .catch(() => {
                setAgentError('Failed to load agent performance data.');
            })
            .finally(() => {
                setAgentLoading(false);
            });

        setCostLoading(true);
        setCostError(null);
        void fetch(
            `/api/analytics/cost-summary?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
            { cache: 'no-store' },
        )
            .then(async (res) => {
                if (!res.ok) {
                    setCostError('Failed to load cost summary.');
                    return;
                }
                setCostData((await res.json()) as CostSummary);
            })
            .catch(() => {
                setCostError('Failed to load cost summary.');
            })
            .finally(() => {
                setCostLoading(false);
            });
    }, [from, to]);

    const handleExportCsv = async (): Promise<void> => {
        setExportError(null);
        if (!workspaceId.trim()) {
            setExportError('Workspace ID is required for CSV export.');
            return;
        }
        const params = new URLSearchParams({ workspace_id: workspaceId.trim() });
        if (from) params.set('from', new Date(from).toISOString());
        if (to) params.set('to', new Date(to).toISOString());
        try {
            const res = await fetch(`/api/audit/export?${params.toString()}`);
            if (!res.ok) {
                setExportError('Export failed. Check workspace ID and try again.');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-export-${workspaceId.trim()}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            setExportError('Export failed. Check your connection and try again.');
        }
    };

    const fromIso = from ? new Date(from).toISOString() : undefined;
    const toIso = to ? new Date(to).toISOString() : undefined;
    const auditKey = `${fromIso ?? ''}-${toIso ?? ''}-${workspaceId}`;

    return (
        <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
            {/* Top bar */}
            <header style={{
                background: '#fff',
                borderBottom: '1px solid #e5e7eb',
                padding: '0 1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
                minHeight: 56,
            }}>
                <Link
                    href="/"
                    style={{ fontSize: '0.82rem', color: '#6366f1', textDecoration: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                    ← Dashboard
                </Link>
                <h1 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0, marginRight: 'auto', whiteSpace: 'nowrap' }}>
                    Analytics
                </h1>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>
                    From
                    <input
                        type="date"
                        value={from}
                        max={to}
                        onChange={(e) => setFrom(e.target.value)}
                        style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem', color: '#111827' }}
                    />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>
                    To
                    <input
                        type="date"
                        value={to}
                        min={from}
                        onChange={(e) => setTo(e.target.value)}
                        style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem', color: '#111827' }}
                    />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: '#374151', fontWeight: 500 }}>
                    Workspace
                    <input
                        type="text"
                        value={workspaceId}
                        onChange={(e) => setWorkspaceId(e.target.value)}
                        placeholder="ws_…"
                        style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 8px', fontSize: '0.82rem', width: 140, color: '#111827' }}
                    />
                </label>

                <button
                    type="button"
                    onClick={() => { void handleExportCsv(); }}
                    style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        border: '1px solid #6366f1',
                        background: '#6366f1',
                        color: '#fff',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                    }}
                >
                    Export CSV
                </button>
            </header>

            {/* Content */}
            <main style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {exportError && (
                    <div style={{
                        padding: '0.6rem 1rem',
                        background: '#fee2e2',
                        border: '1px solid #fca5a5',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        color: '#b91c1c',
                    }}>
                        {exportError}
                    </div>
                )}

                <CostSummarySection data={costData} isLoading={costLoading} error={costError} />
                <AgentPerformanceSection data={agentData} isLoading={agentLoading} error={agentError} />
                <AuditLogPanel key={auditKey} from={fromIso} to={toIso} workspaceId={workspaceId || undefined} />
            </main>
        </div>
    );
}
