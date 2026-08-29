'use client';

import { useEffect, useState } from 'react';
import { CostTrendChart } from './cost-trend-chart';
import { MetricSparkline } from './metric-sparkline';

type AgentCostRow = {
    agentRole: string;
    botCount: number;
    taskCount: number;
    successCount: number;
    successRate: number | null;
    totalTokens: number;
    totalCostUsd: number;
    avgCostUsd: number | null;
    avgLatencyMs: number | null;
};

const ROLE_LABELS: Record<string, string> = {
    developer_agent: 'Developer',
    sales_agent: 'Sales',
    recruiter: 'Recruiter',
    content_writer: 'Content Writer',
    technical_writer: 'Technical Writer',
    project_manager: 'Project Manager',
    marketing_specialist: 'Marketing',
    devops: 'DevOps',
    full_stack_developer: 'Full-Stack Dev',
    customer_support_executive: 'Customer Support',
    corporate_assistant: 'Corporate Asst.',
    mobile: 'Mobile',
    tester: 'Tester',
    meeting_agent: 'Meeting Agent',
    business_analyst: 'Business Analyst',
};

type SkillStat = {
    skill_id: string;
    invocations: number;
    successes: number;
    failures: number;
    avg_duration_ms: number;
    total_tokens?: number;
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
    by_skill: SkillStat[];
    by_provider: ProviderStat[];
    weekly_trend: WeeklyBucket[];
};

const TONE_COLORS: Record<string, string> = {
    brand: 'var(--accent)',
    sky: '#2C8A8A',
    emerald: 'var(--ok)',
    amber: 'var(--warn)',
    violet: 'var(--accent)',
};

function StatCard({ label, value, unit, sparkline, tone }: {
    label: string;
    value: string | number;
    unit?: string;
    sparkline?: number[];
    tone?: 'brand' | 'sky' | 'emerald' | 'amber' | 'violet';
}) {
    const accentColor = TONE_COLORS[tone ?? 'brand'];
    return (
        <div style={{
            flex: '1 1 0',
            minWidth: 140,
            padding: '1rem 1.1rem',
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
        }}>
            <p style={{ fontSize: '0.7rem', color: 'var(--ink-muted)', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ fontSize: '1.45rem', fontWeight: 700, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
                {value}{unit && <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginLeft: 3 }}>{unit}</span>}
            </p>
            {sparkline && sparkline.length >= 2 && (
                <div style={{ marginTop: '0.2rem' }}>
                    <MetricSparkline data={sparkline} tone={tone ?? 'brand'} />
                </div>
            )}
            <div style={{ height: 2, background: accentColor, borderRadius: 2, opacity: 0.18, marginTop: 'auto', paddingTop: '0.5rem' }} />
        </div>
    );
}

function SkillRow({ stat }: { stat: SkillStat }) {
    const successRate = stat.invocations > 0 ? Math.round((stat.successes / stat.invocations) * 100) : 0;
    const barColor = successRate >= 80 ? 'var(--ok)' : successRate >= 50 ? 'var(--warn)' : 'var(--danger)';
    return (
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
            <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.8rem', color: 'var(--brand)', fontFamily: 'monospace', fontWeight: 500 }}>{stat.skill_id}</td>
            <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ink)' }}>{stat.invocations.toLocaleString()}</td>
            <td style={{ padding: '0.55rem 0.75rem', minWidth: 140 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ flex: 1, background: 'var(--bg-deep)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${successRate}%`, background: barColor, height: '100%', borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', minWidth: 32, textAlign: 'right' }}>{successRate}%</span>
                </div>
            </td>
            <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ink-muted)' }}>{stat.avg_duration_ms.toLocaleString()}ms</td>
            <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--brand)' }}>
                {stat.total_tokens ? `${(stat.total_tokens / 1000).toFixed(1)}k` : '—'}
            </td>
        </tr>
    );
}

function ProviderRow({ stat }: { stat: ProviderStat }) {
    const sharePct = 0; // populated when rendered with full dataset
    return (
        <tr style={{ borderBottom: '1px solid var(--line)' }}>
            <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)' }}>{stat.provider}</td>
            <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ink-soft)' }}>{(stat.tokens_used / 1000).toFixed(1)}k</td>
            <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ok)', fontWeight: 600 }}>${stat.estimated_cost_usd.toFixed(4)}</td>
        </tr>
    );
}

function EmptyState({ icon, message, sub }: { icon: string; message: string; sub: string }) {
    return (
        <tr>
            <td colSpan={5} style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem', opacity: 0.4 }}>{icon}</div>
                <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-soft)' }}>{message}</p>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{sub}</p>
            </td>
        </tr>
    );
}

