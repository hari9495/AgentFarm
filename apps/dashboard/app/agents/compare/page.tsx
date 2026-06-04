'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

type AgentStat = {
    botId: string;
    name: string;
    role: string;
    taskCount: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    totalCostUsd: number;
    avgCostUsd: number | null;
    totalTokens: number;
    avgQualityScore: number | null;
};

type AgentOption = { id: string; name: string; role: string };

function StatRow({ label, left, right, lowerIsBetter }: { label: string; left: number | null; right: number | null; lowerIsBetter?: boolean }) {
    const bothPresent = left !== null && right !== null;
    const leftBetter = bothPresent && (lowerIsBetter ? left < right : left > right);
    const rightBetter = bothPresent && (lowerIsBetter ? right < left : right > left);

    const fmt = (v: number | null, isMs?: boolean, isCost?: boolean) => {
        if (v === null) return 'N/A';
        if (isMs) return `${v.toLocaleString()}ms`;
        if (isCost) return `$${v.toFixed(4)}`;
        return v.toLocaleString();
    };

    const isMs = label.includes('Latency');
    const isCost = label.includes('Cost');
    const isPct = label.includes('Rate') || label.includes('Score');

    const display = (v: number | null) => {
        if (v === null) return 'N/A';
        if (isPct) return `${(v * 100).toFixed(1)}%`;
        return fmt(v, isMs, isCost);
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{
                textAlign: 'right',
                fontWeight: leftBetter ? 700 : 500,
                color: leftBetter ? 'var(--ok)' : rightBetter ? 'var(--ink-muted)' : 'var(--ink)',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '0.4rem',
            }}>
                {leftBetter && <span style={{ color: 'var(--ok)', fontSize: '0.75rem' }}>✓</span>}
                {display(left)}
            </div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-muted)', textAlign: 'center', minWidth: 120 }}>
                {label}
            </div>
            <div style={{
                fontWeight: rightBetter ? 700 : 500,
                color: rightBetter ? 'var(--ok)' : leftBetter ? 'var(--ink-muted)' : 'var(--ink)',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
            }}>
                {display(right)}
                {rightBetter && <span style={{ color: 'var(--ok)', fontSize: '0.75rem' }}>✓</span>}
            </div>
        </div>
    );
}

