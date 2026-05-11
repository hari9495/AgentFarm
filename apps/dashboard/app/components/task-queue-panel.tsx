'use client';

import { useEffect, useState, useCallback } from 'react';

type TaskQueuePanelProps = { tenantId: string };

type QueueEntry = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId?: string;
    priority: 'high' | 'normal' | 'low';
    payload: unknown;
    enqueuedAt: number;
};

type TaskQueueStatus = {
    depth: number;
    snapshot: QueueEntry[];
};

type TaskQueueEntry = {
    id: string;
    tenantId: string;
    workspaceId: string;
    botId: string | null;
    priority: string;
    status: string;
    payload: unknown;
    errorMessage: string | null;
    enqueuedAt: string;
    startedAt: string | null;
    completedAt: string | null;
    updatedAt: string;
};

type TaskEntriesResponse = {
    entries: TaskQueueEntry[];
    count: number;
    error?: string;
};

type StatusFilter = 'all' | 'pending' | 'running' | 'done' | 'failed';

const PRIORITY_BADGE: Record<string, { bg: string; color: string }> = {
    high: { bg: '#fee2e2', color: '#991b1b' },
    normal: { bg: '#dbeafe', color: '#1d4ed8' },
    low: { bg: '#f1f5f9', color: '#475569' },
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#fef9c3', color: '#854d0e' },
    running: { bg: '#dbeafe', color: '#1d4ed8' },
    done: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    cancelled: { bg: '#f1f5f9', color: '#475569' },
};

export default function TaskQueuePanel({ tenantId: _tenantId }: TaskQueuePanelProps) {
    const [status, setStatus] = useState<TaskQueueStatus | null>(null);
    const [entries, setEntries] = useState<TaskQueueEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [cancelling, setCancelling] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/settings/task-queue/status', { cache: 'no-store' });
            if (res.ok) {
                const data = (await res.json()) as TaskQueueStatus;
                setStatus(data);
            }
        } catch {
            // status fetch failure is non-fatal; entries fetch will surface the error
        }
    }, []);

    const fetchEntries = useCallback(async (filter: StatusFilter) => {
        try {
            const url =
                filter === 'all'
                    ? '/api/settings/task-queue'
                    : `/api/settings/task-queue?status=${encodeURIComponent(filter)}`;
            const res = await fetch(url, { cache: 'no-store' });
            const data = (await res.json()) as TaskEntriesResponse;
            if (!res.ok) {
                setError(data.error ?? 'Failed to load task queue entries.');
            } else {
                setEntries(data.entries ?? []);
                setError(null);
            }
        } catch {
            setError('Network error loading task queue entries.');
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchStatus(), fetchEntries(statusFilter)]).finally(() => {
            setLoading(false);
        });
    }, [fetchStatus, fetchEntries, statusFilter]);

    async function handleCancel(entryId: string) {
        if (!window.confirm('Cancel this pending task? It cannot be re-queued.')) return;
        setCancelling(entryId);
        try {
            const res = await fetch(`/api/settings/task-queue/${encodeURIComponent(entryId)}`, {
                method: 'DELETE',
            });
            const data = (await res.json()) as { cancelled?: boolean; error?: string; message?: string };
            if (!res.ok) {
                window.alert(data.message ?? data.error ?? 'Failed to cancel task.');
                return;
            }
            await Promise.all([fetchStatus(), fetchEntries(statusFilter)]);
        } catch {
            window.alert('Network error cancelling task.');
        } finally {
            setCancelling(null);
        }
    }

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--ink)' }}>
                Task Queue
            </h2>

            {/* Stat cards */}
            {status && (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                        gap: '0.75rem',
                        marginBottom: '1.25rem',
                    }}
                >
                    <div
                        style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                        }}
                    >
                        <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            Queue Depth
                        </p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)' }}>
                            {status.depth}
                        </p>
                    </div>
                    <div
                        style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '0.75rem 1rem',
                        }}
                    >
                        <p style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                            In-Memory Items
                        </p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)' }}>
                            {status.snapshot.length}
                        </p>
                    </div>
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        padding: '0.65rem 0.9rem',
                        color: '#dc2626',
                        fontSize: '0.85rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    {error}
                </div>
            )}

            {/* Filter */}
            <div style={{ marginBottom: '0.75rem' }}>
                <label
                    htmlFor="task-status-filter"
                    style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginRight: '0.5rem' }}
                >
                    Filter by status:
                </label>
                <select
                    id="task-status-filter"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                    style={{
                        padding: '0.3rem 0.6rem',
                        border: '1px solid var(--line)',
                        borderRadius: '5px',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        fontSize: '0.85rem',
                    }}
                >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="running">Running</option>
                    <option value="done">Done</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>ID</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Priority</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Status</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Workspace</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}>Queued At</th>
                            <th style={{ padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
                                    Loading…
                                </td>
                            </tr>
                        )}
                        {!loading && entries.length === 0 && (
                            <tr>
                                <td
                                    colSpan={6}
                                    style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}
                                >
                                    No task queue entries found.
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            entries.map((entry) => {
                                const priStyle = PRIORITY_BADGE[entry.priority] ?? PRIORITY_BADGE.normal;
                                const statStyle = STATUS_BADGE[entry.status] ?? STATUS_BADGE.pending;
                                return (
                                    <tr key={entry.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                            <code
                                                style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}
                                                title={entry.id}
                                            >
                                                {entry.id.slice(0, 12)}…
                                            </code>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: priStyle.bg,
                                                    color: priStyle.color,
                                                }}
                                            >
                                                {entry.priority}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: statStyle.bg,
                                                    color: statStyle.color,
                                                }}
                                            >
                                                {entry.status}
                                            </span>
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.65rem 0.75rem',
                                                color: 'var(--ink-soft)',
                                                maxWidth: '160px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title={entry.workspaceId}
                                        >
                                            {entry.workspaceId}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', color: 'var(--ink-muted)', fontSize: '0.8rem' }}>
                                            {new Date(entry.enqueuedAt).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                            {entry.status === 'pending' && (
                                                <button
                                                    onClick={() => void handleCancel(entry.id)}
                                                    disabled={cancelling === entry.id}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: '4px',
                                                        background: '#fff',
                                                        color: '#dc2626',
                                                        cursor: cancelling === entry.id ? 'not-allowed' : 'pointer',
                                                        opacity: cancelling === entry.id ? 0.6 : 1,
                                                    }}
                                                >
                                                    {cancelling === entry.id ? 'Cancelling…' : 'Cancel'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
