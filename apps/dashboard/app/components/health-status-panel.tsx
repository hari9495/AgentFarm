'use client';

import { useEffect, useState, useCallback } from 'react';

// ─── Local types ──────────────────────────────────────────────────────────────

type GatewayStatus = {
    status: 'ok' | 'degraded';
    service: string;
    db: 'connected' | 'unreachable';
    uptime: number;
    memoryMb: number;
    ts: string;
};

type CircuitEntry = {
    key: string;
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    successCount: number;
    openedAt: number | null;
    nextRetryAt: number | null;
};

type QueueEntry = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId?: string;
    priority: string;
    payload: unknown;
    enqueuedAt: number;
};

type QueueStatus = {
    depth: number;
    snapshot: QueueEntry[];
};

type ConnectorStatus = {
    id: string;
    status: string;
    [key: string]: unknown;
};

type AgentRuntimeHealth = {
    reachable: boolean;
    ok?: boolean;
    state?: string;
    worker_loop_running?: boolean;
    heartbeat_loop_running?: boolean;
    task_queue_depth?: number;
    active_task_slots?: number;
    max_concurrent_tasks?: number;
    processed_tasks?: number;
    succeeded_tasks?: number;
    failed_tasks?: number;
    pending_approval_tasks?: number;
    heartbeat_sent?: number;
    heartbeat_failed?: number;
    error?: string;
};

type SimpleServiceHealth = {
    reachable: boolean;
    status?: string;
    service?: string;
    timestamp?: string;
    error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

// ─── Badge colour maps ────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    ok: { bg: '#dcfce7', color: '#166534' },
    degraded: { bg: '#fee2e2', color: '#991b1b' },
    connected: { bg: '#dcfce7', color: '#166534' },
    unreachable: { bg: '#fee2e2', color: '#991b1b' },
};

const CIRCUIT_BADGE: Record<string, { bg: string; color: string }> = {
    closed: { bg: '#dcfce7', color: '#166534' },
    open: { bg: '#fee2e2', color: '#991b1b' },
    'half-open': { bg: '#fef9c3', color: '#854d0e' },
};

const CONNECTOR_BADGE: Record<string, { bg: string; color: string }> = {
    healthy: { bg: '#dcfce7', color: '#166534' },
    unhealthy: { bg: '#fee2e2', color: '#991b1b' },
    error: { bg: '#fee2e2', color: '#991b1b' },
    unknown: { bg: '#f1f5f9', color: '#475569' },
};

function resolveBadge(
    map: Record<string, { bg: string; color: string }>,
    key: string,
): { bg: string; color: string } {
    return map[key] ?? { bg: '#fef9c3', color: '#854d0e' };
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function InlineBadge({
    badgeStyle,
    label,
}: {
    badgeStyle: { bg: string; color: string };
    label: string;
}) {
    return (
        <span
            style={{
                display: 'inline-block',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 600,
                background: badgeStyle.bg,
                color: badgeStyle.color,
            }}
        >
            {label}
        </span>
    );
}

function PanelSkeleton() {
    return (
        <div
            style={{
                height: '4rem',
                background: 'var(--line)',
                borderRadius: '0.25rem',
                opacity: 0.5,
            }}
        />
    );
}

// ─── Style constants ──────────────────────────────────────────────────────────

const PANEL_STYLE: React.CSSProperties = {
    border: '1px solid var(--line)',
    borderRadius: '0.5rem',
    padding: '1.25rem',
    background: 'var(--bg)',
};

const PANEL_TITLE_STYLE: React.CSSProperties = {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: 'var(--ink)',
    marginBottom: '0.75rem',
    marginTop: 0,
};

const TABLE_TH_STYLE: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.25rem 0.5rem',
    color: 'var(--ink-muted)',
    fontWeight: 600,
    borderBottom: '1px solid var(--line)',
    fontSize: '0.78rem',
};