// Mock data for when the API is unavailable
const MOCK_SUMMARY: CostSummary = {
    period_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    period_end: new Date().toISOString(),
    total_tokens: 248_500,
    total_cost_usd: 4.97,
    total_invocations: 1_243,
    success_rate: 0.94,
    by_skill: [
        { skill_id: 'issue-autopilot', invocations: 187, successes: 180, failures: 7, avg_duration_ms: 1240, total_tokens: 45_000 },
        { skill_id: 'pr-reviewer-risk-labels', invocations: 203, successes: 199, failures: 4, avg_duration_ms: 820, total_tokens: 38_000 },
        { skill_id: 'test-coverage-reporter', invocations: 156, successes: 150, failures: 6, avg_duration_ms: 540, total_tokens: 21_000 },
        { skill_id: 'dependency-audit', invocations: 98, successes: 91, failures: 7, avg_duration_ms: 1100, total_tokens: 18_000 },
        { skill_id: 'release-notes-generator', invocations: 72, successes: 72, failures: 0, avg_duration_ms: 1600, total_tokens: 31_000 },
        { skill_id: 'ci-failure-explainer', invocations: 130, successes: 117, failures: 13, avg_duration_ms: 970, total_tokens: 27_500 },
        { skill_id: 'dead-code-detector', invocations: 55, successes: 51, failures: 4, avg_duration_ms: 730, total_tokens: 12_000 },
        { skill_id: 'license-compliance-check', invocations: 44, successes: 44, failures: 0, avg_duration_ms: 610, total_tokens: 9_000 },
    ],
    by_provider: [
        { provider: 'Azure OpenAI (GPT-4o)', tokens_used: 148_500, estimated_cost_usd: 2.97 },
        { provider: 'Azure OpenAI (GPT-4o-mini)', tokens_used: 80_000, estimated_cost_usd: 1.60 },
        { provider: 'Azure AI Foundry', tokens_used: 20_000, estimated_cost_usd: 0.40 },
    ],
    weekly_trend: [
        { week: '2025-W20', tokens_used: 31_000, invocations: 162, cost_usd: 0.62 },
        { week: '2025-W21', tokens_used: 38_000, invocations: 193, cost_usd: 0.76 },
        { week: '2025-W22', tokens_used: 42_000, invocations: 218, cost_usd: 0.84 },
        { week: '2025-W23', tokens_used: 52_500, invocations: 267, cost_usd: 1.05 },
        { week: '2025-W24', tokens_used: 85_000, invocations: 403, cost_usd: 1.70 },
    ],
};

