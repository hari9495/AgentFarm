'use client';

import { useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type LoopConfig = {
    initial_skill: string;
    success_criteria: string;
    max_iterations?: number;
    context?: Record<string, unknown>;
};

type LoopRun = {
    loopId: string;
    state: string;
    result?: unknown;
    iterations?: number;
    startedAt?: string;
    completedAt?: string;
    initial_skill?: string;
    success_criteria?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATE_BADGE: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#fef9c3', color: '#854d0e' },
    running: { bg: '#dbeafe', color: '#1d4ed8' },
    success: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
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

function fmtDate(iso?: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return (
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AutonomousLoopsPanel() {
    const [runs, setRuns] = useState<LoopRun[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Execute form
    const [formSkill, setFormSkill] = useState('');
    const [formCriteria, setFormCriteria] = useState('');
    const [formMaxIter, setFormMaxIter] = useState('10');
    const [formContext, setFormContext] = useState('{}');
    const [executing, setExecuting] = useState(false);
    const [executeError, setExecuteError] = useState<string | null>(null);
    const [executeSuccess, setExecuteSuccess] = useState<string | null>(null);

    // Detail drawer
    const [selectedLoopId, setSelectedLoopId] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<LoopRun | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);

    const loadRuns = async () => {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/loops', { cache: 'no-store' });
        const data = (await response.json().catch(() => ({}))) as {
            loops?: LoopRun[];
            message?: string;
        };

        if (!response.ok) {
            setError(data.message ?? 'Unable to load loops.');
            setLoading(false);
            return;
        }

        // Merge: keep local-only entries the in-memory store may not have
        const serverIds = new Set((data.loops ?? []).map((r) => r.loopId));
        setRuns((prev) => {
            const localOnly = prev.filter((r) => !serverIds.has(r.loopId));
            return [...(data.loops ?? []), ...localOnly];
        });

        setLoading(false);
    };

    useEffect(() => {
        void loadRuns();
    }, []);

    const executeLoop = async () => {
        if (!formSkill.trim() || !formCriteria.trim()) {
            setExecuteError('Initial Skill and Success Criteria are required.');
            return;
        }

        let parsedContext: Record<string, unknown> = {};
        try {
            parsedContext = JSON.parse(formContext || '{}') as Record<string, unknown>;
        } catch {
            setExecuteError('Context must be valid JSON.');
            return;
        }

        setExecuting(true);
        setExecuteError(null);
        setExecuteSuccess(null);

        const payload: LoopConfig = {
            initial_skill: formSkill.trim(),
            success_criteria: formCriteria.trim(),
            max_iterations: parseInt(formMaxIter, 10) || 10,
            context: parsedContext,
        };

        const response = await fetch('/api/loops', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = (await response.json().catch(() => ({}))) as {
            loopId?: string;
            state?: string;
            result?: { loopId?: string };
            message?: string;
        };

        if (!response.ok) {
            setExecuteError(data.message ?? 'Failed to execute loop.');
            setExecuting(false);
            return;
        }

        const resolvedId =
            (data as Record<string, unknown>).loopId as string | undefined ??
            data.result?.loopId ??
            String(Date.now());

        const newRun: LoopRun = {
            loopId: resolvedId,
            state: (data as Record<string, unknown>).state as string ?? 'pending',
            initial_skill: formSkill.trim(),
            success_criteria: formCriteria.trim(),
        };

        setRuns((prev) => {
            if (prev.some((r) => r.loopId === newRun.loopId)) return prev;
            return [newRun, ...prev];
        });

        setExecuteSuccess('Loop started: ' + resolvedId);
        setFormSkill('');
        setFormCriteria('');
        setFormMaxIter('10');
        setFormContext('{}');
        setExecuting(false);
    };

    const fetchDetail = async (loopId: string) => {
        setSelectedLoopId(loopId);
        setDetailLoading(true);

        const response = await fetch(`/api/loops/${encodeURIComponent(loopId)}`, {
            cache: 'no-store',
        });
        const data = (await response.json().catch(() => ({}))) as LoopRun;
        setSelectedRun(response.ok ? data : null);
        setDetailLoading(false);
    };

    const deleteLoop = async (loopId: string) => {
        if (!window.confirm(`Delete loop ${loopId.slice(0, 12)}?`)) return;
        setDeleting(loopId);

        const response = await fetch(`/api/loops/${encodeURIComponent(loopId)}`, {
            method: 'DELETE',
        });

        if (response.ok || response.status === 204) {
            setRuns((prev) => prev.filter((r) => r.loopId !== loopId));
            if (selectedLoopId === loopId) {
                setSelectedLoopId(null);
                setSelectedRun(null);
            }
        }

        setDeleting(null);
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Autonomous Loops</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Execute and monitor self-directing autonomous agent loops.
                </p>
            </header>

            {/* Session banner */}
            <p
                className="message-inline"
                style={{
                    borderColor: '#b45309',
                    background: '#fffbeb',
                    color: '#92400e',
                    fontSize: '0.8rem',
                }}
            >
                ⚠ Loop store is in-memory — resets on server restart.
            </p>

            {/* Execute form */}
            <div
                className="card"
                style={{ margin: 0, padding: '0.9rem', display: 'grid', gap: '0.55rem' }}
            >
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Execute Autonomous Loop</h3>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        placeholder="Initial Skill *"
                        value={formSkill}
                        onChange={(e) => setFormSkill(e.target.value)}
                        style={{
                            flex: '1 1 200px',
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
                        placeholder="Success Criteria *"
                        value={formCriteria}
                        onChange={(e) => setFormCriteria(e.target.value)}
                        style={{
                            flex: '2 1 280px',
                            padding: '0.35rem 0.55rem',
                            fontSize: '0.83rem',
                            border: '1px solid var(--line)',
                            borderRadius: '4px',
                            background: 'var(--bg)',
                            color: 'var(--ink)',
                        }}
                    />
                    <input
                        type="number"
                        placeholder="Max Iterations"
                        value={formMaxIter}
                        onChange={(e) => setFormMaxIter(e.target.value)}
                        style={{
                            flex: '0 0 120px',
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
                    rows={2}
                    placeholder="{}"
                    value={formContext}
                    onChange={(e) => setFormContext(e.target.value)}
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
                {executeError && <p className="message-inline">{executeError}</p>}
                {executeSuccess && (
                    <p
                        className="message-inline"
                        style={{
                            borderColor: 'var(--ok-border)',
                            background: 'var(--ok-bg)',
                            color: 'var(--ok)',
                        }}
                    >
                        {executeSuccess}
                    </p>
                )}
                <div>
                    <button
                        type="button"
                        className="primary-action"
                        disabled={executing}
                        onClick={() => void executeLoop()}
                    >
                        {executing ? 'Executing...' : 'Execute'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                    type="button"
                    className="secondary-action"
                    onClick={() => void loadRuns()}
                >
                    Refresh
                </button>
                <span className="badge neutral">{runs.length} runs</span>
                {error && (
                    <p className="message-inline" style={{ margin: 0 }}>
                        {error}
                    </p>
                )}
            </div>

            {loading ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading loops...</p>
            ) : runs.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                    No loop runs found. Execute one above.
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
                                    Loop ID
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Skill
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    State
                                </th>
                                <th
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.45rem 0.6rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    Iterations
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
                                    Completed
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
                                const isBusy = deleting === run.loopId;
                                return (
                                    <tr
                                        key={run.loopId}
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
                                            {run.loopId.slice(0, 12)}…
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink-soft)',
                                            }}
                                        >
                                            {run.initial_skill ?? '—'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {inlineBadge(run.state, STATE_BADGE)}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink-soft)',
                                            }}
                                        >
                                            {run.iterations ?? '—'}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink-soft)',
                                            }}
                                        >
                                            {fmtDate(run.startedAt)}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink-soft)',
                                            }}
                                        >
                                            {fmtDate(run.completedAt)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    disabled={isBusy}
                                                    onClick={() => void fetchDetail(run.loopId)}
                                                >
                                                    View
                                                </button>
                                                {run.state !== 'running' && (
                                                    <button
                                                        type="button"
                                                        className="secondary-action"
                                                        disabled={isBusy}
                                                        onClick={() => void deleteLoop(run.loopId)}
                                                    >
                                                        {isBusy ? '...' : 'Delete'}
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
            {selectedLoopId && (
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
                            Loop — {selectedLoopId.slice(0, 12)}…
                        </p>
                        <button
                            type="button"
                            className="secondary-action"
                            onClick={() => {
                                setSelectedLoopId(null);
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
                                    <span style={{ color: 'var(--ink-muted)' }}>State: </span>
                                    {inlineBadge(selectedRun.state, STATE_BADGE)}
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Skill: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {selectedRun.initial_skill ?? '—'}
                                    </span>
                                </div>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={{ color: 'var(--ink-muted)' }}>Criteria: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {selectedRun.success_criteria ?? '—'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Iterations: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {selectedRun.iterations ?? '—'}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Started: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {fmtDate(selectedRun.startedAt)}
                                    </span>
                                </div>
                                <div>
                                    <span style={{ color: 'var(--ink-muted)' }}>Completed: </span>
                                    <span style={{ color: 'var(--ink)' }}>
                                        {fmtDate(selectedRun.completedAt)}
                                    </span>
                                </div>
                            </div>

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
                                {selectedRun.result == null ? (
                                    <p
                                        style={{
                                            margin: 0,
                                            fontStyle: 'italic',
                                            color: 'var(--ink-muted)',
                                            fontSize: '0.83rem',
                                        }}
                                    >
                                        No result yet.
                                    </p>
                                ) : (
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
                                )}
                            </div>
                        </>
                    ) : (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
                            Unable to load loop details.
                        </p>
                    )}
                </div>
            )}
        </section>
    );
}
