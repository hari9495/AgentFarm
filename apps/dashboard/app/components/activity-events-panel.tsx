'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActivityEvent = {
    id: string;
    tenantId: string;
    workspaceId: string;
    category: string;
    title: string;
    body: string | null;
    payload: unknown | null;
    status: string;
    sequence: number;
    ackedAt: string | null;
    ackedBy: string | null;
    correlationId: string;
    createdAt: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    unread: { bg: '#dbeafe', color: '#1d4ed8' },
    read: { bg: '#f1f5f9', color: '#475569' },
    acked: { bg: '#dcfce7', color: '#166534' },
};

const CATEGORY_BADGE: Record<string, { bg: string; color: string }> = {
    runtime: { bg: '#dbeafe', color: '#1d4ed8' },
    approval: { bg: '#fef9c3', color: '#854d0e' },
    ci: { bg: '#f3e8ff', color: '#7c3aed' },
    connector: { bg: '#dcfce7', color: '#166534' },
    provisioning: { bg: '#fee2e2', color: '#991b1b' },
    security: { bg: '#fee2e2', color: '#7f1d1d' },
    system: { bg: '#f1f5f9', color: '#475569' },
};

const CATEGORIES = ['runtime', 'approval', 'ci', 'connector', 'provisioning', 'security', 'system'];

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

// ── Component ─────────────────────────────────────────────────────────────────

type ActivityEventsPanelProps = {
    tenantId: string;
    workspaceId: string;
};

