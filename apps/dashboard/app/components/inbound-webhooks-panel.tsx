'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type InboundSource = {
    id: string;
    name: string;
    inboundUrl: string;
    eventCount?: number;
    lastReceivedAt?: string | null;
};

type InboundEvent = {
    id: string;
    sourceId: string;
    receivedAt: string;
    method: string;
    status: 'processed' | 'failed' | 'pending';
    body?: string;
};

type TestResult = { ok: boolean; statusCode: number; latencyMs: number };

type ActiveTab = 'sources' | 'events';

// ── Style helpers ─────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
    padding: '0.45rem 0.6rem',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: 'var(--ink-muted)',
    borderBottom: '1px solid var(--line)',
    whiteSpace: 'nowrap',
};

const inputStyle: React.CSSProperties = {
    padding: '0.35rem 0.6rem',
    borderRadius: '5px',
    border: '1px solid var(--line)',
    background: 'var(--bg-raised, #0f172a)',
    color: 'var(--ink)',
    fontSize: '0.84rem',
    minWidth: '180px',
};

const EVENT_STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    processed: { bg: '#14532d', color: '#86efac' },
    failed: { bg: '#450a0a', color: '#fca5a5' },
    pending: { bg: '#451a03', color: '#fcd34d' },
};

function statusBadge(status: string) {
    const s = EVENT_STATUS_BADGE[status] ?? { bg: '#27272a', color: '#a1a1aa' };
    return (
        <span
            style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                background: s.bg,
                color: s.color,
            }}
        >
            {status}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InboundWebhooksPanel() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('sources');

    // Sources state
    const [sources, setSources] = useState<InboundSource[]>([]);
    const [sourcesLoading, setSourcesLoading] = useState(true);
    const [sourcesError, setSourcesError] = useState<string | null>(null);

    // Add-source form state
    const [showAddForm, setShowAddForm] = useState(false);
    const [addName, setAddName] = useState('');
    const [addDescription, setAddDescription] = useState('');
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [newSecret, setNewSecret] = useState<string | null>(null);
    const [newSourceId, setNewSourceId] = useState<string | null>(null);

    // Delete state
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Test state
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

    // Clipboard state
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Events state
    const [events, setEvents] = useState<InboundEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [eventsError, setEventsError] = useState<string | null>(null);
    const [filterSource, setFilterSource] = useState('');
    const [filterLimit, setFilterLimit] = useState('20');
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

    // ── Data fetching ─────────────────────────────────────────────────────────

    const fetchSources = useCallback(async () => {
        setSourcesLoading(true);
        setSourcesError(null);
        try {
            const res = await fetch('/api/webhooks/inbound/sources', { cache: 'no-store' });
            const data = (await res.json()) as { sources?: InboundSource[]; error?: string };
            if (!res.ok) {
                setSourcesError(data.error ?? 'Failed to load sources.');
            } else {
                setSources(data.sources ?? []);
            }
        } catch {
            setSourcesError('Network error loading sources.');
        } finally {
            setSourcesLoading(false);
        }
    }, []);

    const fetchEvents = useCallback(async () => {
        setEventsLoading(true);
        setEventsError(null);
        try {
            const params = new URLSearchParams({ limit: filterLimit });
            if (filterSource) params.set('source', filterSource);
            const res = await fetch(`/api/webhooks/inbound/events?${params.toString()}`, { cache: 'no-store' });
            const data = (await res.json()) as { events?: InboundEvent[]; error?: string };
            if (!res.ok) {
                setEventsError(data.error ?? 'Failed to load events.');
            } else {
                setEvents(data.events ?? []);
            }
        } catch {
            setEventsError('Network error loading events.');
        } finally {
            setEventsLoading(false);
        }
    }, [filterSource, filterLimit]);

    useEffect(() => { void fetchSources(); }, [fetchSources]);

    useEffect(() => {
        if (activeTab === 'events') void fetchEvents();
    }, [activeTab, fetchEvents]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    const handleAddSource = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);
        setAddError(null);
        setNewSecret(null);
        setNewSourceId(null);
        try {
            const res = await fetch('/api/webhooks/inbound/sources', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ name: addName, description: addDescription }),
            });
            const data = (await res.json()) as { id?: string; secret?: string; name?: string; inboundUrl?: string; error?: string };
            if (!res.ok) {
                setAddError(data.error ?? 'Failed to create source.');
            } else {
                setNewSecret(data.secret ?? null);
                setNewSourceId(data.id ?? null);
                setAddName('');
                setAddDescription('');
                setShowAddForm(false);
                await fetchSources();
            }
        } catch {
            setAddError('Network error creating source.');
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (sourceId: string) => {
        setDeletingId(sourceId);
        try {
            await fetch(`/api/webhooks/inbound/sources/${encodeURIComponent(sourceId)}`, { method: 'DELETE' });
            setConfirmDeleteId(null);
            await fetchSources();
        } catch {
            /* silently ignore */
        } finally {
            setDeletingId(null);
        }
    };

    const handleTest = async (sourceId: string) => {
        setTestingId(sourceId);
        try {
            const res = await fetch('/api/webhooks/inbound/test', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ sourceId }),
            });
            const data = (await res.json()) as TestResult;
            setTestResults(prev => ({ ...prev, [sourceId]: data }));
        } catch {
            setTestResults(prev => ({ ...prev, [sourceId]: { ok: false, statusCode: 0, latencyMs: 0 } }));
        } finally {
            setTestingId(null);
        }
    };

    const handleCopy = (text: string, key: string) => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopiedId(key);
            setTimeout(() => setCopiedId(null), 1500);
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <section className="card" style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                    <h2 style={{ marginBottom: '0.2rem' }}>Inbound Webhooks</h2>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                        Register sources, monitor received events, and test delivery.
                    </p>
                </div>
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--line)', marginBottom: '1rem' }}>
                {(['sources', 'events'] as const).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                            padding: '6px 14px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                            color: activeTab === tab ? 'var(--accent)' : 'var(--ink-muted)',
                            fontSize: '0.84rem',
                            fontWeight: activeTab === tab ? 600 : 400,
                            cursor: 'pointer',
                            marginBottom: '-1px',
                            textTransform: 'capitalize',
                        }}
                    >
                        {tab === 'sources' ? 'Sources' : 'Recent Events'}
                    </button>
                ))}
            </div>

            {/* ── Sources tab ───────────────────────────────────────────────── */}
            {activeTab === 'sources' && (
                <div>
                    {/* Secret reveal box */}
                    {newSecret && newSourceId && (
                        <div style={{ background: '#1c2b1c', border: '1px solid #16a34a', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
                            <p style={{ fontSize: '0.84rem', fontWeight: 700, color: '#86efac', margin: '0 0 0.5rem' }}>
                                Source created — save this secret now. It will not be shown again.
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <code style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#bbf7d0', background: '#14532d', padding: '0.3rem 0.6rem', borderRadius: '4px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {newSecret}
                                </code>
                                <button
                                    onClick={() => handleCopy(newSecret, 'secret')}
                                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem', borderRadius: '4px', cursor: 'pointer', background: '#166534', color: '#fff', border: 'none' }}
                                >
                                    {copiedId === 'secret' ? '✓ Copied' : 'Copy'}
                                </button>
                                <button
                                    onClick={() => { setNewSecret(null); setNewSourceId(null); }}
                                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.5rem', borderRadius: '4px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Error banner */}
                    {sourcesError && (
                        <p style={{ padding: '0.6rem 0.8rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                            {sourcesError}
                        </p>
                    )}

                    {/* Add-source form toggle */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                        <button
                            onClick={() => { setShowAddForm(v => !v); setAddError(null); }}
                            style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none' }}
                        >
                            {showAddForm ? 'Cancel' : '+ Add source'}
                        </button>
                    </div>

                    {showAddForm && (
                        <form
                            onSubmit={e => void handleAddSource(e)}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'var(--bg-raised, #0f172a)', border: '1px solid var(--line)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}
                        >
                            <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink)', margin: '0 0 0.25rem' }}>Register a new inbound source</p>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    placeholder="Source name (required)"
                                    value={addName}
                                    onChange={e => setAddName(e.target.value)}
                                    required
                                    style={inputStyle}
                                />
                                <input
                                    type="text"
                                    placeholder="Description (optional)"
                                    value={addDescription}
                                    onChange={e => setAddDescription(e.target.value)}
                                    style={{ ...inputStyle, minWidth: '240px' }}
                                />
                                <button
                                    type="submit"
                                    disabled={adding}
                                    style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: adding ? 'not-allowed' : 'pointer', background: '#2563eb', color: '#fff', border: 'none' }}
                                >
                                    {adding ? 'Creating…' : 'Create'}
                                </button>
                            </div>
                            {addError && <p style={{ color: '#fca5a5', fontSize: '0.82rem', margin: 0 }}>{addError}</p>}
                        </form>
                    )}

                    {/* Sources list */}
                    {sourcesLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{ height: '4rem', background: 'var(--bg-raised, #0f172a)', borderRadius: '8px', border: '1px solid var(--line)', opacity: 0.4 }} />
                            ))}
                        </div>
                    ) : sources.length === 0 ? (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '2rem 0' }}>
                            No inbound webhook sources registered.
                        </p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {sources.map(source => {
                                const testResult = testResults[source.id];
                                return (
                                    <div
                                        key={source.id}
                                        style={{ background: 'var(--bg-raised, #0f172a)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.9rem 1rem' }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <p style={{ margin: '0 0 0.3rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)' }}>
                                                    {source.name}
                                                </p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                                                    <code style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#7dd3fc', background: '#1c2b3a', padding: '0.15rem 0.4rem', borderRadius: '3px', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {source.inboundUrl}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopy(source.inboundUrl, `url-${source.id}`)}
                                                        style={{ fontSize: '0.72rem', padding: '0.15rem 0.4rem', borderRadius: '3px', cursor: 'pointer', background: '#1c2b3a', color: '#7dd3fc', border: '1px solid #1e3a5f' }}
                                                    >
                                                        {copiedId === `url-${source.id}` ? '✓' : 'Copy URL'}
                                                    </button>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                                                    {source.eventCount !== undefined ? `${source.eventCount} events` : '—'}
                                                    {source.lastReceivedAt
                                                        ? ` · Last received ${new Date(source.lastReceivedAt).toLocaleString()}`
                                                        : ''}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                {testResult && (
                                                    <span style={{ fontSize: '0.78rem', color: testResult.ok ? '#86efac' : '#fca5a5' }}>
                                                        {testResult.ok ? `✓ reachable (${testResult.latencyMs}ms)` : `✗ unreachable (${testResult.latencyMs}ms)`}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => void handleTest(source.id)}
                                                    disabled={testingId === source.id}
                                                    style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', borderRadius: '4px', cursor: testingId === source.id ? 'not-allowed' : 'pointer', background: '#1e3a5f', color: '#7dd3fc', border: '1px solid #1e3a5f' }}
                                                >
                                                    {testingId === source.id ? 'Testing…' : 'Test'}
                                                </button>
                                                {confirmDeleteId === source.id ? (
                                                    <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '0.78rem', color: '#fca5a5' }}>Delete?</span>
                                                        <button
                                                            onClick={() => void handleDelete(source.id)}
                                                            disabled={deletingId === source.id}
                                                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', background: '#991b1b', color: '#fff', border: 'none' }}
                                                        >
                                                            {deletingId === source.id ? '…' : 'Yes'}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDeleteId(null)}
                                                            style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer' }}
                                                        >
                                                            No
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDeleteId(source.id)}
                                                        style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem', borderRadius: '4px', cursor: 'pointer', color: '#fca5a5', background: 'transparent', border: '1px solid #991b1b' }}
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── Events tab ────────────────────────────────────────────────── */}
            {activeTab === 'events' && (
                <div>
                    {/* Filters row */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                        <select
                            value={filterSource}
                            onChange={e => setFilterSource(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="">All sources</option>
                            {sources.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <select
                            value={filterLimit}
                            onChange={e => setFilterLimit(e.target.value)}
                            style={{ ...inputStyle, minWidth: '100px' }}
                        >
                            {['20', '50', '100'].map(v => <option key={v} value={v}>{v} events</option>)}
                        </select>
                        <button
                            onClick={() => void fetchEvents()}
                            disabled={eventsLoading}
                            style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem', borderRadius: '4px', cursor: eventsLoading ? 'not-allowed' : 'pointer' }}
                        >
                            {eventsLoading ? 'Loading…' : 'Refresh'}
                        </button>
                    </div>

                    {eventsError && (
                        <p style={{ padding: '0.6rem 0.8rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                            {eventsError}
                        </p>
                    )}

                    {eventsLoading ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr>{['Received', 'Source', 'Method', 'Status', 'Body preview'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {[0, 1, 2].map(i => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--line)', opacity: 0.4 }}>
                                        {[0, 1, 2, 3, 4].map(j => (
                                            <td key={j} style={{ padding: '0.5rem' }}>
                                                <div style={{ height: '0.8rem', background: 'var(--line)', borderRadius: '3px', width: '70%' }} />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : events.length === 0 ? (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '2rem 0' }}>
                            No inbound webhook events yet.
                        </p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr>{['Received', 'Source', 'Method', 'Status', 'Body preview'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {events.map(ev => {
                                        const isExpanded = expandedEventId === ev.id;
                                        const sourceName = sources.find(s => s.id === ev.sourceId)?.name ?? ev.sourceId;
                                        const bodyPreview = ev.body ? ev.body.slice(0, 80) + (ev.body.length > 80 ? '…' : '') : '—';
                                        return (
                                            <>
                                                <tr
                                                    key={ev.id}
                                                    onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                                                    style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                                                >
                                                    <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                                                        {new Date(ev.receivedAt).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '0.5rem', color: 'var(--ink)' }}>{sourceName}</td>
                                                    <td style={{ padding: '0.5rem' }}>
                                                        <code style={{ fontSize: '0.78rem', color: '#c7d2fe' }}>{ev.method}</code>
                                                    </td>
                                                    <td style={{ padding: '0.5rem' }}>{statusBadge(ev.status)}</td>
                                                    <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                                        {bodyPreview}
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr key={`${ev.id}-expanded`} style={{ background: 'var(--bg-raised, #0f172a)' }}>
                                                        <td colSpan={5} style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                                                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                                                {ev.body ?? '(no body)'}
                                                            </pre>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
