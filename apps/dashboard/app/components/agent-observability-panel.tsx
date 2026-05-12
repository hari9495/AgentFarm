'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentStatus = {
    botId: string;
    status: string;
    tenantId: string;
};

type CostSummary = {
    taskCount: number;
    totalCostUsd: number;
    avgCostUsd: number | null;
    successRate: number | null;
    from: string;
    to: string;
};

type AgentPerformance = {
    taskCount: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    avgQualityScore: number | null;
};

type CircuitDto = {
    key: string;
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    successCount: number;
    openedAt: number | null;
    nextRetryAt: number | null;
};

type RateLimitConfig = {
    botId: string;
    requestsPerMinute: number;
    burstLimit: number;
    enabled: boolean;
};

type AbTest = {
    id: string;
    botId: string;
    name: string;
    versionAId: string;
    versionBId: string;
    trafficSplit: number;
    status?: string;
};

type QualitySignal = {
    id?: string;
    signalType: string | null;
    score: number | null;
    recordedAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const CIRCUIT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    closed: { bg: '#14532d', text: '#86efac', label: 'CLOSED' },
    open: { bg: '#450a0a', text: '#fca5a5', label: 'OPEN' },
    'half-open': { bg: '#431407', text: '#fdba74', label: 'HALF-OPEN' },
};

function fmtUsd(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return `$${v.toFixed(4)}`;
}

function fmtPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return `${(v * 100).toFixed(1)}%`;
}

function fmtMs(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return `${v.toLocaleString()} ms`;
}

// ── Card skeleton ─────────────────────────────────────────────────────────────

function CardSkeleton() {
    return (
        <div
            style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
            }}
        >
            {[70, 50, 60].map((w, i) => (
                <div
                    key={i}
                    style={{
                        height: '12px',
                        background: '#1e293b',
                        borderRadius: '4px',
                        width: `${w}%`,
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                />
            ))}
        </div>
    );
}

// ── Card shell ────────────────────────────────────────────────────────────────