export default function ActivityEventsPanel({ tenantId, workspaceId }: ActivityEventsPanelProps) {
    const [events, setEvents] = useState<ActivityEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [total, setTotal] = useState(0);
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [limit, setLimit] = useState('50');
    const [acking, setAcking] = useState(false);
    const [ackError, setAckError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Emit form
    const [showEmit, setShowEmit] = useState(false);
    const [emitCategory, setEmitCategory] = useState('system');
    const [emitTitle, setEmitTitle] = useState('');
    const [emitBody, setEmitBody] = useState('');
    const [emitting, setEmitting] = useState(false);
    const [emitError, setEmitError] = useState<string | null>(null);
    const [emitSuccess, setEmitSuccess] = useState<string | null>(null);

    // Suppress unused — available for future tenant-scoped requests
    void tenantId;

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        if (categoryFilter) params.set('category', categoryFilter);
        if (statusFilter) params.set('status', statusFilter);
        params.set('limit', limit);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/activity-events?${params.toString()}`,
            { cache: 'no-store' },
        );
        const data = (await response.json().catch(() => ({}))) as {
            events?: ActivityEvent[];
            total?: number;
            message?: string;
        };

        if (!response.ok) {
            setError(data.message ?? 'Unable to load activity events.');
            setLoading(false);
            return;
        }

        setEvents(data.events ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
    }, [workspaceId, categoryFilter, statusFilter, limit]);

    useEffect(() => {
        void fetchEvents();
    }, [fetchEvents]);

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(events.map((e) => e.id)));
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    const ackSelected = async () => {
        if (selectedIds.size === 0) return;
        setAcking(true);
        setAckError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/activity-events/ack`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ eventIds: [...selectedIds] }),
            },
        );
        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setAckError(data.message ?? 'Failed to acknowledge events.');
            setAcking(false);
            return;
        }

        clearSelection();
        await fetchEvents();
        setAcking(false);
    };

    const emitEvent = async () => {
        if (!emitTitle.trim() || !emitCategory.trim()) {
            setEmitError('Category and Title are required.');
            return;
        }

        setEmitting(true);
        setEmitError(null);
        setEmitSuccess(null);

        const body: Record<string, unknown> = {
            category: emitCategory,
            title: emitTitle.trim(),
        };
        if (emitBody.trim()) body.body = emitBody.trim();

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/activity-events`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            },
        );
        const data = (await response.json().catch(() => ({}))) as { message?: string };

        if (!response.ok) {
            setEmitError(data.message ?? 'Failed to emit event.');
            setEmitting(false);
            return;
        }

        setEmitSuccess('Event emitted.');
        setTimeout(() => setEmitSuccess(null), 3000);
        setEmitTitle('');
        setEmitBody('');
        setEmitCategory('system');
        await fetchEvents();
        setEmitting(false);
    };

    const allSelected = events.length > 0 && selectedIds.size === events.length;

    const inputStyle: React.CSSProperties = {
        padding: '0.35rem 0.55rem',
        fontSize: '0.83rem',
        border: '1px solid var(--line)',
        borderRadius: '4px',
        background: 'var(--bg)',
        color: 'var(--ink)',
        width: '100%',
        boxSizing: 'border-box',
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '1.5rem' }}>

            {/* ── Section 1: Activity Feed ──────────────────────────────── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h2 style={{ margin: 0 }}>Activity Events</h2>
                        <span
                            style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                background: 'var(--surface)',
                                color: 'var(--ink-muted)',
                                border: '1px solid var(--line)',
                            }}
                        >
                            {total}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="secondary-action"
                        onClick={() => void fetchEvents()}
                    >
                        Refresh
                    </button>
                </div>

                {/* Filter bar */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        style={{ ...inputStyle, width: 'auto', flex: '1 1 130px' }}
                    >
                        <option value="">All Categories</option>
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{ ...inputStyle, width: 'auto', flex: '1 1 110px' }}
                    >
                        <option value="">All Statuses</option>
                        <option value="unread">unread</option>
                        <option value="read">read</option>
                        <option value="acked">acked</option>
                    </select>
                    <select
                        value={limit}
                        onChange={(e) => setLimit(e.target.value)}
                        style={{ ...inputStyle, width: 'auto', flex: '0 0 80px' }}
                    >
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                    </select>
                </div>

                {/* Bulk actions bar */}
                {selectedIds.size > 0 && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.4rem 0.65rem',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '4px',
                            marginBottom: '0.6rem',
                            fontSize: '0.83rem',
                        }}
                    >
                        <span style={{ fontWeight: 600, color: '#1d4ed8' }}>{selectedIds.size} selected</span>
                        <button
                            type="button"
                            className="primary-action"
                            style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }}
                            disabled={acking}
                            onClick={() => void ackSelected()}
                        >
                            {acking ? 'Acking…' : 'Ack Selected'}
                        </button>
                        <button
                            type="button"
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--ink-soft)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                padding: 0,
                            }}
                            onClick={clearSelection}
                        >
                            Clear
                        </button>
                    </div>
                )}

                {ackError && <p className="message-inline">{ackError}</p>}

                {loading && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading events…</p>
                )}
                {error && <p className="message-inline">{error}</p>}

                {!loading && !error && events.length === 0 && (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        No activity events.
                    </p>
                )}

                {!loading && events.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.35rem 0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={() => allSelected ? clearSelection() : selectAll()}
                                            title={allSelected ? 'Deselect all' : 'Select all'}
                                        />
                                    </th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Category</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Title</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Body</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Seq</th>
                                    <th style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)', fontWeight: 600 }}>Created At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {events.map((event) => (
                                    <tr
                                        key={event.id}
                                        style={{
                                            borderBottom: '1px solid var(--line)',
                                            background: event.status === 'unread'
                                                ? 'rgba(59,130,246,0.04)'
                                                : undefined,
                                        }}
                                    >
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(event.id)}
                                                onChange={() => toggleSelect(event.id)}
                                            />
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            {inlineBadge(event.category, CATEGORY_BADGE)}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem' }}>
                                            {inlineBadge(event.status, STATUS_BADGE)}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem', fontWeight: event.status === 'unread' ? 600 : 400 }}>
                                            {event.title}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)' }}>
                                            {event.body
                                                ? event.body.length > 40
                                                    ? `${event.body.slice(0, 40)}…`
                                                    : event.body
                                                : '—'}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-muted)' }}>
                                            {event.sequence}
                                        </td>
                                        <td style={{ padding: '0.35rem 0.5rem', color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                                            {event.createdAt}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Section 2: Emit Event ─────────────────────────────────── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: showEmit ? '0.75rem' : 0 }}>
                    <h2 style={{ margin: 0 }}>Emit Test Event</h2>
                    <button
                        type="button"
                        className="secondary-action"
                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.55rem' }}
                        onClick={() => setShowEmit((v) => !v)}
                    >
                        {showEmit ? 'Hide' : 'Emit Test Event'}
                    </button>
                </div>

                {showEmit && (
                    <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '480px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                Category <span style={{ color: '#991b1b' }}>*</span>
                            </label>
                            <select
                                value={emitCategory}
                                onChange={(e) => setEmitCategory(e.target.value)}
                                style={inputStyle}
                            >
                                {CATEGORIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                Title <span style={{ color: '#991b1b' }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={emitTitle}
                                onChange={(e) => setEmitTitle(e.target.value)}
                                placeholder="Event title…"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}>
                                Body (optional)
                            </label>
                            <textarea
                                value={emitBody}
                                onChange={(e) => setEmitBody(e.target.value)}
                                rows={3}
                                placeholder="Additional context…"
                                style={{ ...inputStyle, resize: 'vertical' }}
                            />
                        </div>

                        {emitError && <p className="message-inline">{emitError}</p>}

                        {emitSuccess && (
                            <div
                                style={{
                                    padding: '0.4rem 0.65rem',
                                    background: '#dcfce7',
                                    border: '1px solid #86efac',
                                    borderRadius: '4px',
                                    fontSize: '0.82rem',
                                    color: '#166534',
                                    fontWeight: 600,
                                }}
                            >
                                {emitSuccess}
                            </div>
                        )}

                        <button
                            type="button"
                            className="primary-action"
                            disabled={emitting}
                            onClick={() => void emitEvent()}
                        >
                            {emitting ? 'Emitting…' : 'Emit'}
                        </button>
                    </div>
                )}
            </div>

        </section>
    );
}
