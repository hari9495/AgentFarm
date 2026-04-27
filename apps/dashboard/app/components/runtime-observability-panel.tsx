'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeHeartbeatSuccessRate, filterRuntimeLogs, type RuntimeLogEntry } from './runtime-observability-utils';

type RuntimeStateTransition = {
    at: string;
    from: string;
    to: string;
    reason?: string | null;
};

type RuntimeHealthSnapshot = {
    status?: string;
    runtime_state?: string;
    heartbeat_loop_running?: boolean;
    heartbeat_sent?: number;
    heartbeat_failed?: number;
    last_heartbeat_at?: string | null;
    task_queue_depth?: number;
    processed_tasks?: number;
    succeeded_tasks?: number;
    failed_tasks?: number;
};

type Props = {
    botId: string;
    initialLogs: RuntimeLogEntry[];
    initialTransitions: RuntimeStateTransition[];
    initialCurrentState: string;
    initialHealth: RuntimeHealthSnapshot;
};

const STATE_COLORS: Record<string, string> = {
    created: '#6366f1',
    starting: '#f59e0b',
    ready: '#3b82f6',
    active: '#22c55e',
    stopping: '#f97316',
    stopped: '#6b7280',
    degraded: '#ef4444',
};

const EVENT_TYPE_BADGE: Record<string, string> = {
    'runtime.task_classified': 'low',
    'runtime.approval_required': 'high',
    'runtime.task_succeeded': 'low',
    'runtime.task_failed': 'high',
    'runtime.state_transition': 'medium',
    'runtime.heartbeat_sent': 'neutral',
    'runtime.heartbeat_failed': 'high',
    'runtime.started': 'low',
    'runtime.shutdown': 'warn',
};

const ORDERED_STATES = ['created', 'starting', 'ready', 'active', 'stopping', 'stopped'];

const POLL_INTERVAL_MS = 10_000;

const formatTs = (iso: string): string => {
    try {
        return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return iso;
    }
};

const statePillStyle = (state: string, isCurrent: boolean) => ({
    padding: '0.25rem 0.6rem',
    borderRadius: 999,
    fontSize: '0.75rem',
    fontWeight: isCurrent ? 700 : 400,
    background: isCurrent ? (STATE_COLORS[state] ?? '#6b7280') : '#e5e7eb',
    color: isCurrent ? '#fff' : '#374151',
    border: isCurrent ? `2px solid ${STATE_COLORS[state] ?? '#6b7280'}` : '2px solid transparent',
    opacity: isCurrent ? 1 : 0.6,
});

