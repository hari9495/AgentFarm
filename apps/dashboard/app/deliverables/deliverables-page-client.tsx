'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

type Deliverable = {
    id: string;
    bot_id: string;
    bot_role: string | null;
    bot_name: string | null;
    workspace_id: string;
    action_type: string;
    risk_level: string;
    input_summary: string;
    output_summary: string | null;
    status: string;
    connector_type: string | null;
    correlation_id: string;
    created_at: string;
    completed_at: string | null;
};

type Props = {
    workspaceIds: string[];
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
    completed: { bg: 'var(--ok-bg)', color: 'var(--ok)' },
    failed: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
    rejected: { bg: 'var(--warn-bg)', color: 'var(--warn)' },
};

const riskColor = (level: string) => {
    if (level === 'high') return 'var(--danger)';
    if (level === 'medium') return 'var(--warn)';
    return 'var(--ink-muted)';
};

const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const truncate = (s: string, max: number) =>
    s.length <= max ? s : s.slice(0, max) + '…';

export default function DeliverablesPageClient({ workspaceIds }: Props) {
    const [workspaceId, setWorkspaceId] = useState(workspaceIds[0] ?? '');
    const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [cursor, setCursor] = useState<string | null>(null);
    const [cursors, setCursors] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [statusFilter, setStatusFilter] = useState<'completed' | 'failed' | 'rejected'>('completed');
    const [botIdFilter, setBotIdFilter] = useState('');
    const [actionTypeFilter, setActionTypeFilter] = useState('');
    const [fromFilter, setFromFilter] = useState('');
    const [toFilter, setToFilter] = useState('');
    const [search, setSearch] = useState('');

    // action types for dropdown
    const [actionTypes, setActionTypes] = useState<string[]>([]);

    // expanded rows
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const fetchActionTypes = useCallback(async (wsId: string) => {
        if (!wsId) return;
        try {
            const res = await fetch(`/api/deliverables?workspace_id=${encodeURIComponent(wsId)}&_meta=action-types`);
            // The proxy doesn't have a separate action-types endpoint yet, so we skip gracefully
            if (!res.ok) return;
        } catch {
            // non-fatal
        }
    }, []);

    const fetchDeliverables = useCallback(async (opts: {
        wsId: string;
        pageCursor?: string | null;
        replace?: boolean;
    }) => {
        const { wsId, pageCursor, replace = true } = opts;
        if (!wsId) return;

        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ workspace_id: wsId, status: statusFilter, limit: '20' });
            if (botIdFilter.trim()) params.set('bot_id', botIdFilter.trim());
            if (actionTypeFilter) params.set('action_type', actionTypeFilter);
            if (fromFilter) params.set('from', new Date(fromFilter).toISOString());
            if (toFilter) params.set('to', new Date(toFilter).toISOString());
            if (pageCursor) params.set('cursor', pageCursor);

            const res = await fetch(`/api/deliverables?${params.toString()}`);
            const data = (await res.json().catch(() => ({}))) as {
                deliverables?: Deliverable[];
                total?: number;
                has_more?: boolean;
                next_cursor?: string | null;
                error?: string;
                message?: string;
            };

            if (!res.ok) {
                setError(data.message ?? data.error ?? 'Failed to fetch deliverables.');
                return;
            }

            if (replace) {
                setDeliverables(data.deliverables ?? []);
            } else {
                setDeliverables((prev) => [...prev, ...(data.deliverables ?? [])]);
            }
            setTotal(data.total ?? 0);
            setHasMore(data.has_more ?? false);
            setCursor(data.next_cursor ?? null);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, botIdFilter, actionTypeFilter, fromFilter, toFilter]);

    // Initial load
    useEffect(() => {
        void fetchDeliverables({ wsId: workspaceId, replace: true });
        void fetchActionTypes(workspaceId);
        setExpandedIds(new Set());
        setCursors([]);
        setCursor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceId, statusFilter, botIdFilter, actionTypeFilter, fromFilter, toFilter]);

    const filteredDeliverables = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return deliverables;
        return deliverables.filter((d) =>
            d.input_summary.toLowerCase().includes(q) ||
            (d.output_summary ?? '').toLowerCase().includes(q) ||
            d.action_type.toLowerCase().includes(q) ||
            (d.bot_role ?? '').toLowerCase().includes(q) ||
            (d.bot_name ?? '').toLowerCase().includes(q) ||
            (d.connector_type ?? '').toLowerCase().includes(q),
        );
    }, [deliverables, search]);

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handlePrev = async () => {
        const prev = cursors.slice(0, -1);
        setCursors(prev);
        await fetchDeliverables({ wsId: workspaceId, pageCursor: prev[prev.length - 1] ?? null, replace: true });
    };

    const handleNext = async () => {
        if (!cursor) return;
        setCursors((prev) => [...prev, cursor]);
        await fetchDeliverables({ wsId: workspaceId, pageCursor: cursor, replace: true });
    };

    const handleApplyFilters = () => {
        setCursors([]);
        setCursor(null);
        void fetchDeliverables({ wsId: workspaceId, replace: true });
    };

    const handleClearFilters = () => {
        setBotIdFilter('');
        setActionTypeFilter('');
        setFromFilter('');
        setToFilter('');
        setSearch('');
        setStatusFilter('completed');
    };

    const pageNum = cursors.length + 1;

    return (
        <main style={{ padding: '1.5rem', maxWidth: '72rem', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>Deliverables Inbox</h1>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.83rem', color: 'var(--ink-muted)' }}>
                        Completed agent actions — what was asked, what was produced.
                        {total > 0 && <> <strong>{total}</strong> total records.</>}
                    </p>
                </div>
                {workspaceIds.length > 1 && (
                    <select
                        value={workspaceId}
                        onChange={(e) => setWorkspaceId(e.target.value)}
                        className="approval-select"
                        aria-label="Workspace"
                    >
                        {workspaceIds.map((id) => (
                            <option key={id} value={id}>{id}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Filters */}
            <div className="card" style={{ marginBottom: '1.1rem', padding: '0.9rem 1rem' }}>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 160px', minWidth: 120 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)' }}>Status</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                            className="approval-select"
                        >
                            <option value="completed">Completed</option>
                            <option value="failed">Failed</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 160px', minWidth: 120 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)' }}>Agent Bot ID</label>
                        <input
                            type="text"
                            value={botIdFilter}
                            onChange={(e) => setBotIdFilter(e.target.value)}
                            placeholder="Filter by bot ID…"
                            className="approval-input"
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 160px', minWidth: 120 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)' }}>From date</label>
                        <input
                            type="date"
                            value={fromFilter}
                            onChange={(e) => setFromFilter(e.target.value)}
                            className="approval-input"
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 160px', minWidth: 120 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-muted)' }}>To date</label>
                        <input
                            type="date"
                            value={toFilter}
                            onChange={(e) => setToFilter(e.target.value)}
                            className="approval-input"
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="primary-action" onClick={handleApplyFilters} disabled={loading}>
                            {loading ? 'Loading…' : 'Apply'}
                        </button>
                        <button type="button" className="chip-button" onClick={handleClearFilters}>
                            Clear
                        </button>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div style={{ marginBottom: '0.85rem' }}>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by action, output, agent role, connector…"
                    className="approval-input"
                    style={{ width: '100%', maxWidth: '28rem' }}
                />
            </div>

            {/* Error */}
            {error && (
                <p style={{ margin: '0 0 0.75rem', padding: '0.6rem 1rem', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: '0.82rem' }}>
                    {error}
                </p>
            )}

            {/* Feed */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading && deliverables.length === 0 && (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.85rem' }}>
                        Loading deliverables…
                    </div>
                )}
                {!loading && filteredDeliverables.length === 0 && (
                    <div style={{ padding: '2.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ink)' }}>No deliverables yet</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: '0.25rem' }}>
                            Completed agent actions will appear here once agents have run tasks.
                        </div>
                    </div>
                )}
                {filteredDeliverables.map((d, idx) => {
                    const expanded = expandedIds.has(d.id);
                    const statusStyle = STATUS_COLORS[d.status] ?? { bg: 'var(--bg)', color: 'var(--ink)' };
                    const isLast = idx === filteredDeliverables.length - 1;

                    return (
                        <div
                            key={d.id}
                            style={{
                                padding: '0.9rem 1.1rem',
                                borderBottom: isLast ? 'none' : '1px solid var(--line)',
                                background: expanded ? 'var(--bg)' : 'var(--card)',
                                transition: 'background 0.1s',
                            }}
                        >
                            {/* Top row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                                        {/* Agent badge */}
                                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)', fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            {d.bot_role ?? d.bot_id.slice(0, 12)}
                                        </span>
                                        {/* Action type */}
                                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, background: 'var(--bg)', color: 'var(--ink)', fontSize: '0.73rem', fontWeight: 600 }}>
                                            {d.action_type}
                                        </span>
                                        {/* Connector */}
                                        {d.connector_type && (
                                            <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, background: 'var(--ok-bg)', color: 'var(--ok)', fontSize: '0.73rem', fontWeight: 600 }}>
                                                {d.connector_type}
                                            </span>
                                        )}
                                        {/* Risk */}
                                        <span style={{ fontSize: '0.73rem', fontWeight: 600, color: riskColor(d.risk_level) }}>
                                            {d.risk_level} risk
                                        </span>
                                    </div>
                                    {/* Input summary */}
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink)', fontWeight: 500, lineHeight: 1.4 }}>
                                        {truncate(d.input_summary, 180)}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', flexShrink: 0 }}>
                                    <span style={{ padding: '0.2rem 0.55rem', borderRadius: 9999, background: statusStyle.bg, color: statusStyle.color, fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        {d.status}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                        {formatDate(d.completed_at ?? d.created_at)}
                                    </span>
                                </div>
                            </div>

                            {/* Output preview / expand */}
                            {d.output_summary && (
                                <div style={{ marginTop: '0.55rem' }}>
                                    {!expanded ? (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)', lineHeight: 1.5, flex: 1 }}>
                                                <span style={{ color: 'var(--ink-muted)', fontWeight: 600, marginRight: '0.3rem' }}>→</span>
                                                {truncate(d.output_summary, 220)}
                                            </p>
                                            {d.output_summary.length > 220 && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpand(d.id)}
                                                    style={{ flexShrink: 0, padding: '0.2rem 0.5rem', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: '0.73rem', cursor: 'pointer', fontWeight: 600 }}
                                                >
                                                    Show all
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ background: 'var(--bg)', borderRadius: '0.4rem', padding: '0.65rem 0.75rem', fontSize: '0.82rem', color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '18rem', overflowY: 'auto' }}>
                                                <span style={{ color: 'var(--ink-muted)', fontWeight: 600, marginRight: '0.3rem' }}>→</span>
                                                {d.output_summary}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => toggleExpand(d.id)}
                                                style={{ marginTop: '0.35rem', padding: '0.2rem 0.5rem', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: '0.73rem', cursor: 'pointer', fontWeight: 600 }}
                                            >
                                                Collapse
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!d.output_summary && d.status === 'completed' && (
                                <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)', fontStyle: 'italic' }}>
                                    No output recorded for this action.
                                </p>
                            )}

                            {/* Correlation ID */}
                            <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--ink-muted)', fontFamily: 'ui-monospace, monospace' }}>
                                {d.correlation_id}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Pagination */}
            {(cursors.length > 0 || hasMore) && (
                <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                    <span>Page {pageNum} · {filteredDeliverables.length} shown of {total} total</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button
                            type="button"
                            className="chip-button"
                            onClick={() => void handlePrev()}
                            disabled={cursors.length === 0 || loading}
                        >
                            ← Prev
                        </button>
                        <button
                            type="button"
                            className="chip-button"
                            onClick={() => void handleNext()}
                            disabled={!hasMore || loading}
                        >
                            Next →
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