function MetricCard({ title, children, error }: { title: string; children: React.ReactNode; error?: string | null }) {
    return (
        <div
            style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px',
            }}
        >
            <div
                style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#475569',
                    marginBottom: '12px',
                }}
            >
                {title}
            </div>
            {error ? (
                <p style={{ fontSize: '12px', color: '#fca5a5', margin: 0 }}>{error}</p>
            ) : (
                children
            )}
        </div>
    );
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
            <span style={{ color: '#64748b' }}>{label}</span>
            <span style={{ color: '#e2e8f0', fontFamily: 'monospace', fontWeight: 600 }}>{value}</span>
        </div>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type AgentObservabilityPanelProps = {
    botId: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentObservabilityPanel({ botId }: AgentObservabilityPanelProps) {

    // — Status
    const [statusData, setStatusData] = useState<AgentStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);

    // — Cost
    const [costData, setCostData] = useState<CostSummary | null>(null);
    const [costLoading, setCostLoading] = useState(true);
    const [costError, setCostError] = useState<string | null>(null);

    // — Performance
    const [perfData, setPerfData] = useState<AgentPerformance | null>(null);
    const [perfLoading, setPerfLoading] = useState(true);
    const [perfError, setPerfError] = useState<string | null>(null);

    // — Circuit breaker
    const [circuitData, setCircuitData] = useState<CircuitDto[]>([]);
    const [circuitLoading, setCircuitLoading] = useState(true);
    const [circuitError, setCircuitError] = useState<string | null>(null);

    // — Rate limit
    const [rateLimitData, setRateLimitData] = useState<RateLimitConfig | null>(null);
    const [rateLimitLoading, setRateLimitLoading] = useState(true);
    const [rateLimitError, setRateLimitError] = useState<string | null>(null);

    // — A/B tests
    const [abTests, setAbTests] = useState<AbTest[]>([]);
    const [abLoading, setAbLoading] = useState(true);
    const [abError, setAbError] = useState<string | null>(null);

    // — Quality signals
    const [signals, setSignals] = useState<QualitySignal[]>([]);
    const [signalsLoading, setSignalsLoading] = useState(true);
    const [signalsError, setSignalsError] = useState<string | null>(null);

    useEffect(() => {
        // Fetch status
        void (async () => {
            setStatusLoading(true);
            try {
                const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/status`, { cache: 'no-store' });
                if (res.ok) {
                    const data = (await res.json()) as AgentStatus;
                    setStatusData(data);
                }
            } finally {
                setStatusLoading(false);
            }
        })();

        // Fetch cost summary
        void (async () => {
            setCostLoading(true);
            setCostError(null);
            try {
                const res = await fetch(`/api/analytics/cost-summary`, { cache: 'no-store' });
                if (!res.ok) {
                    const e = (await res.json().catch(() => ({}))) as { message?: string };
                    setCostError(e.message ?? `HTTP ${res.status}`);
                } else {
                    const data = (await res.json()) as CostSummary;
                    setCostData(data);
                }
            } catch {
                setCostError('Network error loading cost data.');
            } finally {
                setCostLoading(false);
            }
        })();

        // Fetch agent performance
        void (async () => {
            setPerfLoading(true);
            setPerfError(null);
            try {
                const res = await fetch(`/api/analytics/agent-performance`, { cache: 'no-store' });
                if (!res.ok) {
                    const e = (await res.json().catch(() => ({}))) as { message?: string };
                    setPerfError(e.message ?? `HTTP ${res.status}`);
                } else {
                    const data = (await res.json()) as AgentPerformance;
                    setPerfData(data);
                }
            } catch {
                setPerfError('Network error loading performance data.');
            } finally {
                setPerfLoading(false);
            }
        })();

        // Fetch circuit breakers (filter by botId in key)
        void (async () => {
            setCircuitLoading(true);
            setCircuitError(null);
            try {
                const res = await fetch('/api/health/circuit-breakers', { cache: 'no-store' });
                if (!res.ok) {
                    setCircuitError(`HTTP ${res.status}`);
                } else {
                    const data = (await res.json()) as { circuits?: CircuitDto[] };
                    const filtered = (data.circuits ?? []).filter((c) => c.key.includes(botId));
                    setCircuitData(filtered);
                }
            } catch {
                setCircuitError('Network error loading circuit state.');
            } finally {
                setCircuitLoading(false);
            }
        })();

        // Fetch rate limit
        void (async () => {
            setRateLimitLoading(true);
            setRateLimitError(null);
            try {
                const res = await fetch(`/api/agents/${encodeURIComponent(botId)}/rate-limit`, { cache: 'no-store' });
                if (res.status === 404) {
                    setRateLimitData(null);
                } else if (!res.ok) {
                    const e = (await res.json().catch(() => ({}))) as { message?: string };
                    setRateLimitError(e.message ?? `HTTP ${res.status}`);
                } else {
                    const data = (await res.json()) as RateLimitConfig;
                    setRateLimitData(data);
                }
            } catch {
                setRateLimitError('Network error loading rate limit.');
            } finally {
                setRateLimitLoading(false);
            }
        })();

        // Fetch A/B tests (filter client-side by botId)
        void (async () => {
            setAbLoading(true);
            setAbError(null);
            try {
                const res = await fetch('/api/ab-tests', { cache: 'no-store' });
                if (!res.ok) {
                    setAbError(`HTTP ${res.status}`);
                } else {
                    const data = (await res.json()) as { abTests?: AbTest[] };
                    const filtered = (data.abTests ?? []).filter((t) => t.botId === botId);
                    setAbTests(filtered);
                }
            } catch {
                setAbError('Network error loading A/B tests.');
            } finally {
                setAbLoading(false);
            }
        })();

        // Fetch quality signals
        void (async () => {
            setSignalsLoading(true);
            setSignalsError(null);
            try {
                const res = await fetch(`/api/quality/signals?limit=20`, { cache: 'no-store' });
                if (!res.ok) {
                    setSignalsError(`HTTP ${res.status}`);
                } else {
                    const data = (await res.json()) as { signals?: QualitySignal[] };
                    setSignals((data.signals ?? []).slice(0, 5));
                }
            } catch {
                setSignalsError('Network error loading quality signals.');
            } finally {
                setSignalsLoading(false);
            }
        })();
    }, [botId]);

    // ── Status bar ─────────────────────────────────────────────────────────────
    const statusColors: Record<string, { bg: string; text: string }> = {
        active: { bg: '#14532d', text: '#86efac' },
        paused: { bg: '#422006', text: '#fde68a' },
        failed: { bg: '#450a0a', text: '#fca5a5' },
        created: { bg: '#172554', text: '#bfdbfe' },
        bootstrapping: { bg: '#1c1917', text: '#e7e5e4' },
    };
    const sc = (statusData?.status ? (statusColors[statusData.status] ?? { bg: '#1e293b', text: '#94a3b8' }) : { bg: '#1e293b', text: '#94a3b8' });

    // ── Rate-limit progress bar ────────────────────────────────────────────────
    function rateLimitBar(rpm: number, burst: number) {
        // Estimate headroom as burst/rpm ratio (higher = more headroom per minute)
        const pct = Math.min(100, Math.round((burst / Math.max(rpm, 1)) * 100));
        const barColor = pct >= 50 ? '#16a34a' : pct >= 20 ? '#d97706' : '#dc2626';
        return (
            <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>
                    <span>Burst / RPM headroom</span>
                    <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
                </div>
                <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Status bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    background: '#060d1a',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    marginBottom: '20px',
                }}
            >
                {statusLoading ? (
                    <span style={{ fontSize: '12px', color: '#475569' }}>Loading status…</span>
                ) : statusData ? (
                    <>
                        <span
                            style={{
                                padding: '3px 10px',
                                background: sc.bg,
                                color: sc.text,
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}
                        >
                            {statusData.status}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>
                            {botId}
                        </span>
                    </>
                ) : (
                    <span style={{ fontSize: '12px', color: '#475569' }}>Status unavailable</span>
                )}
            </div>

            {/* 3×2 metric card grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                }}
            >
                {/* Card 1 — Cost */}
                {costLoading ? (
                    <CardSkeleton />
                ) : (
                    <MetricCard title="Cost (30d)" error={costError}>
                        {costData && (
                            <>
                                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>
                                    {fmtUsd(costData.totalCostUsd)}
                                </div>
                                <StatRow label="Avg / task" value={fmtUsd(costData.avgCostUsd)} />
                                <StatRow label="Tasks" value={costData.taskCount.toLocaleString()} />
                                <StatRow label="Success rate" value={fmtPct(costData.successRate)} />
                            </>
                        )}
                    </MetricCard>
                )}

                {/* Card 2 — Performance */}
                {perfLoading ? (
                    <CardSkeleton />
                ) : (
                    <MetricCard title="Performance (30d)" error={perfError}>
                        {perfData && (
                            <>
                                <div style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', marginBottom: '8px' }}>
                                    {fmtPct(perfData.successRate)}
                                </div>
                                <StatRow label="Avg latency" value={fmtMs(perfData.avgLatencyMs)} />
                                <StatRow label="Tasks" value={perfData.taskCount.toLocaleString()} />
                                <StatRow label="Avg quality" value={perfData.avgQualityScore !== null ? (perfData.avgQualityScore ?? 0).toFixed(2) : '—'} />
                            </>
                        )}
                    </MetricCard>
                )}

                {/* Card 3 — Circuit Breaker */}
                {circuitLoading ? (
                    <CardSkeleton />
                ) : (
                    <MetricCard title="Circuit Breakers" error={circuitError}>
                        {circuitData.length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>No circuits for this agent.</p>
                        ) : (
                            circuitData.slice(0, 3).map((c) => {
                                const cs = CIRCUIT_COLORS[c.state] ?? { bg: '#1e293b', text: '#94a3b8', label: c.state.toUpperCase() };
                                return (
                                    <div
                                        key={c.key}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}
                                    >
                                        <span style={{ fontSize: '11px', color: '#64748b', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {c.key.split(':').pop()}
                                        </span>
                                        <span
                                            style={{
                                                padding: '2px 7px',
                                                background: cs.bg,
                                                color: cs.text,
                                                borderRadius: '4px',
                                                fontSize: '10px',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {cs.label}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </MetricCard>
                )}

                {/* Card 4 — Rate Limit */}
                {rateLimitLoading ? (
                    <CardSkeleton />
                ) : (
                    <MetricCard title="Rate Limit" error={rateLimitError}>
                        {rateLimitData ? (
                            <>
                                <StatRow label="Req / min" value={rateLimitData.requestsPerMinute.toString()} />
                                <StatRow label="Burst limit" value={rateLimitData.burstLimit.toString()} />
                                <StatRow
                                    label="Enabled"
                                    value={rateLimitData.enabled ? 'Yes' : 'No'}
                                />
                                {rateLimitBar(rateLimitData.requestsPerMinute, rateLimitData.burstLimit)}
                            </>
                        ) : (
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Not configured.</p>
                        )}
                    </MetricCard>
                )}

                {/* Card 5 — A/B Tests */}
                {abLoading ? (
                    <CardSkeleton />
                ) : (
                    <MetricCard title="A/B Tests" error={abError}>
                        {abTests.length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>No active tests.</p>
                        ) : (
                            abTests.slice(0, 2).map((t) => (
                                <div key={t.id} style={{ marginBottom: '8px' }}>
                                    <div style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600, marginBottom: '2px' }}>
                                        {t.name}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <span
                                            style={{
                                                fontSize: '10px',
                                                padding: '1px 6px',
                                                background: '#172554',
                                                color: '#93c5fd',
                                                borderRadius: '3px',
                                                fontWeight: 600,
                                            }}
                                        >
                                            A {Math.round((1 - t.trafficSplit) * 100)}%
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '10px',
                                                padding: '1px 6px',
                                                background: '#1c2b3a',
                                                color: '#7dd3fc',
                                                borderRadius: '3px',
                                                fontWeight: 600,
                                            }}
                                        >
                                            B {Math.round(t.trafficSplit * 100)}%
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </MetricCard>
                )}

                {/* Card 6 — Quality Signals */}
                {signalsLoading ? (
                    <CardSkeleton />
                ) : (
                    <MetricCard title="Quality Signals" error={signalsError}>
                        {signals.length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>No signals recorded.</p>
                        ) : (
                            signals.map((s, i) => {
                                const score = s.score;
                                const scoreColor = score === null ? '#475569' : score >= 0.7 ? '#16a34a' : score >= 0.4 ? '#d97706' : '#dc2626';
                                return (
                                    <div
                                        key={s.id ?? i}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}
                                    >
                                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                            {s.signalType ?? 'unknown'}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                color: scoreColor,
                                                fontFamily: 'monospace',
                                            }}
                                        >
                                            {score !== null ? (score ?? 0).toFixed(2) : '—'}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </MetricCard>
                )}
            </div>
        </div>
    );
}
