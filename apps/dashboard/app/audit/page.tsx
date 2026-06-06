'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../components/page-header';
import { AuditUpgradeWall } from '../components/audit-upgrade-wall';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditEvent = {
    event_id: string;
    tenant_id: string;
    workspace_id: string;
    bot_id: string;
    event_type: string;
    severity: string;
    summary: string;
    source_system: string;
    correlation_id: string;
    created_at: string;
};

type Filters = {
    from: string;
    to: string;
    action: string;   // → event_type query param (free text)
    userId: string;   // → bot_id query param
    resource: string; // kept in UI only; no backend filter for source_system
    outcome: string;  // → severity query param (info | warn | error)
};

type SortKey = 'created_at' | 'bot_id' | 'event_type' | 'source_system' | 'severity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDateStr = (d: Date): string => d.toISOString().slice(0, 10);

const defaultFilters = (): Filters => ({
    from: (() => { const d = new Date(); d.setDate(d.getDate() - 30); return toDateStr(d); })(),
    to: toDateStr(new Date()),
    action: '',
    userId: '',
    resource: '',
    outcome: '',
});

function severityBadge(severity: string): { bg: string; color: string; label: string } {
    if (severity === 'error') return { bg: 'var(--danger-bg)', color: 'var(--danger)', label: 'error' };
    if (severity === 'warn')  return { bg: 'var(--warn-bg)', color: 'var(--warn)', label: 'warn' };
    if (severity === 'info')  return { bg: 'var(--ok-bg)', color: 'var(--ok)', label: 'info' };
    return { bg: 'var(--bg)', color: 'var(--ink-muted)', label: severity || '—' };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage() {
    const [planChecked, setPlanChecked] = useState(false);
    const [auditAccess, setAuditAccess] = useState(true);
    const [planName, setPlanName] = useState('');
    const [filters, setFilters] = useState<Filters>(defaultFilters);
    const [page, setPage] = useState(0);
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [workspaceId, setWorkspaceId] = useState('');
    const [exportError, setExportError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('created_at');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        void fetch('/api/billing/plan-features', { cache: 'no-store' })
            .then((r) => r.json() as Promise<{ planName: string; auditAccess: boolean }>)
            .then((data) => {
                setPlanName(data.planName ?? '');
                setAuditAccess(data.auditAccess ?? true);
            })
            .catch(() => { /* allow access on fetch failure */ })
            .finally(() => setPlanChecked(true));
    }, []);

    // Cursor stack — ref so mutations don't re-trigger the fetch effect.
    // pageCursors[i] = cursor to send for page i.
    const pageCursors = useRef<(string | null)[]>([null]);

    useEffect(() => {
        setLoading(true);
        setFetchError(null);
        setExpandedId(null);

        const cursor = pageCursors.current[page] ?? null;
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (cursor)                params.set('cursor',     cursor);
        if (filters.from)          params.set('from',       new Date(filters.from).toISOString());
        if (filters.to)            params.set('to',         new Date(filters.to).toISOString());
        if (filters.action.trim()) params.set('event_type', filters.action.trim());
        if (filters.userId.trim()) params.set('bot_id',     filters.userId.trim());
        if (filters.outcome.trim()) params.set('severity',  filters.outcome.trim());
        // filters.resource: no backend param for source_system — not forwarded

        void fetch(`/api/audit/events?${params.toString()}`, { cache: 'no-store' })
            .then(async (res) => {
                if (!res.ok) { setFetchError('Failed to load audit log.'); return; }
                const body = (await res.json()) as {
                    events?: AuditEvent[];
                    next_cursor?: string | null;
                };
                const items = body.events ?? [];
                const nc = body.next_cursor ?? null;
                setEvents(items);
                // Auto-populate workspace ID from first event
                if (items.length > 0 && items[0]?.workspace_id && !workspaceId) {
                    setWorkspaceId(items[0].workspace_id);
                }
                if (nc) {
                    pageCursors.current[page + 1] = nc;
                    setTotal((prev) => Math.max(prev, (page + 2) * PAGE_SIZE));
                } else {
                    setTotal(page * PAGE_SIZE + items.length);
                }
            })
            .catch(() => setFetchError('Failed to load audit log.'))
            .finally(() => setLoading(false));
    }, [filters, page]);

    // Client-side sort of the current page's events
    const sortedEvents = useMemo(() => {
        const copy = [...events];
        copy.sort((a, b) => {
            const av = a[sortKey] ?? '';
            const bv = b[sortKey] ?? '';
            const cmp = av < bv ? -1 : av > bv ? 1 : 0;
            return sortDir === 'asc' ? cmp : -cmp;
        });
        return copy;
    }, [events, sortKey, sortDir]);

    const applyFilter = (patch: Partial<Filters>) => {
        pageCursors.current = [null];
        setTotal(0);
        setPage(0);
        setFilters((f) => ({ ...f, ...patch }));
    };

    const handleClear = () => {
        pageCursors.current = [null];
        setTotal(0);
        setPage(0);
        setFilters(defaultFilters());
    };

    const handlePrev = () => setPage((p) => Math.max(0, p - 1));
    const handleNext = () => setPage((p) => p + 1);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const handleExport = async (format: 'csv' | 'json'): Promise<void> => {
        if (!workspaceId.trim()) {
            setExportError('Workspace ID is required for export. Wait for events to load or enter one manually.');
            return;
        }
        setExportError(null);
        setExporting(true);
        const params = new URLSearchParams({ format, limit: '500' });
        params.set('workspace_id', workspaceId.trim());
        if (filters.from) params.set('from', new Date(filters.from).toISOString());
        if (filters.to)   params.set('to',   new Date(filters.to).toISOString());
        if (filters.action.trim())  params.set('event_type', filters.action.trim());
        if (filters.userId.trim())  params.set('bot_id',     filters.userId.trim());
        if (filters.outcome.trim()) params.set('severity',   filters.outcome.trim());
        try {
            const res = await fetch(`/api/audit/export?${params.toString()}`);
            if (!res.ok) {
                setExportError('Export failed. Check your workspace ID and try again.');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-export-${workspaceId.trim().slice(0, 12)}.${format}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            setExportError('Export failed. Check your connection.');
        } finally {
            setExporting(false);
        }
    };

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const isNextDisabled = (page + 1) * PAGE_SIZE >= total;

    const inputStyle: React.CSSProperties = {
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: '0.82rem',
        color: 'var(--ink)',
        background: 'var(--card)',
    };

    const btnBase: React.CSSProperties = {
        padding: '5px 12px',
        borderRadius: 6,
        fontSize: '0.82rem',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    };

    type ColDef = { label: string; key: SortKey | null };
    const columns: ColDef[] = [
        { label: 'Timestamp', key: 'created_at' },
        { label: 'User',      key: 'bot_id' },
        { label: 'Action',    key: 'event_type' },
        { label: 'Resource',  key: 'source_system' },
        { label: 'Outcome',   key: 'severity' },
        { label: 'Details',   key: null },
    ];

    if (!planChecked) {
        return (
            <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Loading…</p>
            </div>
        );
    }

    if (!auditAccess) {
        return (
            <main className="page-shell">
                <PageHeader eyebrow="Audit & Compliance" title="Audit Log" tone="violet" />
                <AuditUpgradeWall planName={planName} />
            </main>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <div style={{ padding: '1.5rem 1.5rem 0' }}>
                <PageHeader
                    eyebrow="Audit & Compliance"
                    title="Audit Log"
                    description="Filterable event log by workspace, bot, and event type. Download as CSV."
                    tone="violet"
                />
            </div>

            {/* ── Filter bar ── */}
            <div style={{
                background: 'var(--card)',
                borderBottom: '1px solid var(--line)',
                padding: '0.75rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                flexWrap: 'wrap',
            }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 500 }}>
                    From
                    <input
                        type="date"
                        value={filters.from}
                        max={filters.to}
                        style={inputStyle}
                        onChange={(e) => applyFilter({ from: e.target.value })}
                    />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 500 }}>
                    To
                    <input
                        type="date"
                        value={filters.to}
                        min={filters.from}
                        style={inputStyle}
                        onChange={(e) => applyFilter({ to: e.target.value })}
                    />
                </label>

                <input
                    type="text"
                    value={filters.action}
                    placeholder="Event type"
                    style={{ ...inputStyle, width: 130 }}
                    onChange={(e) => applyFilter({ action: e.target.value })}
                />

                <input
                    type="text"
                    value={filters.userId}
                    placeholder="User ID"
                    style={{ ...inputStyle, width: 130 }}
                    onChange={(e) => applyFilter({ userId: e.target.value })}
                />

                <input
                    type="text"
                    value={filters.resource}
                    placeholder="Resource type"
                    style={{ ...inputStyle, width: 120 }}
                    onChange={(e) => applyFilter({ resource: e.target.value })}
                />

                <select
                    value={filters.outcome}
                    style={inputStyle}
                    onChange={(e) => applyFilter({ outcome: e.target.value })}
                >
                    <option value="">All severities</option>
                    <option value="info">Info</option>
                    <option value="warn">Warning</option>
                    <option value="error">Error</option>
                </select>

                <button
                    type="button"
                    onClick={handleClear}
                    style={{ ...btnBase, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)' }}
                >
                    Clear filters
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={workspaceId}
                        placeholder="Workspace ID (auto-filled)"
                        style={{ ...inputStyle, width: 180 }}
                        onChange={(e) => setWorkspaceId(e.target.value)}
                    />
                    <button
                        type="button"
                        onClick={() => { void handleExport('csv'); }}
                        disabled={exporting}
                        style={{ ...btnBase, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', opacity: exporting ? 0.6 : 1 }}
                    >
                        {exporting ? 'Exporting…' : '↓ CSV'}
                    </button>
                    <button
                        type="button"
                        onClick={() => { void handleExport('json'); }}
                        disabled={exporting}
                        style={{ ...btnBase, border: '1px solid #6366f1', background: 'var(--card)', color: 'var(--accent)', opacity: exporting ? 0.6 : 1 }}
                    >
                        ↓ JSON
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>

                {exportError && (
                    <div style={{
                        padding: '0.6rem 1rem',
                        background: 'var(--danger-bg)',
                        border: '1px solid var(--danger-border)',
                        borderRadius: 8,
                        fontSize: '0.82rem',
                        color: 'var(--danger)',
                        marginBottom: '1rem',
                    }}>
                        {exportError}
                    </div>
                )}

                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>

                    {/* Loading */}
                    {loading && (
                        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.875rem' }}>
                            Loading…
                        </p>
                    )}

                    {/* Error */}
                    {!loading && fetchError && (
                        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)', fontSize: '0.875rem' }}>
                            {fetchError}
                        </p>
                    )}

                    {/* Table */}
                    {!loading && !fetchError && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--line)', background: 'var(--bg)' }}>
                                        {columns.map((col) => (
                                            <th
                                                key={col.label}
                                                style={{
                                                    padding: '0.6rem 0.75rem',
                                                    fontWeight: 600,
                                                    color: 'var(--ink)',
                                                    textAlign: 'left',
                                                    whiteSpace: 'nowrap',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                {col.key !== null ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSort(col.key as SortKey)}
                                                        style={{
                                                            background: 'none',
                                                            border: 'none',
                                                            padding: 0,
                                                            font: 'inherit',
                                                            fontWeight: 600,
                                                            color: sortKey === col.key ? 'var(--accent)' : 'var(--ink)',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '0.25rem',
                                                        }}
                                                    >
                                                        {col.label}
                                                        <span style={{ fontSize: '0.7rem', opacity: sortKey === col.key ? 1 : 0.35 }}>
                                                            {sortKey === col.key
                                                                ? (sortDir === 'asc' ? '↑' : '↓')
                                                                : '↕'}
                                                        </span>
                                                    </button>
                                                ) : col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedEvents.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-muted)' }}>
                                                No audit events found for the selected filters.
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedEvents.flatMap((ev) => {
                                            const badge = severityBadge(ev.severity);
                                            const isExpanded = expandedId === ev.event_id;
                                            const rows = [
                                                <tr key={ev.event_id} style={{ borderBottom: '1px solid var(--line)' }}>
                                                    <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap', color: 'var(--ink-muted)' }}>
                                                        {new Date(ev.created_at).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: 'var(--ink)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {ev.bot_id || '—'}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', color: 'var(--accent)' }}>
                                                        {ev.event_type}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--ink)' }}>
                                                        {ev.source_system}
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: 4,
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            background: badge.bg,
                                                            color: badge.color,
                                                        }}>
                                                            {badge.label}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.5rem 0.75rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : ev.event_id)}
                                                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                                            style={{
                                                                background: 'none',
                                                                border: '1px solid var(--line)',
                                                                borderRadius: 4,
                                                                cursor: 'pointer',
                                                                padding: '2px 6px',
                                                                fontSize: '0.72rem',
                                                                color: 'var(--accent)',
                                                                display: 'inline-block',
                                                                transform: isExpanded ? 'rotate(90deg)' : 'none',
                                                                transition: 'transform 0.15s',
                                                            }}
                                                        >
                                                            ▶
                                                        </button>
                                                    </td>
                                                </tr>,
                                            ];
                                            if (isExpanded) {
                                                rows.push(
                                                    <tr key={`${ev.event_id}-detail`} style={{ background: 'var(--bg)' }}>
                                                        <td colSpan={6} style={{ padding: '0.75rem 1.5rem' }}>
                                                            <pre style={{
                                                                margin: 0,
                                                                fontSize: '0.78rem',
                                                                fontFamily: 'monospace',
                                                                color: 'var(--ink)',
                                                                whiteSpace: 'pre-wrap',
                                                                wordBreak: 'break-all',
                                                                background: 'var(--bg)',
                                                                borderRadius: 6,
                                                                padding: '0.75rem',
                                                                border: '1px solid var(--line)',
                                                            }}>
                                                                {JSON.stringify(ev, null, 2)}
                                                            </pre>
                                                        </td>
                                                    </tr>,
                                                );
                                            }
                                            return rows;
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {!loading && !fetchError && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.75rem',
                            padding: '0.75rem 1.5rem',
                            borderTop: '1px solid var(--line)',
                        }}>
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={page === 0}
                                style={{
                                    ...btnBase,
                                    border: '1px solid var(--line)',
                                    background: 'var(--card)',
                                    color: 'var(--ink)',
                                    opacity: page === 0 ? 0.4 : 1,
                                    cursor: page === 0 ? 'default' : 'pointer',
                                }}
                            >
                                ← Previous
                            </button>
                            <span style={{ fontSize: '0.82rem', color: 'var(--ink)' }}>
                                Page {page + 1} of {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={isNextDisabled}
                                style={{
                                    ...btnBase,
                                    border: '1px solid var(--line)',
                                    background: 'var(--card)',
                                    color: 'var(--ink)',
                                    opacity: isNextDisabled ? 0.4 : 1,
                                    cursor: isNextDisabled ? 'default' : 'pointer',
                                }}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