export function CostDashboardPanel() {
    const [data, setData] = useState<CostSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [usingMock, setUsingMock] = useState(false);
    const [agentCost, setAgentCost] = useState<AgentCostRow[]>([]);
    const [agentCostLoading, setAgentCostLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const response = await fetch('/api/analytics/cost-summary', { cache: 'no-store' });
                if (response.ok) {
                    const body = await response.json() as CostSummary;
                    setData(body);
                } else {
                    setData(MOCK_SUMMARY);
                    setUsingMock(true);
                }
            } catch {
                setData(MOCK_SUMMARY);
                setUsingMock(true);
            } finally {
                setIsLoading(false);
            }
        };
        void load();

        const loadAgentCost = async () => {
            try {
                const res = await fetch('/api/analytics/agent-cost', { cache: 'no-store' });
                if (res.ok) {
                    const body = await res.json() as { byAgent: AgentCostRow[] };
                    setAgentCost(body.byAgent ?? []);
                }
            } catch { /* silent — empty state handles it */ }
            finally { setAgentCostLoading(false); }
        };
        void loadAgentCost();
    }, []);

    if (isLoading) {
        return <div style={{ color: 'var(--ink-muted)', padding: '2rem', textAlign: 'center' }}>Loading cost data…</div>;
    }

    if (!data) return null;

    const weeklyTokens = data.weekly_trend.map((b) => b.tokens_used);
    const weeklyCosts = data.weekly_trend.map((b) => b.cost_usd);
    const weeklyInvocations = data.weekly_trend.map((b) => b.invocations);
    const costTrendData = data.weekly_trend.map((b) => ({ week: b.week, tokens_used: b.tokens_used, invocations: b.invocations, cost_usd: b.cost_usd }));

    const thStyle: React.CSSProperties = {
        padding: '0.5rem 0.75rem',
        textAlign: 'left' as const,
        fontSize: '0.7rem',
        color: 'var(--ink-muted)',
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.06em',
        borderBottom: '2px solid var(--line)',
        background: 'var(--bg)',
        whiteSpace: 'nowrap' as const,
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {usingMock && (
                <div style={{
                    padding: '0.6rem 1rem',
                    background: 'var(--warn-bg)',
                    border: '1px solid var(--warn-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    color: 'var(--warn)',
                    fontWeight: 500,
                }}>
                    Showing demo data — live metrics will appear once agents make LLM calls.
                </div>
            )}

            {/* KPI tiles with sparklines */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <StatCard label="Total Tokens" value={(data.total_tokens / 1000).toFixed(1)} unit="k" sparkline={weeklyTokens} tone="sky" />
                <StatCard label="Total Cost" value={`$${data.total_cost_usd.toFixed(2)}`} sparkline={weeklyCosts} tone="amber" />
                <StatCard label="Invocations" value={data.total_invocations.toLocaleString()} sparkline={weeklyInvocations} tone="brand" />
                <StatCard label="Success Rate" value={`${Math.round(data.success_rate * 100)}%`} tone="emerald" />
            </div>

            {/* Weekly cost trend */}
            <CostTrendChart data={costTrendData} height={180} />

            {/* Per-Agent Cost Breakdown */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '0.9rem 1.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 3, height: '0.95rem', background: 'var(--brand)', borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
                    <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.005em' }}>Cost by Agent Role</h2>
                    {agentCost.length > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{agentCost.length} roles active</span>
                    )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Agent Role', 'Tasks', 'Successes', 'Success Rate', 'Tokens', 'Total Cost', 'Avg Cost/Task', 'Avg Latency'].map((h, i) => (
                                    <th key={h} style={{ ...thStyle, textAlign: i > 0 ? 'right' as const : 'left' as const }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {agentCostLoading ? (
                                <tr><td colSpan={8} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.82rem' }}>Loading…</td></tr>
                            ) : agentCost.length === 0 ? (
                                <EmptyState icon="🤖" message="No agent activity yet" sub="Costs by agent role will appear here once agents run tasks." />
                            ) : agentCost.map((row) => {
                                const rate = row.successRate !== null ? row.successRate * 100 : null;
                                const rateColor = rate === null ? 'var(--ink-muted)' : rate >= 80 ? 'var(--ok)' : rate >= 50 ? 'var(--warn)' : 'var(--danger)';
                                const totalCostShare = agentCost.reduce((s, r) => s + r.totalCostUsd, 0);
                                const sharePct = totalCostShare > 0 ? (row.totalCostUsd / totalCostShare) * 100 : 0;
                                return (
                                    <tr key={row.agentRole} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem' }}>
                                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{ROLE_LABELS[row.agentRole] ?? row.agentRole}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                                                <div style={{ flex: 1, maxWidth: 80, background: 'var(--bg-deep)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                                                    <div style={{ width: `${sharePct}%`, background: 'var(--brand)', height: '100%', borderRadius: 3 }} />
                                                </div>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--ink-muted)' }}>{sharePct.toFixed(0)}% of spend</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ink)' }}>{row.taskCount.toLocaleString()}</td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ok)' }}>{row.successCount.toLocaleString()}</td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', fontWeight: 600, color: rateColor }}>
                                            {rate !== null ? `${rate.toFixed(1)}%` : '—'}
                                        </td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ink-soft)' }}>{(row.totalTokens / 1000).toFixed(1)}k</td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', fontWeight: 600, color: 'var(--ink)' }}>${row.totalCostUsd.toFixed(2)}</td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ink-muted)' }}>
                                            {row.avgCostUsd !== null ? `$${row.avgCostUsd.toFixed(4)}` : '—'}
                                        </td>
                                        <td style={{ padding: '0.55rem 0.75rem', fontSize: '0.82rem', textAlign: 'right', color: 'var(--ink-muted)' }}>
                                            {row.avgLatencyMs !== null ? `${row.avgLatencyMs.toLocaleString()}ms` : '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Skill Analytics table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '0.9rem 1.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 3, height: '0.95rem', background: 'var(--brand)', borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
                    <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.005em' }}>Skill Analytics</h2>
                    {data.by_skill.length > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{data.by_skill.length} skills</span>
                    )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Skill</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Runs</th>
                                <th style={{ ...thStyle, minWidth: 160 }}>Success Rate</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Avg Time</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Tokens</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.by_skill.length === 0
                                ? <EmptyState icon="⚙️" message="No skill invocations yet" sub="Skills will appear here once agents run tasks." />
                                : data.by_skill.map((stat) => <SkillRow key={stat.skill_id} stat={stat} />)
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cost by Provider table */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '0.9rem 1.25rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ width: 3, height: '0.95rem', background: 'var(--brand)', borderRadius: 2, display: 'inline-block', flexShrink: 0 }} />
                    <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.005em' }}>Cost by Provider</h2>
                    {data.by_provider.length > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{data.by_provider.length} providers</span>
                    )}
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={thStyle}>Provider</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Tokens</th>
                                <th style={{ ...thStyle, textAlign: 'right' }}>Est. Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.by_provider.length === 0
                                ? <EmptyState icon="💹" message="No provider usage yet" sub="Costs will appear here once agents make LLM calls." />
                                : data.by_provider.map((stat) => <ProviderRow key={stat.provider} stat={stat} />)
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