const TABLE_TD_STYLE: React.CSSProperties = {
    padding: '0.35rem 0.5rem',
    color: 'var(--ink)',
    fontSize: '0.8rem',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function HealthStatusPanel() {
    const [gateway,       setGateway]       = useState<GatewayStatus | null>(null);
    const [circuits,      setCircuits]      = useState<CircuitEntry[]>([]);
    const [queue,         setQueue]         = useState<QueueStatus | null>(null);
    const [connectors,    setConnectors]    = useState<ConnectorStatus[]>([]);
    const [agentRuntime,  setAgentRuntime]  = useState<AgentRuntimeHealth | null>(null);
    const [triggerSvc,    setTriggerSvc]    = useState<SimpleServiceHealth | null>(null);
    const [orchestrator,  setOrchestrator]  = useState<SimpleServiceHealth | null>(null);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [refreshing,    setRefreshing]    = useState(false);

    const fetchAll = useCallback(async () => {
        try {
            const [gwRes, cbRes, tqRes, cnRes, arRes, tsRes, orRes] = await Promise.all([
                fetch('/api/health/gateway',        { cache: 'no-store' }),
                fetch('/api/health/circuit-breakers',{ cache: 'no-store' }),
                fetch('/api/health/task-queue',     { cache: 'no-store' }),
                fetch('/api/health/connectors',     { cache: 'no-store' }),
                fetch('/api/health/agent-runtime',  { cache: 'no-store' }),
                fetch('/api/health/trigger-service',{ cache: 'no-store' }),
                fetch('/api/health/orchestrator',   { cache: 'no-store' }),
            ]);

            if (gwRes.ok) { const gw = await gwRes.json().catch(() => null) as GatewayStatus | null; setGateway(gw); } else { setGateway(null); }
            if (cbRes.ok) { const cb = await cbRes.json().catch(() => null) as { circuits: CircuitEntry[] } | null; setCircuits(cb?.circuits ?? []); } else { setCircuits([]); }
            if (tqRes.ok) { const tq = await tqRes.json().catch(() => null) as QueueStatus | null; setQueue(tq); } else { setQueue(null); }
            if (cnRes.ok) { const cn = await cnRes.json().catch(() => null) as { statuses: ConnectorStatus[] } | null; setConnectors(cn?.statuses ?? []); } else { setConnectors([]); }

            // New services — reachable even on 502 (we set reachable:false in those routes)
            const ar = await arRes.json().catch(() => ({ reachable: false })) as AgentRuntimeHealth;
            setAgentRuntime(ar);
            const ts = await tsRes.json().catch(() => ({ reachable: false })) as SimpleServiceHealth;
            setTriggerSvc(ts);
            const or = await orRes.json().catch(() => ({ reachable: false })) as SimpleServiceHealth;
            setOrchestrator(or);

            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }

        setLastRefreshed(new Date());
        setLoading(false);
    }, []);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchAll();
        setRefreshing(false);
    }, [fetchAll]);

    useEffect(() => {
        void fetchAll();
        const interval = setInterval(() => {
            void fetchAll();
        }, 30_000);
        return () => {
            clearInterval(interval);
        };
    }, [fetchAll]);

    const openCount = circuits.filter((c) => c.state === 'open').length;

    return (
        <div>
            {/* Header bar */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                }}
            >
                {lastRefreshed !== null && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                        Last updated: {lastRefreshed.toLocaleTimeString()}
                    </span>
                )}
                <button
                    onClick={() => {
                        void handleRefresh();
                    }}
                    disabled={refreshing}
                    style={{
                        padding: '0.35rem 0.8rem',
                        fontSize: '0.8rem',
                        borderRadius: '0.35rem',
                        border: '1px solid var(--line)',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        cursor: refreshing ? 'not-allowed' : 'pointer',
                        opacity: refreshing ? 0.6 : 1,
                    }}
                >
                    ↻ Refresh
                </button>
            </div>

            {/* Global error banner */}
            {error !== null && (
                <div
                    style={{
                        marginBottom: '1rem',
                        padding: '0.75rem',
                        background: '#fee2e2',
                        color: '#991b1b',
                        borderRadius: '0.35rem',
                        fontSize: '0.875rem',
                    }}
                >
                    Failed to load health data. {error}
                </div>
            )}

            {/* 2×2 grid */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1.5rem',
                }}
            >
                {/* ── Panel 1: Gateway Status ───────────────────────────────── */}
                <div style={PANEL_STYLE}>
                    <p style={PANEL_TITLE_STYLE}>API Gateway</p>
                    {loading ? (
                        <PanelSkeleton />
                    ) : gateway !== null ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                    style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--ink-muted)',
                                        width: '6rem',
                                        flexShrink: 0,
                                    }}
                                >
                                    Status
                                </span>
                                <InlineBadge
                                    badgeStyle={resolveBadge(STATUS_BADGE, gateway.status)}
                                    label={gateway.status}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                    style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--ink-muted)',
                                        width: '6rem',
                                        flexShrink: 0,
                                    }}
                                >
                                    Database
                                </span>
                                <InlineBadge
                                    badgeStyle={resolveBadge(STATUS_BADGE, gateway.db)}
                                    label={gateway.db}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                    style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--ink-muted)',
                                        width: '6rem',
                                        flexShrink: 0,
                                    }}
                                >
                                    Uptime
                                </span>
                                <span style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>
                                    {formatUptime(gateway.uptime)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                    style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--ink-muted)',
                                        width: '6rem',
                                        flexShrink: 0,
                                    }}
                                >
                                    Memory
                                </span>
                                <span style={{ fontSize: '0.875rem', color: 'var(--ink)' }}>
                                    {gateway.memoryMb} MB heap used
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span
                                    style={{
                                        fontSize: '0.8rem',
                                        color: 'var(--ink-muted)',
                                        width: '6rem',
                                        flexShrink: 0,
                                    }}
                                >
                                    Last checked
                                </span>
                                <span style={{ fontSize: '0.875rem', color: 'var(--ink-muted)' }}>
                                    {new Date(gateway.ts).toLocaleTimeString()}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <p style={{ fontSize: '0.875rem', color: '#991b1b', margin: 0 }}>
                            Gateway unreachable
                        </p>
                    )}
                </div>

                {/* ── Panel 2: Circuit Breakers ─────────────────────────────── */}
                <div style={PANEL_STYLE}>
                    <p style={PANEL_TITLE_STYLE}>Circuit Breakers</p>
                    <div
                        style={{
                            marginBottom: '0.75rem',
                            padding: '0.5rem 0.75rem',
                            background: '#fef9c3',
                            color: '#854d0e',
                            borderRadius: '0.35rem',
                            fontSize: '0.75rem',
                        }}
                    >
                        ⚠ State is in-memory and resets on server restart.
                    </div>
                    {loading ? (
                        <PanelSkeleton />
                    ) : circuits.length === 0 ? (
                        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', margin: 0 }}>
                            No circuit breakers registered.
                        </p>
                    ) : (
                        <>
                            <p
                                style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--ink-muted)',
                                    marginBottom: '0.75rem',
                                    marginTop: 0,
                                }}
                            >
                                {openCount} open / {circuits.length} total
                            </p>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['Key', 'State', 'Failures', 'Successes', 'Next Retry'].map(
                                            (h) => (
                                                <th key={h} style={TABLE_TH_STYLE}>
                                                    {h}
                                                </th>
                                            ),
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {circuits.map((c) => (
                                        <tr key={c.key}>
                                            <td
                                                style={{
                                                    ...TABLE_TD_STYLE,
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.78rem',
                                                }}
                                            >
                                                {c.key}
                                            </td>
                                            <td style={TABLE_TD_STYLE}>
                                                <InlineBadge
                                                    badgeStyle={resolveBadge(CIRCUIT_BADGE, c.state)}
                                                    label={c.state}
                                                />
                                            </td>
                                            <td style={TABLE_TD_STYLE}>{c.failureCount}</td>
                                            <td style={TABLE_TD_STYLE}>{c.successCount}</td>
                                            <td
                                                style={{
                                                    ...TABLE_TD_STYLE,
                                                    color: 'var(--ink-muted)',
                                                }}
                                            >
                                                {c.nextRetryAt !== null
                                                    ? new Date(c.nextRetryAt).toLocaleTimeString()
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>

                {/* ── Panel 3: Task Queue ───────────────────────────────────── */}
                <div style={PANEL_STYLE}>
                    <p style={PANEL_TITLE_STYLE}>Task Queue</p>
                    {loading ? (
                        <PanelSkeleton />
                    ) : queue !== null ? (
                        <>
                            <p
                                style={{
                                    fontSize: '2rem',
                                    fontWeight: 700,
                                    color: 'var(--ink)',
                                    marginBottom: '0.5rem',
                                    marginTop: 0,
                                }}
                            >
                                {queue.depth}{' '}
                                <span
                                    style={{
                                        fontSize: '1rem',
                                        fontWeight: 400,
                                        color: 'var(--ink-muted)',
                                    }}
                                >
                                    waiting
                                </span>
                            </p>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: '0.5rem',
                                    marginBottom: '0.75rem',
                                }}
                            >
                                {(
                                    [
                                        {
                                            label: 'High',
                                            priority: 'high',
                                            bg: '#fee2e2',
                                            color: '#991b1b',
                                        },
                                        {
                                            label: 'Normal',
                                            priority: 'normal',
                                            bg: '#dbeafe',
                                            color: '#1e40af',
                                        },
                                        {
                                            label: 'Low',
                                            priority: 'low',
                                            bg: '#f1f5f9',
                                            color: '#475569',
                                        },
                                    ] as const
                                ).map(({ label, priority, bg, color }) => (
                                    <div
                                        key={priority}
                                        style={{
                                            flex: 1,
                                            padding: '0.4rem 0.5rem',
                                            background: bg,
                                            borderRadius: '0.35rem',
                                            textAlign: 'center',
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: '1.1rem',
                                                fontWeight: 700,
                                                color,
                                            }}
                                        >
                                            {
                                                queue.snapshot.filter(
                                                    (e) => e.priority === priority,
                                                ).length
                                            }
                                        </div>
                                        <div
                                            style={{
                                                fontSize: '0.7rem',
                                                color,
                                                fontWeight: 600,
                                            }}
                                        >
                                            {label}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p
                                style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--ink-muted)',
                                    margin: 0,
                                }}
                            >
                                Queue depth is in-memory only.
                            </p>
                        </>
                    ) : (
                        <p style={{ fontSize: '0.875rem', color: 'var(--ink-muted)', margin: 0 }}>
                            Queue status unavailable.
                        </p>
                    )}
                </div>

                {/* ── Panel 4: Connector Health ─────────────────────────────── */}
                <div style={PANEL_STYLE}>
                    <p style={PANEL_TITLE_STYLE}>Connectors</p>
                    {loading ? (
                        <PanelSkeleton />
                    ) : connectors.length === 0 ? (
                        <div
                            style={{
                                padding: '0.5rem 0.75rem',
                                background: '#fef9c3',
                                color: '#854d0e',
                                borderRadius: '0.35rem',
                                fontSize: '0.8rem',
                            }}
                        >
                            No connector health data available. Connector health monitor may be in stub
                            mode.
                        </div>
                    ) : (
                        <>
                            <p
                                style={{
                                    fontSize: '0.8rem',
                                    color: 'var(--ink-muted)',
                                    marginBottom: '0.75rem',
                                    marginTop: 0,
                                }}
                            >
                                {connectors.length} connectors monitored
                            </p>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        {['ID', 'Status'].map((h) => (
                                            <th key={h} style={TABLE_TH_STYLE}>
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {connectors.map((c) => (
                                        <tr key={c.id}>
                                            <td
                                                style={{
                                                    ...TABLE_TD_STYLE,
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.78rem',
                                                }}
                                            >
                                                {c.id}
                                            </td>
                                            <td style={TABLE_TD_STYLE}>
                                                <InlineBadge
                                                    badgeStyle={resolveBadge(
                                                        CONNECTOR_BADGE,
                                                        c.status,
                                                    )}
                                                    label={c.status}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            </div>

            {/* ── Row 2: Agent Runtime + Trigger Service + Orchestrator ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>

                {/* Agent Runtime */}
                <div style={PANEL_STYLE}>
                    <p style={PANEL_TITLE_STYLE}>
                        Agent Runtime
                        <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 500, color: 'var(--ink-muted)' }}>port 4000</span>
                    </p>
                    {loading ? <PanelSkeleton /> : agentRuntime === null ? (
                        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>No data</p>
                    ) : !agentRuntime.reachable ? (
                        <div style={{ padding: '0.5rem 0.75rem', borderRadius: 8, background: '#fee2e2', border: '1px solid #fca5a5' }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>⚠ Unreachable</p>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#b91c1c' }}>Agent Runtime is not responding. Agents cannot execute tasks.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                                <InlineBadge badgeStyle={agentRuntime.ok ? { bg: '#dcfce7', color: '#166534' } : { bg: '#fee2e2', color: '#991b1b' }} label={agentRuntime.state ?? 'unknown'} />
                                {agentRuntime.worker_loop_running && <InlineBadge badgeStyle={{ bg: '#dbeafe', color: '#1e40af' }} label="worker ✓" />}
                                {agentRuntime.heartbeat_loop_running && <InlineBadge badgeStyle={{ bg: '#dbeafe', color: '#1e40af' }} label="heartbeat ✓" />}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <tbody>
                                    {[
                                        { label: 'Queue depth',      value: agentRuntime.task_queue_depth ?? 0 },
                                        { label: 'Active slots',     value: `${agentRuntime.active_task_slots ?? 0} / ${agentRuntime.max_concurrent_tasks ?? '—'}` },
                                        { label: 'Processed tasks',  value: agentRuntime.processed_tasks ?? 0 },
                                        { label: 'Succeeded',        value: agentRuntime.succeeded_tasks ?? 0 },
                                        { label: 'Failed',           value: agentRuntime.failed_tasks ?? 0 },
                                        { label: 'Pending approvals',value: agentRuntime.pending_approval_tasks ?? 0 },
                                        { label: 'Heartbeats sent',  value: agentRuntime.heartbeat_sent ?? 0 },
                                        { label: 'Heartbeat fails',  value: agentRuntime.heartbeat_failed ?? 0 },
                                    ].map(({ label, value }) => (
                                        <tr key={label}>
                                            <td style={{ ...TABLE_TD_STYLE, color: 'var(--ink-muted)', paddingLeft: 0 }}>{label}</td>
                                            <td style={{ ...TABLE_TD_STYLE, fontWeight: 600, textAlign: 'right' }}>{String(value)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>

                {/* Trigger Service */}
                <div style={PANEL_STYLE}>
                    <p style={PANEL_TITLE_STYLE}>
                        Trigger Service
                        <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 500, color: 'var(--ink-muted)' }}>port 3002</span>
                    </p>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                        Handles inbound webhooks, IMAP email, and Slack triggers. Routes events to agents.
                    </p>
                    {loading ? <PanelSkeleton /> : triggerSvc === null ? (
                        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>No data</p>
                    ) : !triggerSvc.reachable ? (
                        <div style={{ padding: '0.5rem 0.75rem', borderRadius: 8, background: '#fee2e2', border: '1px solid #fca5a5' }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>⚠ Unreachable</p>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#b91c1c' }}>Inbound webhooks and email triggers are not being processed.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: '0.6rem' }}>
                                <InlineBadge badgeStyle={triggerSvc.status === 'ok' ? { bg: '#dcfce7', color: '#166534' } : { bg: '#fef9c3', color: '#854d0e' }} label={triggerSvc.status ?? 'unknown'} />
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ ...TABLE_TD_STYLE, color: 'var(--ink-muted)', paddingLeft: 0 }}>Service</td>
                                        <td style={{ ...TABLE_TD_STYLE, fontWeight: 600, textAlign: 'right' }}>trigger-service</td>
                                    </tr>
                                    {triggerSvc.timestamp && (
                                        <tr>
                                            <td style={{ ...TABLE_TD_STYLE, color: 'var(--ink-muted)', paddingLeft: 0 }}>Last checked</td>
                                            <td style={{ ...TABLE_TD_STYLE, fontWeight: 600, textAlign: 'right' }}>
                                                {new Date(triggerSvc.timestamp).toLocaleTimeString()}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>

                {/* Orchestrator */}
                <div style={PANEL_STYLE}>
                    <p style={PANEL_TITLE_STYLE}>
                        Orchestrator
                        <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 500, color: 'var(--ink-muted)' }}>port 3011</span>
                    </p>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                        GOAP multi-agent planner, routine schedulers, and handoff coordinator.
                    </p>
                    {loading ? <PanelSkeleton /> : orchestrator === null ? (
                        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>No data</p>
                    ) : !orchestrator.reachable ? (
                        <div style={{ padding: '0.5rem 0.75rem', borderRadius: 8, background: '#fee2e2', border: '1px solid #fca5a5' }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b', fontWeight: 600 }}>⚠ Unreachable</p>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#b91c1c' }}>Multi-agent workflows and scheduled routines are not running.</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: '0.6rem' }}>
                                <InlineBadge badgeStyle={orchestrator.status === 'ok' ? { bg: '#dcfce7', color: '#166534' } : { bg: '#fef9c3', color: '#854d0e' }} label={orchestrator.status ?? 'unknown'} />
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ ...TABLE_TD_STYLE, color: 'var(--ink-muted)', paddingLeft: 0 }}>Service</td>
                                        <td style={{ ...TABLE_TD_STYLE, fontWeight: 600, textAlign: 'right' }}>orchestrator</td>
                                    </tr>
                                    {orchestrator.service && (
                                        <tr>
                                            <td style={{ ...TABLE_TD_STYLE, color: 'var(--ink-muted)', paddingLeft: 0 }}>Identity</td>
                                            <td style={{ ...TABLE_TD_STYLE, fontWeight: 600, textAlign: 'right' }}>{orchestrator.service}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
