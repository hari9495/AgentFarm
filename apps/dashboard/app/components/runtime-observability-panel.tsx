'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeHeartbeatSuccessRate, filterRuntimeLogs, type RuntimeLogEntry } from './runtime-observability-utils';

type RuntimeStateTransition = {
    at: string;
    from: string;
    to: string;
    reason?: string | null;
};

type RuntimeTranscriptEntry = {
    taskId: string;
    startedAt: string;
    completedAt: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high';
    route: 'execute' | 'approval';
    status: 'success' | 'approval_required' | 'failed';
    durationMs: number;
    errorMessage: string | null;
    approvalRequired: boolean;
    approvalSummary: string | null;
    payloadOverrideSource?: 'none' | 'llm_generated' | 'executor_inferred';
    payloadOverridesApplied?: boolean;
};

type RuntimeInterviewEventEntry = {
    taskId: string;
    actionType: string;
    sessionId: string | null;
    roleTrack: string | null;
    turnIndex: number | null;
    interruptedSpeaking: boolean;
    followUpQuestion: string | null;
    finalRecommendation: string | null;
    sequence: number;
    event: 'partial' | 'final';
    text: string;
    startedAt: string;
    endedAt: string;
    source: 'payload' | 'payload_chunks' | 'live_capture';
    recordedAt: string;
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
    initialTranscripts: RuntimeTranscriptEntry[];
    initialInterviewEvents: RuntimeInterviewEventEntry[];
    initialCurrentState: string;
    initialHealth: RuntimeHealthSnapshot;
};

type WeeklyQualityRoiReport = {
    reportId: string;
    generatedAt: string;
    periodStartedAt: string;
    periodEndedAt: string;
    trigger: 'manual' | 'scheduled';
    completion_quality_pct: number;
    rework_rate_pct: number;
    approval_latency_ms: number;
    audit_completeness_pct: number;
    time_saved_by_task_category: Array<{
        category: string;
        estimated_minutes_saved: number;
    }>;
};