export default function AgentComparePage() {
    const [agents, setAgents] = useState<AgentOption[]>([]);
    const [agentsLoading, setAgentsLoading] = useState(true);

    const [leftId, setLeftId] = useState('');
    const [rightId, setRightId] = useState('');

    const [leftStat, setLeftStat] = useState<AgentStat | null>(null);
    const [rightStat, setRightStat] = useState<AgentStat | null>(null);
    const [leftLoading, setLeftLoading] = useState(false);
    const [rightLoading, setRightLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        void fetch('/api/agents')
            .then((r) => r.json())
            .then((data: { bots?: AgentOption[] }) => {
                setAgents(data.bots ?? []);
                setAgentsLoading(false);
            })
            .catch(() => setAgentsLoading(false));
    }, []);

    const fetchStat = useCallback(async (botId: string, side: 'left' | 'right') => {
        if (!botId) return;
        const setter = side === 'left' ? setLeftLoading : setRightLoading;
        const statSetter = side === 'left' ? setLeftStat : setRightStat;
        setter(true);
        setError(null);
        try {
            const res = await fetch(`/api/analytics/agent-performance?botId=${encodeURIComponent(botId)}`);
            if (!res.ok) {
                setError(`Failed to load stats for agent ${botId}.`);
                return;
            }
            const data = (await res.json()) as AgentStat;
            statSetter({ ...data, botId });
        } catch {
            setError('Network error loading agent stats.');
        } finally {
            setter(false);
        }
    }, []);

    useEffect(() => { void fetchStat(leftId, 'left'); }, [leftId, fetchStat]);
    useEffect(() => { void fetchStat(rightId, 'right'); }, [rightId, fetchStat]);

    const leftAgent = agents.find((a) => a.id === leftId);
    const rightAgent = agents.find((a) => a.id === rightId);

    return (
        <main className="page-shell">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <Link href="/agents" style={{ fontSize: '0.82rem', color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}>
                    ← Agents
                </Link>
            </div>
            <div className="card">
                <h2>Agent Comparison</h2>
                <p style={{ margin: '-0.45rem 0 1rem', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                    Select two agents to compare their cost, latency, success rate, and token usage side-by-side.
                </p>

                {agentsLoading ? (
                    <p style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>Loading agents…</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'end', marginBottom: '1.5rem' }}>
                        <div className="panel-field">
                            <label className="panel-field-label">Agent A</label>
                            <select
                                className="panel-control"
                                value={leftId}
                                onChange={(e) => setLeftId(e.target.value)}
                            >
                                <option value="">— select agent —</option>
                                {agents.filter((a) => a.id !== rightId).map((a) => (
                                    <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--ink-muted)', paddingBottom: '0.4rem', textAlign: 'center' }}>
                            vs
                        </div>
                        <div className="panel-field">
                            <label className="panel-field-label">Agent B</label>
                            <select
                                className="panel-control"
                                value={rightId}
                                onChange={(e) => setRightId(e.target.value)}
                            >
                                <option value="">— select agent —</option>
                                {agents.filter((a) => a.id !== leftId).map((a) => (
                                    <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}

                {error && <p style={{ color: 'var(--danger)', fontSize: '0.84rem', marginBottom: '0.75rem' }}>{error}</p>}

                {(leftId || rightId) && (
                    <div>
                        {/* Agent name headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <div style={{ textAlign: 'right' }}>
                                {leftAgent ? (
                                    <div>
                                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{leftAgent.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{leftAgent.role}</div>
                                    </div>
                                ) : <span style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>—</span>}
                            </div>
                            <div />
                            <div>
                                {rightAgent ? (
                                    <div>
                                        <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{rightAgent.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{rightAgent.role}</div>
                                    </div>
                                ) : <span style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>—</span>}
                            </div>
                        </div>

                        {(leftLoading || rightLoading) && (
                            <p style={{ color: 'var(--ink-muted)', fontSize: '0.84rem', textAlign: 'center', padding: '1rem 0' }}>Loading stats…</p>
                        )}

                        {(!leftLoading && !rightLoading) && (
                            <div>
                                <StatRow label="Tasks Run" left={leftStat?.taskCount ?? null} right={rightStat?.taskCount ?? null} />
                                <StatRow label="Success Rate" left={leftStat?.successRate ?? null} right={rightStat?.successRate ?? null} />
                                <StatRow label="Avg Latency" left={leftStat?.avgLatencyMs ?? null} right={rightStat?.avgLatencyMs ?? null} lowerIsBetter />
                                <StatRow label="Avg Cost / Task" left={leftStat?.avgCostUsd ?? null} right={rightStat?.avgCostUsd ?? null} lowerIsBetter />
                                <StatRow label="Total Cost" left={leftStat?.totalCostUsd ?? null} right={rightStat?.totalCostUsd ?? null} lowerIsBetter />
                                <StatRow label="Total Tokens" left={leftStat?.totalTokens ?? null} right={rightStat?.totalTokens ?? null} lowerIsBetter />
                                <StatRow label="Avg Quality Score" left={leftStat?.avgQualityScore ?? null} right={rightStat?.avgQualityScore ?? null} />
                            </div>
                        )}

                        {!leftId && !rightId && (
                            <p style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.84rem', padding: '1.5rem 0' }}>
                                Select two agents above to compare their metrics.
                            </p>
                        )}
                    </div>
                )}

                {!leftId && !rightId && (
                    <p style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.84rem', padding: '1.5rem 0' }}>
                        Select two agents above to compare their metrics.
                    </p>
                )}
            </div>
        </main>
    );
}
