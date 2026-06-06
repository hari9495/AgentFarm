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
    padding: '7px 11px',
    borderRadius: 9,
    border: '1px solid var(--line)',
    background: 'var(--card)',
    color: 'var(--ink)',
    fontSize: '0.84rem',
    minWidth: '180px',
    outline: 'none',
};

const EVENT_STATUS_BADGE: Record<string, { bg: string; color: string; border: string }> = {
    processed: { bg: 'rgba(26,122,74,0.08)',  color: 'var(--ok)', border: 'rgba(26,122,74,0.2)'  },
    failed:    { bg: 'rgba(196,22,28,0.08)',  color: 'var(--danger)', border: 'rgba(196,22,28,0.2)'  },
    pending:   { bg: 'rgba(180,83,9,0.08)',   color: 'var(--warn)', border: 'rgba(180,83,9,0.2)'   },
};

function statusBadge(status: string) {
    const s = EVENT_STATUS_BADGE[status] ?? { bg: '#f5f5f7', color: 'var(--ink-muted)', border: '#d2d2d7' };
    return (
        <span style={{ padding: '2px 9px', borderRadius: 9999, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
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
                        <div style={{ background: 'var(--ok-bg)', border: '1px solid rgba(26,122,74,0.25)', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ok)', margin: '0 0 8px' }}>
                                ✓ Source created — save this secret now. It will not be shown again.
                            </p>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--ink)', background: 'var(--bg)', border: '1px solid var(--line)', padding: '6px 10px', borderRadius: 8, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {newSecret}
                                </code>
                                <button onClick={() => handleCopy(newSecret, 'secret')} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 9999, cursor: 'pointer', background: '#1a7a4a', color: '#fff', border: 'none', fontWeight: 600 }}>
                                    {copiedId === 'secret' ? '✓ Copied' : 'Copy Secret'}
                                </button>
                                <button onClick={() => { setNewSecret(null); setNewSourceId(null); }} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 9999, cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Error banner */}
                    {sourcesError && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 10, color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
                            ⚠ {sourcesError}
                        </div>
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
                        <div style={{ border: '1px solid rgba(0,102,204,0.25)', borderRadius: 16, background: 'var(--card)', padding: '18px 20px', marginBottom: 14, boxShadow: '0 0 0 4px rgba(0,102,204,0.04)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Register New Source</div>
                            <form onSubmit={e => void handleAddSource(e)} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                                            Source Name <span style={{ color: 'var(--danger)' }}>*</span>
                                        </label>
                                        <input type="text" placeholder="e.g. GitHub - Engineering" value={addName} onChange={e => setAddName(e.target.value)} required style={inputStyle} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                                            Description
                                        </label>
                                        <input type="text" placeholder="What service sends events here?" value={addDescription} onChange={e => setAddDescription(e.target.value)} style={inputStyle} />
                                    </div>
                                </div>
                                {addError && <div style={{ padding: '7px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>⚠ {addError}</div>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={() => setShowAddForm(false)} style={{ padding: '7px 16px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                                    <button type="submit" disabled={adding} style={{ padding: '7px 20px', borderRadius: 9999, border: 'none', background: adding ? '#aeaeb2' : '#0066cc', color: '#fff', fontSize: 13, fontWeight: 700, cursor: adding ? 'not-allowed' : 'pointer' }}>
                                        {adding ? 'Creating…' : 'Create Source'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {/* Sources list */}
                    {sourcesLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{ height: '4rem', background: 'var(--bg)', borderRadius: 14, border: '1px solid var(--line)', opacity: 0.6 }} />
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
                                        style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <p style={{ margin: '0 0 0.3rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--ink)' }}>
                                                    {source.name}
                                                </p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                                                    <code style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--accent)', background: 'var(--bg)', border: '1px solid var(--line)', padding: '4px 8px', borderRadius: 7, maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {source.inboundUrl}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopy(source.inboundUrl, `url-${source.id}`)}
                                                        style={{ fontSize: 11, padding: '3px 9px', borderRadius: 9999, cursor: 'pointer', background: 'var(--card)', color: 'var(--accent)', border: '1px solid rgba(0,102,204,0.3)', fontWeight: 600 }}
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
                                                    <span style={{ fontSize: 12, color: testResult.ok ? '#1a7a4a' : '#c4161c', fontWeight: 600 }}>
                                                        {testResult.ok ? `✓ reachable (${testResult.latencyMs}ms)` : `✗ unreachable (${testResult.latencyMs}ms)`}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={() => void handleTest(source.id)}
                                                    disabled={testingId === source.id}
                                                    style={{ fontSize: 11, padding: '5px 11px', borderRadius: 9999, cursor: testingId === source.id ? 'not-allowed' : 'pointer', background: 'var(--card)', color: 'var(--ink-soft)', border: '1px solid var(--line)', fontWeight: 600 }}
                                                >
                                                    {testingId === source.id ? 'Testing…' : 'Test'}
                                                </button>
                                                {confirmDeleteId === source.id ? (
                                                    <span style={{ display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                                                        <span style={{ fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}>Delete?</span>
                                                        <button
                                                            onClick={() => void handleDelete(source.id)}
                                                            disabled={deletingId === source.id}
                                                            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 9999, cursor: 'pointer', background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger-border)', fontWeight: 700 }}
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
                                                        style={{ fontSize: 11, padding: '5px 11px', borderRadius: 9999, cursor: 'pointer', color: 'var(--danger)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', fontWeight: 600 }}
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
                        <p style={{ padding: '8px 12px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 10, color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>
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
