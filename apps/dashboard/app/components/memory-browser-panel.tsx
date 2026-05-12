'use client';

import { useState } from 'react';

type MemoryRecord = {
    id?: string;
    key?: string;
    value?: string;
    summary?: string;
    taskId?: string;
    type?: string;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: unknown;
};

type Pattern = {
    id?: string;
    patternId?: string;
    pattern: string;
    confidence?: number;
    observedCount?: number;
    lastSeen?: string;
    [key: string]: unknown;
};

const TABS = ['Workspace memory', 'Patterns'] as const;
type Tab = (typeof TABS)[number];

const inputStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    padding: '0.3rem 0.5rem',
    borderRadius: '4px',
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    color: 'var(--ink)',
    minWidth: '12rem',
};

const thStyle: React.CSSProperties = {
    padding: '0.4rem 0.5rem',
    color: 'var(--ink-muted)',
    fontWeight: 600,
    textAlign: 'left',
    borderBottom: '1px solid var(--line)',
};

function truncate(s: string | undefined, max = 120): string {
    if (!s) return '—';
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function confidencePill(score: number | undefined): React.ReactNode {
    if (score === undefined) return null;
    const bg = score >= 0.8 ? '#14532d' : score >= 0.5 ? '#78350f' : '#450a0a';
    const color = score >= 0.8 ? '#86efac' : score >= 0.5 ? '#fde68a' : '#fca5a5';
    return (
        <span style={{ background: bg, color, padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
            {(score * 100).toFixed(0)}%
        </span>
    );
}

export default function MemoryBrowserPanel() {
    const [activeTab, setActiveTab] = useState<Tab>('Workspace memory');

    // Workspace memory state
    const [workspaceId, setWorkspaceId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [records, setRecords] = useState<MemoryRecord[]>([]);
    const [memLoading, setMemLoading] = useState(false);
    const [memError, setMemError] = useState<string | null>(null);

    // Patterns state
    const [patternWsId, setPatternWsId] = useState('');
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [patLoading, setPatLoading] = useState(false);
    const [patError, setPatError] = useState<string | null>(null);
    const [reinforcing, setReinforcing] = useState<string | null>(null);
    const [reinforceMsg, setReinforceMsg] = useState<string | null>(null);

    const fetchMemory = async () => {
        if (!workspaceId.trim() && !searchQuery.trim()) {
            setMemError('Enter a workspace ID or search query.');
            return;
        }
        setMemLoading(true);
        setMemError(null);
        try {
            let url: string;
            if (searchQuery.trim()) {
                const p = new URLSearchParams({ q: searchQuery.trim() });
                if (workspaceId.trim()) p.set('repoName', workspaceId.trim());
                url = `/api/memory/search?${p.toString()}`;
            } else {
                url = `/api/workspaces/${encodeURIComponent(workspaceId.trim())}/memory`;
            }
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { memories?: MemoryRecord[]; results?: MemoryRecord[] };
            setRecords(data.memories ?? data.results ?? []);
        } catch {
            setMemError('Failed to load memory records.');
        } finally {
            setMemLoading(false);
        }
    };

    const fetchPatterns = async () => {
        if (!patternWsId.trim()) {
            setPatError('Enter a workspace ID to load patterns.');
            return;
        }
        setPatLoading(true);
        setPatError(null);
        setReinforceMsg(null);
        try {
            const res = await fetch(
                `/api/workspaces/${encodeURIComponent(patternWsId.trim())}/memory/patterns`,
                { cache: 'no-store' },
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { patterns?: Pattern[] };
            setPatterns(data.patterns ?? []);
        } catch {
            setPatError('Failed to load patterns.');
        } finally {
            setPatLoading(false);
        }
    };

    const handleReinforce = async (patternId: string) => {
        setReinforcing(patternId);
        setReinforceMsg(null);
        try {
            const res = await fetch(`/api/memory/patterns/${encodeURIComponent(patternId)}/reinforce`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const body = (await res.json()) as { message?: string };
            setReinforceMsg(body.message ?? 'Reinforced.');
        } catch {
            setReinforceMsg('Failed to reinforce pattern.');
        } finally {
            setReinforcing(null);
        }
    };

    const tabStyle = (t: Tab): React.CSSProperties => ({
        padding: '0.35rem 0.85rem',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: activeTab === t ? 600 : 400,
        background: activeTab === t ? 'var(--accent, #2563eb)' : 'transparent',
        color: activeTab === t ? '#fff' : 'var(--ink-muted)',
        border: 'none',
    });

    return (
        <section className="card" style={{ marginTop: '1rem' }}>
            <h2 style={{ marginBottom: '0.2rem' }}>Agent Memory Browser</h2>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                Browse workspace memory records and learned patterns.
            </p>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
                {TABS.map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>{t}</button>
                ))}
            </div>

            {/* Workspace memory tab */}
            {activeTab === 'Workspace memory' && (
                <div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Workspace ID"
                            value={workspaceId}
                            onChange={e => setWorkspaceId(e.target.value)}
                            style={inputStyle}
                        />
                        <input
                            type="text"
                            placeholder="Search query (optional)"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void fetchMemory(); }}
                            style={{ ...inputStyle, minWidth: '16rem' }}
                        />
                        <button onClick={() => void fetchMemory()} disabled={memLoading} style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer' }}>
                            {memLoading ? 'Loading…' : 'Load'}
                        </button>
                    </div>

                    {memError && (
                        <p style={{ padding: '0.6rem 0.8rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                            {memError}
                        </p>
                    )}

                    {memLoading && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr>{['Key / Task', 'Summary', 'Type', 'Created'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                            <tbody>
                                {[0, 1, 2].map(i => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--line)', opacity: 0.4 }}>
                                        {[0, 1, 2, 3].map(j => <td key={j} style={{ padding: '0.5rem' }}><div style={{ height: '0.8rem', background: 'var(--line)', borderRadius: '3px', width: '70%' }} /></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {!memLoading && records.length === 0 && !memError && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '1.5rem 0' }}>
                            No records found. Enter a workspace ID and click Load.
                        </p>
                    )}

                    {!memLoading && records.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead><tr>{['Key / Task', 'Summary', 'Type', 'Created'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {records.map((r, i) => {
                                        const keyVal = r.key ?? r.taskId ?? r.id ?? String(i);
                                        const summaryVal = truncate(r.summary ?? r.value);
                                        const created = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—';
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{String(keyVal)}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', maxWidth: '30rem' }}>{summaryVal}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)' }}>{r.type ?? '—'}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{created}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Patterns tab */}
            {activeTab === 'Patterns' && (
                <div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Workspace ID"
                            value={patternWsId}
                            onChange={e => setPatternWsId(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void fetchPatterns(); }}
                            style={inputStyle}
                        />
                        <button onClick={() => void fetchPatterns()} disabled={patLoading} style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer' }}>
                            {patLoading ? 'Loading…' : 'Load patterns'}
                        </button>
                    </div>

                    {reinforceMsg && (
                        <p style={{ padding: '0.5rem 0.75rem', background: '#052e16', border: '1px solid #166534', borderRadius: '6px', color: '#86efac', fontSize: '0.83rem', marginBottom: '0.75rem' }}>
                            {reinforceMsg}
                        </p>
                    )}

                    {patError && (
                        <p style={{ padding: '0.6rem 0.8rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                            {patError}
                        </p>
                    )}

                    {patLoading && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr>{['Pattern', 'Confidence', 'Observed', 'Last seen', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                            <tbody>
                                {[0, 1, 2].map(i => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--line)', opacity: 0.4 }}>
                                        {[0, 1, 2, 3, 4].map(j => <td key={j} style={{ padding: '0.5rem' }}><div style={{ height: '0.8rem', background: 'var(--line)', borderRadius: '3px', width: '70%' }} /></td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {!patLoading && patterns.length === 0 && !patError && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '1.5rem 0' }}>
                            No patterns found. Enter a workspace ID and click Load patterns.
                        </p>
                    )}

                    {!patLoading && patterns.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead><tr>{['Pattern', 'Confidence', 'Observed', 'Last seen', ''].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {patterns.map((p, i) => {
                                        const pid = p.id ?? p.patternId ?? String(i);
                                        const lastSeen = p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : '—';
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink)', maxWidth: '28rem' }}>{truncate(p.pattern, 100)}</td>
                                                <td style={{ padding: '0.5rem' }}>{confidencePill(p.confidence)}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)' }}>{p.observedCount ?? '—'}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{lastSeen}</td>
                                                <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => void handleReinforce(String(pid))}
                                                        disabled={reinforcing === String(pid)}
                                                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', background: '#1c2b3a', color: '#7dd3fc', border: '1px solid #1d4ed8' }}
                                                    >
                                                        {reinforcing === String(pid) ? '…' : 'Reinforce'}
                                                    </button>
                                                </td>
                                            </tr>
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