export function RuntimeObservabilityPanel({ botId, initialLogs, initialTransitions, initialCurrentState, initialHealth }: Props) {
    const [logs, setLogs] = useState<RuntimeLogEntry[]>(initialLogs);
    const [transitions, setTransitions] = useState<RuntimeStateTransition[]>(initialTransitions);
    const [currentState, setCurrentState] = useState<string>(initialCurrentState);
    const [health, setHealth] = useState<RuntimeHealthSnapshot>(initialHealth);

    const [logFilter, setLogFilter] = useState<string>('');
    const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});

    const [killPending, setKillPending] = useState(false);
    const [killConfirm, setKillConfirm] = useState(false);
    const [killMessage, setKillMessage] = useState<string | null>(null);
    const [killEngaged, setKillEngaged] = useState(false);

    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [logsRes, stateRes, healthRes] = await Promise.all([
                fetch(`/api/runtime/${encodeURIComponent(botId)}/logs?limit=50`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/state?limit=20`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/health`),
            ]);

            if (logsRes.ok) {
                const logsData = (await logsRes.json()) as { logs?: RuntimeLogEntry[] };
                setLogs(logsData.logs ?? []);
            }
            if (stateRes.ok) {
                const stateData = (await stateRes.json()) as { transitions?: RuntimeStateTransition[]; current_state?: string };
                setTransitions(stateData.transitions ?? []);
                if (stateData.current_state) setCurrentState(stateData.current_state);
            }
            if (healthRes.ok) {
                const healthData = (await healthRes.json()) as RuntimeHealthSnapshot;
                setHealth(healthData);
            }

            setLastRefreshed(new Date());
            setRefreshError(null);
        } catch {
            setRefreshError('Failed to reach runtime.');
        }
    }, [botId]);

    useEffect(() => {
        pollRef.current = setInterval(() => {
            if (!killEngaged) void refresh();
        }, POLL_INTERVAL_MS);
        return () => {
            if (pollRef.current !== null) clearInterval(pollRef.current);
        };
    }, [refresh, killEngaged]);

    const handleKillClick = () => {
        setKillConfirm(true);
        setKillMessage(null);
    };

    const handleKillConfirm = async () => {
        setKillPending(true);
        setKillMessage(null);
        try {
            const res = await fetch(`/api/runtime/${encodeURIComponent(botId)}/kill`, { method: 'POST' });
            if (res.ok) {
                setKillEngaged(true);
                setKillMessage('Kill switch engaged. Runtime is shutting down.');
            } else {
                const errData = (await res.json()) as { message?: string };
                setKillMessage(errData.message ?? `Error ${res.status}`);
            }
        } catch {
            setKillMessage('Network error — could not reach kill endpoint.');
        } finally {
            setKillPending(false);
            setKillConfirm(false);
        }
    };

    const handleKillCancel = () => {
        setKillConfirm(false);
    };

    const filteredLogs = filterRuntimeLogs(logs, logFilter);

    const toggleDetails = (index: number) => {
        setShowDetails((prev) => ({ ...prev, [index]: !prev[index] }));
    };

    const heartbeatSuccessRate = computeHeartbeatSuccessRate(health.heartbeat_sent, health.heartbeat_failed);

    return (
        <article className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                    <h2 style={{ marginBottom: '0.15rem' }}>Runtime Observability</h2>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#78716c' }}>
                        Bot <code style={{ background: '#ece6dc', padding: '0 0.3rem', borderRadius: 4 }}>{botId}</code>
                        {lastRefreshed && (
                            <> &mdash; last refreshed {lastRefreshed.toLocaleTimeString()}</>
                        )}
                        {refreshError && (
                            <> &mdash; <span style={{ color: '#dc2626' }}>{refreshError}</span></>
                        )}
                    </p>
                </div>

                {/* Kill switch */}
                <div>
                    {killEngaged ? (
                        <span className="badge high" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                            Kill switch engaged
                        </span>
                    ) : killConfirm ? (
                        <span style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.82rem', color: '#7f1d1d', fontWeight: 600 }}>Confirm shutdown?</span>
                            <button
                                onClick={() => void handleKillConfirm()}
                                disabled={killPending}
                                style={{
                                    background: '#dc2626',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '0.3rem 0.7rem',
                                    cursor: killPending ? 'wait' : 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                }}
                            >
                                {killPending ? 'Engaging…' : 'Yes, shutdown'}
                            </button>
                            <button
                                onClick={handleKillCancel}
                                disabled={killPending}
                                style={{
                                    background: '#e5e7eb',
                                    color: '#374151',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '0.3rem 0.7rem',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                }}
                            >
                                Cancel
                            </button>
                        </span>
                    ) : (
                        <button
                            onClick={handleKillClick}
                            style={{
                                background: '#fee2e2',
                                color: '#991b1b',
                                border: '1px solid #fca5a5',
                                borderRadius: 6,
                                padding: '0.35rem 0.9rem',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.82rem',
                            }}
                        >
                            Kill Switch
                        </button>
                    )}
                    {killMessage && (
                        <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: killEngaged ? '#166534' : '#dc2626' }}>
                            {killMessage}
                        </p>
                    )}
                </div>
            </div>

            {/* Current state + state machine */}
            <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.78rem', color: '#78716c', margin: '0 0 0.4rem' }}>State machine</p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    {ORDERED_STATES.map((state, i) => (
                        <span key={state} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={statePillStyle(state, state === currentState)}>{state}</span>
                            {i < ORDERED_STATES.length - 1 && (
                                <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>→</span>
                            )}
                        </span>
                    ))}
                    {!ORDERED_STATES.includes(currentState) && (
                        <span style={statePillStyle(currentState, true)}>{currentState}</span>
                    )}
                </div>
            </div>

            {/* Heartbeat + task metrics */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '0.5rem',
                    marginTop: '1rem',
                    background: '#f9fafb',
                    borderRadius: 8,
                    padding: '0.6rem 0.8rem',
                }}
            >
                <div>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Heartbeat loop</p>
                    <p style={{ margin: '0.1rem 0 0', fontWeight: 700, fontSize: '0.9rem', color: health.heartbeat_loop_running ? '#16a34a' : '#dc2626' }}>
                        {health.heartbeat_loop_running ? 'running' : 'stopped'}
                    </p>
                </div>
                <div>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sent / Failed</p>
                    <p style={{ margin: '0.1rem 0 0', fontWeight: 700, fontSize: '0.9rem' }}>
                        <span style={{ color: '#16a34a' }}>{health.heartbeat_sent ?? 0}</span>
                        {' / '}
                        <span style={{ color: (health.heartbeat_failed ?? 0) > 0 ? '#dc2626' : '#374151' }}>
                            {health.heartbeat_failed ?? 0}
                        </span>
                        {heartbeatSuccessRate !== null && (
                            <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 400, marginLeft: '0.25rem' }}>
                                ({heartbeatSuccessRate}%)
                            </span>
                        )}
                    </p>
                </div>
                <div>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Last heartbeat</p>
                    <p style={{ margin: '0.1rem 0 0', fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>
                        {health.last_heartbeat_at ? formatTs(health.last_heartbeat_at) : 'none'}
                    </p>
                </div>
                <div>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tasks processed</p>
                    <p style={{ margin: '0.1rem 0 0', fontWeight: 700, fontSize: '0.9rem' }}>
                        <span style={{ color: '#16a34a' }}>{health.succeeded_tasks ?? 0}</span>
                        {' ok / '}
                        <span style={{ color: (health.failed_tasks ?? 0) > 0 ? '#dc2626' : '#374151' }}>
                            {health.failed_tasks ?? 0}
                        </span>
                        {' fail'}
                    </p>
                </div>
                <div>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Queue depth</p>
                    <p style={{ margin: '0.1rem 0 0', fontWeight: 700, fontSize: '0.9rem', color: (health.task_queue_depth ?? 0) > 0 ? '#f59e0b' : '#374151' }}>
                        {health.task_queue_depth ?? 0}
                    </p>
                </div>
            </div>

            {/* State transition history */}
            <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.78rem', color: '#78716c', margin: '0 0 0.4rem', fontWeight: 600 }}>
                    State transitions ({transitions.length})
                </p>
                {transitions.length === 0 ? (
                    <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>No transitions recorded yet.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {transitions.map((t, i) => (
                            <div
                                key={i}
                                style={{
                                    display: 'flex',
                                    gap: '0.6rem',
                                    alignItems: 'center',
                                    fontSize: '0.8rem',
                                    padding: '0.2rem 0',
                                    borderBottom: i < transitions.length - 1 ? '1px solid #f3f4f6' : undefined,
                                }}
                            >
                                <span style={{ color: '#9ca3af', minWidth: '5.5rem', flexShrink: 0 }}>{formatTs(t.at)}</span>
                                <span style={{ color: '#6b7280' }}>{t.from}</span>
                                <span style={{ color: '#9ca3af' }}>→</span>
                                <span style={{ color: STATE_COLORS[t.to] ?? '#374151', fontWeight: 600 }}>{t.to}</span>
                                {t.reason && (
                                    <span style={{ color: '#9ca3af', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        — {t.reason}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Log feed */}
            <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <p style={{ fontSize: '0.78rem', color: '#78716c', margin: 0, fontWeight: 600 }}>
                        Runtime logs ({filteredLogs.length}{logFilter ? ` of ${logs.length}` : ''})
                    </p>
                    <input
                        type="text"
                        placeholder="Filter by event, state, or correlation ID…"
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value)}
                        style={{
                            flex: 1,
                            minWidth: 180,
                            fontSize: '0.78rem',
                            padding: '0.25rem 0.5rem',
                            border: '1px solid #d1d5db',
                            borderRadius: 5,
                            outline: 'none',
                        }}
                    />
                </div>

                {filteredLogs.length === 0 ? (
                    <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: 0 }}>
                        {logFilter ? 'No logs match the filter.' : 'No logs buffered yet.'}
                    </p>
                ) : (
                    <div
                        style={{
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                            background: '#1c1917',
                            color: '#d6d3d1',
                            borderRadius: 8,
                            padding: '0.6rem 0.8rem',
                            maxHeight: '22rem',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.15rem',
                        }}
                    >
                        {filteredLogs.map((log, i) => (
                            <div key={i}>
                                <div
                                    style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', cursor: log.details ? 'pointer' : 'default' }}
                                    onClick={() => { if (log.details) toggleDetails(i); }}
                                >
                                    <span style={{ color: '#a8a29e', minWidth: '5.5rem', flexShrink: 0 }}>{formatTs(log.at)}</span>
                                    <span
                                        style={{
                                            padding: '0 0.4rem',
                                            borderRadius: 4,
                                            background: '#292524',
                                            color: EVENT_TYPE_BADGE[log.eventType] === 'high' ? '#f87171'
                                                : EVENT_TYPE_BADGE[log.eventType] === 'low' ? '#86efac'
                                                    : EVENT_TYPE_BADGE[log.eventType] === 'medium' ? '#fcd34d'
                                                        : '#94a3b8',
                                            fontWeight: 600,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {log.eventType}
                                    </span>
                                    <span style={{ color: STATE_COLORS[log.runtimeState] ?? '#94a3b8', flexShrink: 0 }}>
                                        [{log.runtimeState}]
                                    </span>
                                    {log.correlationId && (
                                        <span style={{ color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            corr:{log.correlationId}
                                        </span>
                                    )}
                                    {log.details && (
                                        <span style={{ color: '#57534e', marginLeft: 'auto', flexShrink: 0 }}>
                                            {showDetails[i] ? '▲' : '▼'} details
                                        </span>
                                    )}
                                </div>
                                {log.details && showDetails[i] && (
                                    <pre
                                        style={{
                                            margin: '0.2rem 0 0.3rem 5.5rem',
                                            color: '#a8a29e',
                                            fontSize: '0.72rem',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all',
                                        }}
                                    >
                                        {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </article>
    );
}
