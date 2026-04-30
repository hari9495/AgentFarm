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

type CapabilitySnapshotResponse = {
    snapshot?: {
        allowedActions?: string[];
    };
};

type ConnectorHealth = {
    connector_id: string;
    connector_type: string;
    status: string;
    last_error_code: string | null;
    last_error_message: string | null;
};

type InternalLoginPolicySnapshot = {
    allowed_domains_count: number;
    admin_roles_count: number;
    deny_all_mode: boolean;
    source: 'live' | 'fallback';
    fetched_at: string;
};

type Props = {
    botId: string;
    connectors: ConnectorHealth[];
    internalPolicy: InternalLoginPolicySnapshot;
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

export function RuntimeObservabilityPanel({
    botId,
    connectors,
    internalPolicy,
    initialLogs,
    initialTransitions,
    initialCurrentState,
    initialHealth,
}: Props) {
    const [drilldownTarget, setDrilldownTarget] = useState<'heartbeat' | 'state' | 'connector' | null>(null);
    const [logs, setLogs] = useState<RuntimeLogEntry[]>(initialLogs);
    const [transitions, setTransitions] = useState<RuntimeStateTransition[]>(initialTransitions);
    const [currentState, setCurrentState] = useState<string>(initialCurrentState);
    const [health, setHealth] = useState<RuntimeHealthSnapshot>(initialHealth);
    const [workspaceActions, setWorkspaceActions] = useState<string[]>([]);

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
            const [logsRes, stateRes, healthRes, capabilityRes] = await Promise.all([
                fetch(`/api/runtime/${encodeURIComponent(botId)}/logs?limit=50`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/state?limit=20`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/health`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/capability`),
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
            if (capabilityRes.ok) {
                const capabilityData = (await capabilityRes.json()) as CapabilitySnapshotResponse;
                const actions = Array.isArray(capabilityData.snapshot?.allowedActions)
                    ? capabilityData.snapshot.allowedActions
                    : [];
                setWorkspaceActions(actions.filter((action) => action.startsWith('workspace_')).sort((a, b) => a.localeCompare(b)));
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
    const degradedConnectors = connectors.filter((item) => item.status === 'degraded' || item.status === 'token_expired');
    const hasHeartbeatIncident = (health.heartbeat_failed ?? 0) > 0;
    const hasStateIncident = currentState === 'degraded';
    const highlightedWorkspaceActions = [
        'workspace_github_issue_triage',
        'workspace_azure_deploy_plan',
        'workspace_subagent_spawn',
    ];

    const renderDrilldown = () => {
        if (!drilldownTarget) {
            return null;
        }

        if (drilldownTarget === 'heartbeat') {
            return (
                <div className="message-inline panel-stack">
                    <strong>Heartbeat incident drilldown</strong>
                    <p style={{ margin: '0.35rem 0 0' }}>
                        Failed heartbeats: {health.heartbeat_failed ?? 0}, sent: {health.heartbeat_sent ?? 0}. Review runtime network path,
                        then run runbook step: restart heartbeat loop and confirm recovery in health endpoint.
                    </p>
                </div>
            );
        }

        if (drilldownTarget === 'state') {
            const recent = transitions.slice(0, 5);
            return (
                <div className="message-inline panel-stack">
                    <strong>State incident drilldown</strong>
                    <p style={{ margin: '0.35rem 0 0.4rem' }}>
                        Latest transitions into degraded path. Runbook step: inspect recent runtime errors and clear blocker before forcing restart.
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                        {recent.map((item, index) => (
                            <li key={`${item.at}-${index}`}>
                                {formatTs(item.at)}: {item.from} -&gt; {item.to} {item.reason ? `(${item.reason})` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            );
        }

        return (
            <div className="message-inline panel-stack">
                <strong>Connector incident drilldown</strong>
                <p style={{ margin: '0.35rem 0 0.4rem' }}>
                    Degraded connectors detected. Runbook step: re-authorize expired tokens and retry connector health checks.
                </p>
                <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                    {degradedConnectors.map((connector) => (
                        <li key={connector.connector_id}>
                            {connector.connector_type}: {connector.last_error_code ?? connector.status}
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    return (
        <article className="card">
            <div className="obs-header">
                <div>
                    <h2 className="obs-title">Runtime Observability</h2>
                    <p className="obs-meta">
                        Bot <code>{botId}</code>
                        {lastRefreshed && (
                            <> &mdash; last refreshed {lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</>
                        )}
                        {refreshError && (
                            <> &mdash; <span className="obs-error">{refreshError}</span></>
                        )}
                    </p>
                </div>

                <div className="obs-policy-row">
                    <span className={`badge ${internalPolicy.source === 'live' ? 'low' : 'warn'}`}>
                        policy source {internalPolicy.source}
                    </span>
                    <span className="badge neutral">policy checked {formatTs(internalPolicy.fetched_at)}</span>
                    <span className={`badge ${internalPolicy.deny_all_mode ? 'high' : 'low'}`}>
                        deny_all_mode {internalPolicy.deny_all_mode ? 'enabled' : 'disabled'}
                    </span>
                    <span className="badge neutral">domains {internalPolicy.allowed_domains_count}</span>
                    <span className="badge neutral">admin roles {internalPolicy.admin_roles_count}</span>
                </div>

                {/* Kill switch */}
                <div>
                    {killEngaged ? (
                        <span className="badge high">
                            Kill switch engaged
                        </span>
                    ) : killConfirm ? (
                        <span className="obs-kill-row">
                            <span className="obs-kill-note">Confirm shutdown?</span>
                            <button
                                onClick={() => void handleKillConfirm()}
                                disabled={killPending}
                                className="danger-action"
                            >
                                {killPending ? 'Engaging...' : 'Yes, shutdown'}
                            </button>
                            <button
                                onClick={handleKillCancel}
                                disabled={killPending}
                                className="secondary-action"
                            >
                                Cancel
                            </button>
                        </span>
                    ) : (
                        <button
                            onClick={handleKillClick}
                            className="danger-action"
                        >
                            Kill Switch
                        </button>
                    )}
                    {killMessage && (
                        <p className="obs-kill-message" style={{ color: killEngaged ? '#166534' : '#dc2626' }}>
                            {killMessage}
                        </p>
                    )}
                </div>
            </div>

            <div className="panel-badge-row panel-stack" style={{ marginBottom: 0 }}>
                <button type="button" className={`chip-button ${drilldownTarget === 'heartbeat' ? 'active' : ''}`} onClick={() => setDrilldownTarget('heartbeat')}>
                    Heartbeat Incident {hasHeartbeatIncident ? 'Detected' : 'Clear'}
                </button>
                <button type="button" className={`chip-button ${drilldownTarget === 'state' ? 'active' : ''}`} onClick={() => setDrilldownTarget('state')}>
                    State Incident {hasStateIncident ? 'Degraded' : 'Stable'}
                </button>
                <button type="button" className={`chip-button ${drilldownTarget === 'connector' ? 'active' : ''}`} onClick={() => setDrilldownTarget('connector')}>
                    Connector Incident {degradedConnectors.length > 0 ? `${degradedConnectors.length}` : '0'}
                </button>
                {drilldownTarget && (
                    <button type="button" className="chip-button" onClick={() => setDrilldownTarget(null)}>
                        Close Drilldown
                    </button>
                )}
            </div>
            {renderDrilldown()}

            {/* Current state + state machine */}
            <div className="obs-section">
                <p className="obs-section-title">State machine</p>
                <div className="obs-state-machine">
                    {ORDERED_STATES.map((state, i) => (
                        <span key={state} className="obs-state-node">
                            <span style={statePillStyle(state, state === currentState)}>{state}</span>
                            {i < ORDERED_STATES.length - 1 && (
                                <span className="obs-state-arrow">→</span>
                            )}
                        </span>
                    ))}
                    {!ORDERED_STATES.includes(currentState) && (
                        <span style={statePillStyle(currentState, true)}>{currentState}</span>
                    )}
                </div>
            </div>

            {/* Heartbeat + task metrics */}
            <div className="obs-metrics-grid">
                <div>
                    <p className="obs-metric-label">Heartbeat loop</p>
                    <p className="obs-metric-value" style={{ color: health.heartbeat_loop_running ? '#16a34a' : '#dc2626' }}>
                        {health.heartbeat_loop_running ? 'running' : 'stopped'}
                    </p>
                </div>
                <div>
                    <p className="obs-metric-label">Sent / Failed</p>
                    <p className="obs-metric-value">
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
                    <p className="obs-metric-label">Last heartbeat</p>
                    <p className="obs-metric-value subtle">
                        {health.last_heartbeat_at ? formatTs(health.last_heartbeat_at) : 'none'}
                    </p>
                </div>
                <div>
                    <p className="obs-metric-label">Tasks processed</p>
                    <p className="obs-metric-value">
                        <span style={{ color: '#16a34a' }}>{health.succeeded_tasks ?? 0}</span>
                        {' ok / '}
                        <span style={{ color: (health.failed_tasks ?? 0) > 0 ? '#dc2626' : '#374151' }}>
                            {health.failed_tasks ?? 0}
                        </span>
                        {' fail'}
                    </p>
                </div>
                <div>
                    <p className="obs-metric-label">Queue depth</p>
                    <p className="obs-metric-value" style={{ color: (health.task_queue_depth ?? 0) > 0 ? '#f59e0b' : '#374151' }}>
                        {health.task_queue_depth ?? 0}
                    </p>
                </div>
            </div>

            {/* State transition history */}
            <div className="obs-section">
                <p className="obs-section-title">
                    State transitions ({transitions.length})
                </p>
                {transitions.length === 0 ? (
                    <p className="obs-muted-empty">No transitions recorded yet.</p>
                ) : (
                    <div className="obs-transition-list">
                        {transitions.map((t, i) => (
                            <div key={i} className="obs-transition-item">
                                <span className="obs-transition-time">{formatTs(t.at)}</span>
                                <span className="obs-transition-from">{t.from}</span>
                                <span className="obs-state-arrow">→</span>
                                <span className="obs-transition-to" style={{ color: STATE_COLORS[t.to] ?? '#374151' }}>{t.to}</span>
                                {t.reason && (
                                    <span className="obs-transition-reason">
                                        — {t.reason}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="obs-section">
                <p className="obs-section-title">
                    Available workspace actions ({workspaceActions.length})
                </p>
                {workspaceActions.length === 0 ? (
                    <p className="obs-muted-empty">Capability snapshot not available yet.</p>
                ) : (
                    <>
                        <div className="panel-badge-row" style={{ marginBottom: '0.6rem' }}>
                            {highlightedWorkspaceActions.map((action) => (
                                <span
                                    key={action}
                                    className={`badge ${workspaceActions.includes(action) ? 'low' : 'warn'}`}
                                >
                                    {action}
                                </span>
                            ))}
                        </div>
                        <div className="obs-transition-list" style={{ maxHeight: '11rem', overflowY: 'auto' }}>
                            {workspaceActions.map((action) => (
                                <div key={action} className="obs-transition-item">
                                    <span className="obs-transition-to" style={{ color: '#1d4ed8' }}>{action}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Log feed */}
            <div className="obs-section">
                <div className="obs-log-toolbar">
                    <p className="obs-section-title" style={{ marginBottom: 0 }}>
                        Runtime logs ({filteredLogs.length}{logFilter ? ` of ${logs.length}` : ''})
                    </p>
                    <input
                        type="text"
                        placeholder="Filter by event, state, or correlation ID..."
                        value={logFilter}
                        onChange={(e) => setLogFilter(e.target.value)}
                        className="obs-log-input"
                    />
                </div>

                {filteredLogs.length === 0 ? (
                    <p className="obs-muted-empty">
                        {logFilter ? 'No logs match the filter.' : 'No logs buffered yet.'}
                    </p>
                ) : (
                    <div className="obs-log-console">
                        {filteredLogs.map((log, i) => (
                            <div key={i}>
                                <div
                                    className={`obs-log-line ${log.details ? 'clickable' : ''}`}
                                    onClick={() => { if (log.details) toggleDetails(i); }}
                                >
                                    <span className="obs-log-time">{formatTs(log.at)}</span>
                                    <span
                                        className="obs-log-event"
                                        style={{
                                            color: EVENT_TYPE_BADGE[log.eventType] === 'high' ? '#f87171'
                                                : EVENT_TYPE_BADGE[log.eventType] === 'low' ? '#86efac'
                                                    : EVENT_TYPE_BADGE[log.eventType] === 'medium' ? '#fcd34d'
                                                        : '#94a3b8',
                                        }}
                                    >
                                        {log.eventType}
                                    </span>
                                    <span className="obs-log-state" style={{ color: STATE_COLORS[log.runtimeState] ?? '#94a3b8' }}>
                                        [{log.runtimeState}]
                                    </span>
                                    {log.correlationId && (
                                        <span className="obs-log-correlation">
                                            corr:{log.correlationId}
                                        </span>
                                    )}
                                    {log.details && (
                                        <span className="obs-log-details-toggle">
                                            {showDetails[i] ? '▲' : '▼'} details
                                        </span>
                                    )}
                                </div>
                                {log.details && showDetails[i] && (
                                    <pre className="obs-log-details">
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