type WeeklyQualityRoiResponse = {
    cadence_ms: number;
    report_count: number;
    last_generated_at: string | null;
    period_started_at: string;
    report: WeeklyQualityRoiReport | null;
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
    initialTranscripts,
    initialInterviewEvents,
    initialCurrentState,
    initialHealth,
}: Props) {
    const [drilldownTarget, setDrilldownTarget] = useState<'heartbeat' | 'state' | 'connector' | null>(null);
    const [logs, setLogs] = useState<RuntimeLogEntry[]>(initialLogs);
    const [transitions, setTransitions] = useState<RuntimeStateTransition[]>(initialTransitions);
    const [transcripts, setTranscripts] = useState<RuntimeTranscriptEntry[]>(initialTranscripts);
    const [interviewEvents, setInterviewEvents] = useState<RuntimeInterviewEventEntry[]>(initialInterviewEvents);
    const [currentState, setCurrentState] = useState<string>(initialCurrentState);
    const [health, setHealth] = useState<RuntimeHealthSnapshot>(initialHealth);
    const [workspaceActions, setWorkspaceActions] = useState<string[]>([]);
    const [weeklyRoiReport, setWeeklyRoiReport] = useState<WeeklyQualityRoiResponse | null>(null);
    const [weeklyRoiBusy, setWeeklyRoiBusy] = useState(false);

    const [logFilter, setLogFilter] = useState<string>('');
    const [showDetails, setShowDetails] = useState<Record<number, boolean>>({});

    const [killPending, setKillPending] = useState(false);
    const [killConfirm, setKillConfirm] = useState(false);
    const [killMessage, setKillMessage] = useState<string | null>(null);
    const [killEngaged, setKillEngaged] = useState(false);

    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<'overview' | 'interview-timeline'>('overview');
    const [interviewFilter, setInterviewFilter] = useState<'all' | 'partial' | 'final'>('all');

    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [logsRes, stateRes, healthRes, capabilityRes, transcriptsRes] = await Promise.all([
                fetch(`/api/runtime/${encodeURIComponent(botId)}/logs?limit=50`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/state?limit=20`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/health`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/capability`),
                fetch(`/api/runtime/${encodeURIComponent(botId)}/transcripts?limit=50`),
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
            if (transcriptsRes.ok) {
                const transcriptData = (await transcriptsRes.json()) as { transcripts?: RuntimeTranscriptEntry[] };
                setTranscripts(transcriptData.transcripts ?? []);
            }
            setLastRefreshed(new Date());
            setRefreshError(null);
        } catch {
            setRefreshError('Failed to reach runtime.');
        }
    }, [botId]);

    const generateWeeklyRoiReport = useCallback(async () => {
        setWeeklyRoiBusy(true);
        try {
            // route removed
        } finally {
            setWeeklyRoiBusy(false);
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

    const filteredInterviewEvents = interviewFilter === 'all'
        ? interviewEvents
        : interviewEvents.filter((e) => e.event === interviewFilter);

    const interviewSessionGroups = (() => {
        const map = new Map<string, RuntimeInterviewEventEntry[]>();
        for (const ev of filteredInterviewEvents) {
            const key = ev.sessionId ?? `task-${ev.taskId}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(ev);
        }
        return Array.from(map.entries()).sort((a, b) => {
            const aLast = a[1][a[1].length - 1]?.recordedAt ?? '';
            const bLast = b[1][b[1].length - 1]?.recordedAt ?? '';
            return bLast.localeCompare(aLast);
        });
    })();

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

            <div className="panel-badge-row" style={{ marginTop: '0.75rem' }}>
                <button type="button" className={`chip-button ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                    Overview
                </button>
                <button type="button" className={`chip-button ${activeTab === 'interview-timeline' ? 'active' : ''}`} onClick={() => setActiveTab('interview-timeline')}>
                    Interview Timeline{interviewEvents.length > 0 ? ` (${interviewEvents.length})` : ''}
                </button>
            </div>

            <div style={{ display: activeTab === 'overview' ? '' : 'none' }}>
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

                <div className="obs-section">
                    <div className="obs-log-toolbar">
                        <p className="obs-section-title" style={{ marginBottom: 0 }}>
                            Weekly quality and ROI report
                        </p>
                        <button
                            type="button"
                            className="chip-button"
                            disabled={weeklyRoiBusy}
                            onClick={() => void generateWeeklyRoiReport()}
                        >
                            {weeklyRoiBusy ? 'Generating…' : 'Generate now'}
                        </button>
                    </div>

                    {!weeklyRoiReport?.report && (
                        <p className="obs-muted-empty">No weekly report generated yet.</p>
                    )}

                    {weeklyRoiReport?.report && (
                        <>
                            <div className="obs-metrics-grid" style={{ marginTop: '0.5rem' }}>
                                <div>
                                    <p className="obs-metric-label">Completion quality</p>
                                    <p className="obs-metric-value">{weeklyRoiReport.report.completion_quality_pct}%</p>
                                </div>
                                <div>
                                    <p className="obs-metric-label">Rework rate</p>
                                    <p className="obs-metric-value">{weeklyRoiReport.report.rework_rate_pct}%</p>
                                </div>
                                <div>
                                    <p className="obs-metric-label">Approval latency</p>
                                    <p className="obs-metric-value">{weeklyRoiReport.report.approval_latency_ms}ms</p>
                                </div>
                                <div>
                                    <p className="obs-metric-label">Audit completeness</p>
                                    <p className="obs-metric-value">{weeklyRoiReport.report.audit_completeness_pct}%</p>
                                </div>
                            </div>

                            <p className="obs-muted-empty" style={{ marginTop: '0.45rem' }}>
                                Trigger: {weeklyRoiReport.report.trigger} · reports: {weeklyRoiReport.report_count} · last generated:{' '}
                                {weeklyRoiReport.last_generated_at ? formatTs(weeklyRoiReport.last_generated_at) : 'n/a'}
                            </p>

                            {weeklyRoiReport.report.time_saved_by_task_category.length > 0 && (
                                <div className="obs-transition-list" style={{ maxHeight: '8rem', overflowY: 'auto' }}>
                                    {weeklyRoiReport.report.time_saved_by_task_category.map((item) => (
                                        <div key={item.category} className="obs-transition-item">
                                            <span className="obs-transition-to" style={{ color: '#1d4ed8' }}>{item.category}</span>
                                            <span className="obs-muted-empty">{item.estimated_minutes_saved} min saved</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="obs-section">
                    <p className="obs-section-title">Recent agent activity ({transcripts.length})</p>
                    {transcripts.length === 0 ? (
                        <p className="obs-muted-empty">No task transcripts recorded yet.</p>
                    ) : (
                        <div className="obs-transition-list" style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                            {[...transcripts].reverse().slice(0, 20).map((entry) => (
                                <div key={`${entry.taskId}:${entry.completedAt}`} className="obs-transition-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                                    <div>
                                        <span className="obs-transition-time">{formatTs(entry.completedAt)}</span>
                                        <span className="obs-transition-to" style={{ color: '#1d4ed8', marginLeft: '0.4rem' }}>{entry.actionType}</span>
                                        <span className={`badge ${entry.status === 'success' ? 'low' : entry.status === 'approval_required' ? 'warn' : 'high'}`} style={{ marginLeft: '0.5rem' }}>
                                            {entry.status}
                                        </span>
                                    </div>
                                    <div className="obs-muted-empty" style={{ marginTop: '0.25rem' }}>
                                        task {entry.taskId} · {entry.durationMs}ms · override {entry.payloadOverrideSource ?? 'none'}
                                        {entry.payloadOverridesApplied ? ' (applied)' : ''}
                                        {entry.errorMessage ? ` · error: ${entry.errorMessage}` : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="obs-section">
                    <p className="obs-section-title">Live interview transcript events ({interviewEvents.length})</p>
                    {interviewEvents.length === 0 ? (
                        <p className="obs-muted-empty">No interview transcript events captured yet.</p>
                    ) : (
                        <div className="obs-transition-list" style={{ maxHeight: '13rem', overflowY: 'auto' }}>
                            {[...interviewEvents].reverse().slice(0, 40).map((event) => (
                                <div key={`${event.taskId}:${event.sequence}:${event.recordedAt}`} className="obs-transition-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                                    <div>
                                        <span className="obs-transition-time">{formatTs(event.recordedAt)}</span>
                                        <span className="obs-transition-to" style={{ color: '#0f766e', marginLeft: '0.4rem' }}>{event.event}</span>
                                        <span className="badge neutral" style={{ marginLeft: '0.5rem' }}>{event.source}</span>
                                        {event.finalRecommendation && (
                                            <span className="badge warn" style={{ marginLeft: '0.5rem' }}>final {event.finalRecommendation}</span>
                                        )}
                                    </div>
                                    <div className="obs-muted-empty" style={{ marginTop: '0.25rem' }}>
                                        session {event.sessionId ?? 'n/a'} · role {event.roleTrack ?? 'n/a'} · turn {event.turnIndex ?? 'n/a'}
                                        {event.interruptedSpeaking ? ' · speaker interrupted' : ''}
                                    </div>
                                    <div style={{ marginTop: '0.25rem', color: '#1f2937', fontSize: '0.82rem' }}>
                                        {event.text}
                                    </div>
                                    {event.followUpQuestion && (
                                        <div className="obs-muted-empty" style={{ marginTop: '0.2rem' }}>
                                            follow-up: {event.followUpQuestion}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
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
            </div>{/* end overview tab wrapper */}

            {activeTab === 'interview-timeline' && (
                <div className="obs-section">
                    <div className="obs-log-toolbar" style={{ marginBottom: '0.6rem' }}>
                        <p className="obs-section-title" style={{ marginBottom: 0 }}>
                            Interview Timeline &mdash; {filteredInterviewEvents.length} event{filteredInterviewEvents.length !== 1 ? 's' : ''} across {interviewSessionGroups.length} session{interviewSessionGroups.length !== 1 ? 's' : ''}
                        </p>
                        <div className="panel-badge-row">
                            <button type="button" className={`chip-button ${interviewFilter === 'all' ? 'active' : ''}`} onClick={() => setInterviewFilter('all')}>All</button>
                            <button type="button" className={`chip-button ${interviewFilter === 'partial' ? 'active' : ''}`} onClick={() => setInterviewFilter('partial')}>Partial</button>
                            <button type="button" className={`chip-button ${interviewFilter === 'final' ? 'active' : ''}`} onClick={() => setInterviewFilter('final')}>Final</button>
                        </div>
                    </div>
                    {interviewSessionGroups.length === 0 ? (
                        <p className="obs-muted-empty">No interview events match the current filter.</p>
                    ) : (
                        <div className="obs-transition-list" style={{ maxHeight: '32rem', overflowY: 'auto' }}>
                            {interviewSessionGroups.map(([sessionKey, events]) => {
                                const lastFinal = [...events].reverse().find((e) => e.event === 'final');
                                const roleTrack = events[0]?.roleTrack ?? null;
                                return (
                                    <div key={sessionKey} style={{ marginBottom: '1rem', borderLeft: '3px solid #0f766e', paddingLeft: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                            <span className="obs-transition-time" style={{ fontWeight: 600, color: '#0f766e' }}>{sessionKey}</span>
                                            {roleTrack && <span className="badge neutral">{roleTrack}</span>}
                                            {lastFinal?.finalRecommendation && (
                                                <span className="badge warn">rec: {lastFinal.finalRecommendation}</span>
                                            )}
                                            <span className="obs-muted-empty">{events.length} event{events.length !== 1 ? 's' : ''}</span>
                                        </div>
                                        {events.map((ev) => (
                                            <div key={`${ev.sequence}:${ev.recordedAt}`} className="obs-transition-item" style={{ alignItems: 'flex-start', flexDirection: 'column', paddingLeft: '0.5rem', marginBottom: '0.35rem' }}>
                                                <div>
                                                    <span className="obs-transition-time">{formatTs(ev.recordedAt)}</span>
                                                    <span className={`badge ${ev.event === 'final' ? 'low' : 'neutral'}`} style={{ marginLeft: '0.4rem' }}>{ev.event}</span>
                                                    {ev.interruptedSpeaking && <span className="badge high" style={{ marginLeft: '0.4rem' }}>interrupted</span>}
                                                    {ev.turnIndex !== null && <span className="obs-muted-empty" style={{ marginLeft: '0.5rem' }}>turn {ev.turnIndex}</span>}
                                                </div>
                                                <div style={{ marginTop: '0.2rem', color: '#1f2937', fontSize: '0.82rem' }}>{ev.text}</div>
                                                {ev.followUpQuestion && (
                                                    <div className="obs-muted-empty" style={{ marginTop: '0.15rem' }}>follow-up: {ev.followUpQuestion}</div>
                                                )}
                                                {ev.finalRecommendation && (
                                                    <div className="obs-muted-empty" style={{ marginTop: '0.15rem', color: '#b45309' }}>recommendation: {ev.finalRecommendation}</div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </article>
    );
}
