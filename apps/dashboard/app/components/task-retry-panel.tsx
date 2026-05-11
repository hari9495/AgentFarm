'use client';

import { useCallback, useEffect, useState } from 'react';

type TaskRecord = {
    id: string;
    taskId: string;
    outcome: string;
    executedAt: string;
    modelProvider: string;
    modelProfile: string;
    latencyMs: number;
    estimatedCostUsd: number;
    modelTier: string;
};

type TasksResponse = {
    tasks: TaskRecord[];
    nextCursor: string | null;
};

type RowState = 'idle' | 'loading' | 'retried' | 'unrecoverable' | 'error';

type ReproPackResult = {
    reproPackId?: string;
    downloadRef?: string;
    expiresAt?: string;
    error?: string;
};

const OUTCOME_STYLES: Record<string, { bg: string; color: string }> = {
    success: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    approval_queued: { bg: '#fef3c7', color: '#92400e' },
};

const DEFAULT_OUTCOME_STYLE = { bg: '#f3f4f6', color: '#374151' };

function OutcomeBadge({ outcome }: { outcome: string }) {
    const s = OUTCOME_STYLES[outcome] ?? DEFAULT_OUTCOME_STYLE;
    return (
        <span style={{
            padding: '2px 8px',
            borderRadius: 12,
            background: s.bg,
            color: s.color,
            fontSize: '0.78rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
        }}>
            {outcome}
        </span>
    );
}

function SkeletonRow() {
    return (
        <tr>
            {[140, 100, 140, 80].map((w, i) => (
                <td key={i} style={{ padding: '10px 12px' }}>
                    <div style={{
                        width: w,
                        height: 18,
                        background: '#f3f4f6',
                        borderRadius: 4,
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                </td>
            ))}
        </tr>
    );
}

function formatDateTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

function truncateId(id: string): string {
    return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

type Props = { botId: string };

export default function TaskRetryPanel({ botId }: Props) {
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
    const [reproPackLoading, setReproPackLoading] = useState(false);
    const [reproPackResult, setReproPackResult] = useState<ReproPackResult | null>(null);

    const fetchTasks = useCallback(async () => {
        setIsLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`/api/runtime/${botId}/tasks`, { cache: 'no-store' });
            if (!res.ok) {
                setFetchError('Failed to load task history.');
                return;
            }
            const data = await res.json() as TasksResponse;
            setTasks(data.tasks ?? []);
        } catch {
            setFetchError('Failed to load task history.');
        } finally {
            setIsLoading(false);
        }
    }, [botId]);

    useEffect(() => { void fetchTasks(); }, [fetchTasks]);

    const handleRetry = async (task: TaskRecord) => {
        setRowStates(prev => ({ ...prev, [task.id]: 'loading' }));
        try {
            const res = await fetch(`/api/runtime/${botId}/run-resume`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId: task.taskId }),
            });
            if (res.status === 422) {
                setRowStates(prev => ({ ...prev, [task.id]: 'unrecoverable' }));
            } else if (res.ok || res.status === 202) {
                setRowStates(prev => ({ ...prev, [task.id]: 'retried' }));
            } else {
                setRowStates(prev => ({ ...prev, [task.id]: 'error' }));
            }
        } catch {
            setRowStates(prev => ({ ...prev, [task.id]: 'error' }));
        }
    };

    const handleCreateReproPack = async () => {
        setReproPackLoading(true);
        setReproPackResult(null);
        try {
            const res = await fetch(`/api/runtime/${botId}/repro-pack`, { method: 'POST' });
            const data = await res.json() as ReproPackResult;
            if (res.ok) {
                setReproPackResult(data);
            } else {
                setReproPackResult({ error: (data as { error?: string }).error ?? 'Failed to create repro pack.' });
            }
        } catch {
            setReproPackResult({ error: 'Failed to create repro pack.' });
        } finally {
            setReproPackLoading(false);
        }
    };

    function rowAction(task: TaskRecord) {
        const state = rowStates[task.id] ?? 'idle';
        if (task.outcome !== 'failed') return null;
        if (state === 'loading') {
            return <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Retrying…</span>;
        }
        if (state === 'retried') {
            return <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>✓ Retried</span>;
        }
        if (state === 'unrecoverable') {
            return <span style={{ fontSize: '0.8rem', color: '#991b1b', fontWeight: 600 }}>✗ Unrecoverable</span>;
        }
        if (state === 'error') {
            return <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>✗ Failed</span>;
        }
        return (
            <button
                onClick={() => void handleRetry(task)}
                style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    border: '1px solid #fca5a5',
                    background: '#fff1f2',
                    color: '#be123c',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                }}
            >
                Retry
            </button>
        );
    }

    return (
        <section style={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 20,
            marginTop: '1rem',
        }}>
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                    Task History &amp; Retry
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {reproPackResult && !reproPackResult.error && (
                        <span style={{ fontSize: '0.78rem', color: '#374151' }}>
                            Pack: <code style={{ fontSize: '0.75rem' }}>{reproPackResult.downloadRef}</code>
                            {reproPackResult.expiresAt && (
                                <> · expires {formatDateTime(reproPackResult.expiresAt)}</>
                            )}
                        </span>
                    )}
                    {reproPackResult?.error && (
                        <span style={{ fontSize: '0.78rem', color: '#dc2626' }}>{reproPackResult.error}</span>
                    )}
                    <button
                        onClick={() => void handleCreateReproPack()}
                        disabled={reproPackLoading}
                        style={{
                            padding: '4px 12px',
                            borderRadius: 6,
                            border: '1px solid #c7d2fe',
                            background: reproPackLoading ? '#f3f4f6' : '#eef2ff',
                            color: reproPackLoading ? '#9ca3af' : '#4338ca',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: reproPackLoading ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {reproPackLoading ? 'Creating…' : 'Create Repro Pack'}
                    </button>
                </div>
            </div>

            {/* Error */}
            {fetchError && (
                <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '8px 0' }}>{fetchError}</p>
            )}

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            {['Task ID', 'Outcome', 'Time', 'Action'].map(h => (
                                <th key={h} style={{
                                    padding: '6px 12px',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    color: '#6b7280',
                                    fontSize: '0.75rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                }}>
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <>{[0, 1, 2].map(i => <SkeletonRow key={i} />)}</>
                        ) : tasks.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ padding: '20px 12px', color: '#9ca3af', textAlign: 'center' }}>
                                    No tasks found for this agent
                                </td>
                            </tr>
                        ) : tasks.map(task => (
                            <tr key={task.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#374151' }}>
                                    {truncateId(task.taskId)}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                    <OutcomeBadge outcome={task.outcome} />
                                </td>
                                <td style={{ padding: '10px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                    {formatDateTime(task.executedAt)}
                                </td>
                                <td style={{ padding: '10px 12px' }}>
                                    {rowAction(task)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
