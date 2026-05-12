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
    const [gateway, setGateway] = useState<GatewayStatus | null>(null);
    const [circuits, setCircuits] = useState<CircuitEntry[]>([]);
    const [queue, setQueue] = useState<QueueStatus | null>(null);
    const [connectors, setConnectors] = useState<ConnectorStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchAll = useCallback(async () => {
        try {
            const [gwRes, cbRes, tqRes, cnRes] = await Promise.all([
                fetch('/api/health/gateway', { cache: 'no-store' }),
                fetch('/api/health/circuit-breakers', { cache: 'no-store' }),
                fetch('/api/health/task-queue', { cache: 'no-store' }),
                fetch('/api/health/connectors', { cache: 'no-store' }),
            ]);

            // Gateway
            if (gwRes.ok) {
                const gw = (await gwRes.json().catch(() => null)) as GatewayStatus | null;
                setGateway(gw);
            } else {
                setGateway(null);
            }

            // Circuit breakers
            if (cbRes.ok) {
                const cb = (await cbRes.json().catch(() => null)) as { circuits: CircuitEntry[] } | null;
                setCircuits(cb?.circuits ?? []);
            } else {
                setCircuits([]);
            }

            // Task queue
            if (tqRes.ok) {
                const tq = (await tqRes.json().catch(() => null)) as QueueStatus | null;
                setQueue(tq);
            } else {
                setQueue(null);
            }

            // Connectors
            if (cnRes.ok) {
                const cn = (await cnRes.json().catch(() => null)) as { statuses: ConnectorStatus[] } | null;
                setConnectors(cn?.statuses ?? []);
            } else {
                setConnectors([]);
            }

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
        </div>
    );
}
