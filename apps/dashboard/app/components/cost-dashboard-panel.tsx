'use client';

/**
 * CostDashboardPanel
 *
 * Renders LLM token usage charts by skill/provider/week,
 * skill invocation counts, success rates, and skill analytics.
 *
 * Data is fetched from /api/analytics/cost-summary.
 */

import { useEffect, useState } from 'react';

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

function StatCard({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
    return (
        <div style={{ padding: '0.9rem 1rem', background: '#1a1a2e', borderRadius: 10, border: '1px solid #333', minWidth: 140 }}>
            <p style={{ fontSize: '0.72rem', color: '#888', marginBottom: '0.3rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0' }}>
                {value}{unit && <span style={{ fontSize: '0.8rem', color: '#888', marginLeft: 2 }}>{unit}</span>}
            </p>
        </div>
    );
}

function SkillRow({ stat }: { stat: SkillStat }) {
    const successRate = stat.invocations > 0 ? Math.round((stat.successes / stat.invocations) * 100) : 0;
    const barWidth = `${successRate}%`;
    return (
        <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
            <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', color: '#a5b4fc', fontFamily: 'monospace' }}>{stat.skill_id}</td>
            <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', textAlign: 'right' }}>{stat.invocations.toLocaleString()}</td>
            <td style={{ padding: '0.5rem 0.4rem', width: 120 }}>
                <div style={{ background: '#1e1e2e', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: barWidth, background: successRate >= 80 ? '#22c55e' : successRate >= 50 ? '#f59e0b' : '#ef4444', height: '100%', borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: '0.7rem', color: '#888' }}>{successRate}%</span>
            </td>
            <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', textAlign: 'right', color: '#888' }}>{stat.avg_duration_ms}ms</td>
            <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.8rem', textAlign: 'right', color: '#60a5fa' }}>
                {stat.total_tokens ? `${(stat.total_tokens / 1000).toFixed(1)}k` : '—'}
            </td>
        </tr>
    );
}

function ProviderRow({ stat }: { stat: ProviderStat }) {
    return (
        <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
            <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.82rem', fontWeight: 600 }}>{stat.provider}</td>
            <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.82rem', textAlign: 'right' }}>{(stat.tokens_used / 1000).toFixed(1)}k</td>
            <td style={{ padding: '0.5rem 0.4rem', fontSize: '0.82rem', textAlign: 'right', color: '#22c55e' }}>${stat.estimated_cost_usd.toFixed(4)}</td>
        </tr>
    );
}

function WeeklyChart({ buckets }: { buckets: WeeklyBucket[] }) {
    if (buckets.length === 0) return null;
    const maxTokens = Math.max(...buckets.map((b) => b.tokens_used), 1);
    return (
        <div style={{ marginTop: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Weekly Token Usage</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', height: 100 }}>
                {buckets.map((b) => {
                    const heightPct = (b.tokens_used / maxTokens) * 100;
                    return (
                        <div key={b.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                            <span style={{ fontSize: '0.6rem', color: '#60a5fa' }}>{(b.tokens_used / 1000).toFixed(0)}k</span>
                            <div style={{ width: '100%', background: '#4f46e5', borderRadius: '3px 3px 0 0', height: `${heightPct}%`, minHeight: 2, transition: 'height 0.3s ease' }} />
                            <span style={{ fontSize: '0.6rem', color: '#555' }}>{b.week.slice(5)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
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
    }, []);

    if (isLoading) {
        return <div style={{ color: '#888', padding: '2rem', textAlign: 'center' }}>Loading cost data…</div>;
    }

    if (!data) return null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {usingMock && (
                <div style={{ padding: '0.5rem 0.9rem', background: '#1c1c0a', borderRadius: 6, border: '1px solid #444', fontSize: '0.78rem', color: '#fbbf24' }}>
                    Showing demo data — connect /api/analytics/cost-summary for live metrics.
                </div>
            )}

            {/* Summary stats */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <StatCard label="Total Tokens" value={(data.total_tokens / 1000).toFixed(1)} unit="k" />
                <StatCard label="Total Cost" value={`$${data.total_cost_usd.toFixed(2)}`} />
                <StatCard label="Invocations" value={data.total_invocations.toLocaleString()} />
                <StatCard label="Success Rate" value={`${Math.round(data.success_rate * 100)}%`} />
            </div>

            {/* Weekly chart */}
            {data.weekly_trend.length > 0 && (
                <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: 10, border: '1px solid #333' }}>
                    <WeeklyChart buckets={data.weekly_trend} />
                </div>
            )}

            {/* Skills table */}
            <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: 10, border: '1px solid #333', overflowX: 'auto' }}>
                <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Skill Analytics</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #333' }}>
                            <th style={{ padding: '0.4rem', textAlign: 'left', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>SKILL</th>
                            <th style={{ padding: '0.4rem', textAlign: 'right', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>RUNS</th>
                            <th style={{ padding: '0.4rem', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>SUCCESS</th>
                            <th style={{ padding: '0.4rem', textAlign: 'right', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>AVG TIME</th>
                            <th style={{ padding: '0.4rem', textAlign: 'right', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>TOKENS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.by_skill.map((stat) => <SkillRow key={stat.skill_id} stat={stat} />)}
                    </tbody>
                </table>
            </div>

            {/* Provider table */}
            <div style={{ padding: '1rem', background: '#1a1a2e', borderRadius: 10, border: '1px solid #333', overflowX: 'auto' }}>
                <p style={{ fontSize: '0.75rem', color: '#888', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>Cost by Provider</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #333' }}>
                            <th style={{ padding: '0.4rem', textAlign: 'left', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>PROVIDER</th>
                            <th style={{ padding: '0.4rem', textAlign: 'right', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>TOKENS</th>
                            <th style={{ padding: '0.4rem', textAlign: 'right', fontSize: '0.72rem', color: '#666', fontWeight: 600 }}>EST. COST</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.by_provider.map((stat) => <ProviderRow key={stat.provider} stat={stat} />)}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
