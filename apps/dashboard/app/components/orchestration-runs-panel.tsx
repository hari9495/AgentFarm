'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentDispatch = {
    id: string;
    botId: string;
    taskId: string;
    status: string;
    result?: unknown;
    errorMessage?: string;
};

type OrcRun = {
    id: string;
    tenantId: string;
    workspaceId: string;
    coordinatorBotId: string;
    goal: string;
    status: string;
    subTaskCount: number;
    completedCount: number;
    failedCount: number;
    result: unknown | null;
    errorSummary: string | null;
    startedAt: string;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    dispatches?: AgentDispatch[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    running: { bg: '#dbeafe', color: '#1d4ed8' },
    completed: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    cancelled: { bg: '#f1f5f9', color: '#475569' },
};

function inlineBadge(label: string, map: Record<string, { bg: string; color: string }>) {
    const style = map[label] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
    return (
        <span
            style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                background: style.bg,
                color: style.color,
            }}
        >
            {label}
        </span>
    );
}

function fmtDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return (
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrchestrationRunsPanel({ tenantId }: { tenantId: string }) {
    const [runs, setRuns] = useState<OrcRun[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [newGoal, setNewGoal] = useState('');
    const [newCoordinatorBotId, setNewCoordinatorBotId] = useState('');
    const [newWorkspaceId, setNewWorkspaceId] = useState('');
    const [newSubTasks, setNewSubTasks] = useState('[]');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Cancel
    const [cancelling, setCancelling] = useState<string | null>(null);

    // Detail drawer
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<OrcRun | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const fetchRuns = useCallback(async () => {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/orchestration', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as {
            runs?: OrcRun[];
            message?: string;
        };

        if (!response.ok) {
            setError(data.message ?? 'Unable to load orchestration runs.');
            setLoading(false);
            return;
        }

        setRuns(Array.isArray(data.runs) ? data.runs : []);
        setLoading(false);
    }, []);

    useEffect(() => {
        void fetchRuns();
    }, [fetchRuns]);

    const createRun = async () => {
        if (!newGoal.trim() || !newCoordinatorBotId.trim() || !newWorkspaceId.trim()) {
            setCreateError('Goal, Coordinator Bot ID, and Workspace ID are required.');
            return;
        }

        let parsedSubTasks: unknown[] = [];
        try {
            parsedSubTasks = JSON.parse(newSubTasks || '[]') as unknown[];
            if (!Array.isArray(parsedSubTasks)) throw new Error('not array');
        } catch {
            setCreateError('Sub-Tasks must be a valid JSON array.');
            return;
        }

        setCreating(true);
        setCreateError(null);

        const response = await fetch('/api/orchestration', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                coordinatorBotId: newCoordinatorBotId.trim(),
                workspaceId: newWorkspaceId.trim(),
                goal: newGoal.trim(),
                subTasks: parsedSubTasks,
            }),
        });

        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setCreateError(data.message ?? 'Failed to start run.');
            setCreating(false);
            return;
        }

        setNewGoal('');
        setNewCoordinatorBotId('');
        setNewWorkspaceId('');
        setNewSubTasks('[]');
        setShowCreate(false);
        setCreating(false);
        void fetchRuns();
    };

    const cancelRun = async (runId: string) => {
        if (!window.confirm(`Cancel run ${runId.slice(0, 12)}?`)) return;
        setCancelling(runId);

        await fetch(`/api/orchestration/${encodeURIComponent(runId)}/cancel`, {
            method: 'POST',
        });

        setCancelling(null);
        void fetchRuns();
    };

    const fetchDetail = async (runId: string) => {
        setSelectedRunId(runId);
        setDetailLoading(true);

        const response = await fetch(`/api/orchestration/${encodeURIComponent(runId)}`, {
            cache: 'no-store',
        });
        const data = (await response.json().catch(() => ({}))) as OrcRun & { run?: OrcRun };
        setSelectedRun(response.ok ? (data.run ?? data) : null);
        setDetailLoading(false);
    };

    // Suppress unused variable warning — tenantId available for future filter
    void tenantId;

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Orchestration Runs</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Start and monitor multi-agent orchestration runs.
                </p>
            </header>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="badge neutral">{runs.length} runs</span>
                <button
                    type="button"
                    className="secondary-action"
                    onClick={() => void fetchRuns()}
                >
                    Refresh
                </button>
                <button
                    type="button"
                    className="primary-action"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => {
                        setShowCreate((v) => !v);
                        setCreateError(null);
                    }}
                >
                    {showCreate ? 'Cancel' : '+ New run'}
                </button>
            </div>

            {/* Create form */}
            {showCreate && (
                <div
                    className="card"
                    style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.55rem' }}
                >
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Start orchestration run</h3>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Goal *"
                            value={newGoal}
                            onChange={(e) => setNewGoal(e.target.value)}
                            style={{
                                flex: '2 1 240px',
                                padding: '0.35rem 0.55rem',
                                fontSize: '0.83rem',
                                border: '1px solid var(--line)',
                                borderRadius: '4px',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Coordinator Bot ID *"
                            value={newCoordinatorBotId}
                            onChange={(e) => setNewCoordinatorBotId(e.target.value)}
                            style={{
                                flex: '1 1 180px',
                                padding: '0.35rem 0.55rem',
                                fontSize: '0.83rem',
                                border: '1px solid var(--line)',
                                borderRadius: '4px',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Workspace ID *"
                            value={newWorkspaceId}
                            onChange={(e) => setNewWorkspaceId(e.target.value)}
                            style={{
                                flex: '1 1 160px',
                                padding: '0.35rem 0.55rem',
                                fontSize: '0.83rem',
                                border: '1px solid var(--line)',
                                borderRadius: '4px',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                            }}
                        />
                    </div>
                    <textarea
                        rows={3}
                        placeholder='[{"toAgentId": "...", "taskDescription": "..."}]'
                        value={newSubTasks}
                        onChange={(e) => setNewSubTasks(e.target.value)}
                        style={{
                            padding: '0.35rem 0.55rem',
                            fontSize: '0.83rem',
                            border: '1px solid var(--line)',
                            borderRadius: '4px',
                            background: 'var(--bg)',
                            color: 'var(--ink)',
                            resize: 'vertical',
                            fontFamily: 'monospace',
                        }}
                    />
                    {createError && <p className="message-inline">{createError}</p>}
                    <div>
                        <button
                            type="button"
                            className="primary-action"
                            disabled={creating}
                            onClick={() => void createRun()}
                        >
                            {creating ? 'Starting...' : 'Start Run'}
                        </button>
                    </div>
                </div>
            )}

            {error && <p className="message-inline">{error}</p>}

            {loading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading runs...</p>
            ) : runs.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                    No orchestration runs found. Start one above.
                </p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table
                        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}
                    >
                        <thead>
                            <tr
                                style={{
                                    borderBottom: '1px solid var(--line)',
                                    color: 'var(--ink-muted)',
                                }}
                            >
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    ID
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Goal
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Status
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Bot ID
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Tasks
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Started
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {runs.map((run) => {
                                const isCancelling = cancelling === run.id;
                                return (
                                    <tr
                                        key={run.id}
                                        style={{ borderBottom: '1px solid var(--line)' }}
                                    >
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink)',
                                                fontFamily: 'monospace',
                                                fontSize: '0.78rem',
                                            }}
                                        >
                                            {run.id.slice(0, 12)}…
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink)',
                                                maxWidth: '240px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title={run.goal}
                                        >
                                            {run.goal.length > 40
                                                ? run.goal.slice(0, 40) + '…'
                                                : run.goal}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {inlineBadge(run.status, STATUS_BADGE)}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink-soft)',
                                                fontFamily: 'monospace',
                                                fontSize: '0.78rem',
                                            }}
                                        >
                                            {run.coordinatorBotId.slice(0, 12)}…
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem', fontSize: '0.8rem' }}>
                                            <span style={{ color: 'var(--ink)' }}>
                                                {run.completedCount}/{run.subTaskCount}
                                            </span>
                                            {run.failedCount > 0 && (
                                                <span
                                                    style={{
                                                        color: '#991b1b',
                                                        marginLeft: '0.25rem',
                                                    }}
                                                >
                                                    +{run.failedCount} failed
                                                </span>
                                            )}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink-soft)',
                                            }}
                                        >
                                            {fmtDate(run.startedAt)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    onClick={() => void fetchDetail(run.id)}
                                                >
                                                    View
                                                </button>
                                                {run.status === 'running' && (
                                                    <button
                                                        type="button"
                                                        className="secondary-action"
                                                        disabled={isCancelling}
                                                        onClick={() => void cancelRun(run.id)}
                                                    >
                                                        {isCancelling ? '...' : 'Cancel'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Detail drawer */}
            {selectedRunId && (
                <div
                    className="card"
                    style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.65rem' }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}
                    >
                        <p
                            style={{
                                margin: 0,
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: 'var(--ink-muted)',
                            }}
                        >
                            Run — {selectedRunId.slice(0, 12)}…
                        </p>
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => {
                                setSelectedRunId(null);
                                setSelectedRun(null);
                            }}
                        >
                            Close
                        </button>
                    </div>

                    {detailLoading ? (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading...</p>
                    ) : selectedRun ? (
                        <>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '0.5rem',
                                    fontSize: '0.83rem',
                                }}
                            >
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Status: </span>
                                    {inlineBadge(selectedRun.status, STATUS_BADGE)}
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>
                                        Coordinator Bot:{' '}
                                    </span>
                                    <span
                                        style={{
                                            color: 'var(--ink)',
                                            fontFamily: 'monospace',
                                            fontSize: '0.78rem',
                                        }}
                                    >
                                        {selectedRun.coordinatorBotId}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Workspace: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {selectedRun.workspaceId}
                                    </span>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ color: 'var(--ink-muted)' }}>Goal: </span>
                                    <span style={{ color: 'var(--ink)' }}>{selectedRun.goal}</span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Sub-tasks: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {selectedRun.subTaskCount}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Completed: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {selectedRun.completedCount}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Failed: </span>
                                    <span
                                        style={{
                                            color:
                                                selectedRun.failedCount > 0
                                                    ? '#991b1b'
                                                    : 'var(--ink)',
                                        }}
                                    >
                                        {selectedRun.failedCount}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Started: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {fmtDate(selectedRun.startedAt)}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Completed at: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {fmtDate(selectedRun.completedAt)}
                                    </span>
                                </div>
                            </div>

                            {selectedRun.errorSummary && (
                                <div
                                    style={{
                                        padding: '0.6rem 0.75rem',
                                        borderRadius: '4px',
                                        background: '#fee2e2',
                                        color: '#991b1b',
                                        fontSize: '0.83rem',
                                    }}
                                >
                                    {selectedRun.errorSummary}
                                </div>
                            )}

                            {selectedRun.result != null && (
                                <div>
                                    <p
                                        style={{
                                            margin: '0 0 0.3rem',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            color: 'var(--ink-muted)',
                                        }}
                                    >
                                        Result
                                    </p>
                                    <pre
                                        style={{
                                            margin: 0,
                                            padding: '0.75rem',
                                            borderRadius: '6px',
                                            background: '#1e1e2e',
                                            color: '#cdd6f4',
                                            fontSize: '0.78rem',
                                            overflowX: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            fontFamily: 'monospace',
                                        }}
                                    >
                                        {JSON.stringify(selectedRun.result, null, 2)}
                                    </pre>
                                </div>
                            )}

                            {selectedRun.dispatches && selectedRun.dispatches.length > 0 && (
                                <div>
                                    <p
                                        style={{
                                            margin: '0 0 0.4rem',
                                            fontSize: '0.83rem',
                                            fontWeight: 600,
                                            color: 'var(--ink)',
                                        }}
                                    >
                                        Agent Dispatches
                                    </p>
                                    <table
                                        style={{
                                            width: '100%',
                                            borderCollapse: 'collapse',
                                            fontSize: '0.78rem',
                                        }}
                                    >
                                        <thead>
                                            <tr
                                                style={{
                                                    borderBottom: '1px solid var(--line)',
                                                    color: 'var(--ink-muted)',
                                                }}
                                            >
                                                <th
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '0.3rem 0.5rem',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    Bot ID
                                                </th>
                                                <th
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '0.3rem 0.5rem',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    Task ID
                                                </th>
                                                <th
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '0.3rem 0.5rem',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    Status
                                                </th>
                                                <th
                                                    style={{
                                                        textAlign: 'left',
                                                        padding: '0.3rem 0.5rem',
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    Error
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {selectedRun.dispatches.map((d) => (
                                                <tr
                                                    key={d.id}
                                                    style={{
                                                        borderBottom: '1px solid var(--line)',
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            padding: '0.3rem 0.5rem',
                                                            fontFamily: 'monospace',
                                                            color: 'var(--ink-soft)',
                                                        }}
                                                    >
                                                        {d.botId}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '0.3rem 0.5rem',
                                                            fontFamily: 'monospace',
                                                            color: 'var(--ink-soft)',
                                                        }}
                                                    >
                                                        {d.taskId}
                                                    </td>
                                                    <td style={{ padding: '0.3rem 0.5rem' }}>
                                                        {inlineBadge(d.status, STATUS_BADGE)}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '0.3rem 0.5rem',
                                                            color: d.errorMessage
                                                                ? '#991b1b'
                                                                : 'var(--ink-muted)',
                                                        }}
                                                    >
                                                        {d.errorMessage ?? '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                            Unable to load run details.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
