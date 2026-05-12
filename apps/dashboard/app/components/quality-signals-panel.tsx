'use client';

import { useEffect, useState } from 'react';

type QualitySignal = {
    id?: string;
    tenantId?: string;
    workspaceId?: string;
    signalType?: string;
    taskId?: string;
    source?: string;
    score?: number;
    recordedAt?: string;
    [key: string]: unknown;
};

type FeedbackRecord = {
    id?: string;
    task_id?: string;
    skill_id?: string;
    rating?: number;
    comment?: string;
    workspace_id?: string;
    createdAt?: string;
    [key: string]: unknown;
};

const TABS = ['Quality signals', 'Agent feedback'] as const;
type Tab = (typeof TABS)[number];

const inputStyle: React.CSSProperties = {
    fontSize: '0.85rem',
    padding: '0.3rem 0.5rem',
    borderRadius: '4px',
    border: '1px solid var(--line)',
    background: 'var(--bg)',
    color: 'var(--ink)',
    minWidth: '10rem',
};

const thStyle: React.CSSProperties = {
    padding: '0.4rem 0.5rem',
    color: 'var(--ink-muted)',
    fontWeight: 600,
    textAlign: 'left',
    borderBottom: '1px solid var(--line)',
};

function scorePill(score: number | undefined): React.ReactNode {
    if (score === undefined) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
    const bg = score >= 0.8 ? '#14532d' : score >= 0.5 ? '#78350f' : '#450a0a';
    const color = score >= 0.8 ? '#86efac' : score >= 0.5 ? '#fde68a' : '#fca5a5';
    return (
        <span style={{ background: bg, color, padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
            {score.toFixed(2)}
        </span>
    );
}

function ratingPill(rating: number | undefined): React.ReactNode {
    if (rating === undefined) return <span style={{ color: 'var(--ink-muted)' }}>—</span>;
    const stars = '★'.repeat(Math.max(0, Math.min(5, rating))) + '☆'.repeat(Math.max(0, 5 - Math.min(5, rating)));
    const color = rating >= 4 ? '#86efac' : rating >= 3 ? '#fde68a' : '#fca5a5';
    return <span style={{ color, fontSize: '0.82rem' }}>{stars}</span>;
}

export default function QualitySignalsPanel() {
    const [activeTab, setActiveTab] = useState<Tab>('Quality signals');

    // Quality signals state
    const [signals, setSignals] = useState<QualitySignal[]>([]);
    const [sigLoading, setSigLoading] = useState(false);
    const [sigError, setSigError] = useState<string | null>(null);
    const [sigTypeFilter, setSigTypeFilter] = useState('');
    const [sigWsFilter, setSigWsFilter] = useState('');
    const [sigLimit, setSigLimit] = useState('50');

    // Agent feedback state
    const [feedbackList, setFeedbackList] = useState<FeedbackRecord[]>([]);
    const [fbLoading, setFbLoading] = useState(false);
    const [fbError, setFbError] = useState<string | null>(null);
    const [fbTaskId, setFbTaskId] = useState('');
    const [fbLimit, setFbLimit] = useState('50');

    const fetchSignals = async () => {
        setSigLoading(true);
        setSigError(null);
        try {
            const p = new URLSearchParams({ limit: sigLimit });
            if (sigWsFilter.trim()) p.set('workspaceId', sigWsFilter.trim());
            const res = await fetch(`/api/quality/signals?${p.toString()}`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { signals?: QualitySignal[] };
            let list = data.signals ?? [];
            if (sigTypeFilter.trim()) {
                list = list.filter(s => s.signalType?.toLowerCase().includes(sigTypeFilter.trim().toLowerCase()));
            }
            setSignals(list);
        } catch {
            setSigError('Failed to load quality signals.');
        } finally {
            setSigLoading(false);
        }
    };

    const fetchFeedback = async () => {
        setFbLoading(true);
        setFbError(null);
        try {
            let url: string;
            if (fbTaskId.trim()) {
                url = `/api/quality/feedback/${encodeURIComponent(fbTaskId.trim())}`;
            } else {
                url = `/api/quality/feedback?limit=${encodeURIComponent(fbLimit)}`;
            }
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as { feedback?: FeedbackRecord[] };
            setFeedbackList(data.feedback ?? []);
        } catch {
            setFbError('Failed to load feedback.');
        } finally {
            setFbLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'Quality signals') void fetchSignals();
        else void fetchFeedback();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

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
            <h2 style={{ marginBottom: '0.2rem' }}>Quality Signals</h2>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
                Monitor quality signals and agent feedback across tasks.
            </p>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
                {TABS.map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>{t}</button>
                ))}
            </div>

            {/* Quality signals tab */}
            {activeTab === 'Quality signals' && (
                <div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                        <input type="text" placeholder="Workspace ID" value={sigWsFilter} onChange={e => setSigWsFilter(e.target.value)} style={inputStyle} />
                        <input type="text" placeholder="Signal type filter" value={sigTypeFilter} onChange={e => setSigTypeFilter(e.target.value)} style={inputStyle} />
                        <input type="number" placeholder="Limit" value={sigLimit} min={10} max={200} onChange={e => setSigLimit(e.target.value)} style={{ ...inputStyle, minWidth: '5rem' }} />
                        <button onClick={() => void fetchSignals()} disabled={sigLoading} style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer' }}>
                            {sigLoading ? 'Loading…' : 'Refresh'}
                        </button>
                    </div>

                    {sigError && (
                        <p style={{ padding: '0.6rem 0.8rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                            {sigError}
                        </p>
                    )}

                    {sigLoading && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr>{['Agent / Workspace', 'Signal type', 'Score', 'Task ID', 'Recorded'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                            <tbody>{[0, 1, 2].map(i => <tr key={i} style={{ borderBottom: '1px solid var(--line)', opacity: 0.4 }}>{[0, 1, 2, 3, 4].map(j => <td key={j} style={{ padding: '0.5rem' }}><div style={{ height: '0.8rem', background: 'var(--line)', borderRadius: '3px', width: '70%' }} /></td>)}</tr>)}</tbody>
                        </table>
                    )}

                    {!sigLoading && signals.length === 0 && !sigError && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '1.5rem 0' }}>No quality signals found.</p>
                    )}

                    {!sigLoading && signals.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead><tr>{['Agent / Workspace', 'Signal type', 'Score', 'Task ID', 'Recorded'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {signals.map((s, i) => {
                                        const ws = s.workspaceId ?? s.source ?? '—';
                                        const recorded = s.recordedAt ? new Date(s.recordedAt).toLocaleString() : '—';
                                        const tid = s.taskId ?? '—';
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{ws}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink)' }}>{s.signalType ?? '—'}</td>
                                                <td style={{ padding: '0.5rem' }}>{scorePill(s.score)}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{tid}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{recorded}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Agent feedback tab */}
            {activeTab === 'Agent feedback' && (
                <div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Task ID (leave empty for recent)"
                            value={fbTaskId}
                            onChange={e => setFbTaskId(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') void fetchFeedback(); }}
                            style={{ ...inputStyle, minWidth: '16rem' }}
                        />
                        {!fbTaskId.trim() && (
                            <input type="number" placeholder="Limit" value={fbLimit} min={10} max={200} onChange={e => setFbLimit(e.target.value)} style={{ ...inputStyle, minWidth: '5rem' }} />
                        )}
                        <button onClick={() => void fetchFeedback()} disabled={fbLoading} style={{ fontSize: '0.85rem', padding: '0.3rem 0.75rem', borderRadius: '4px', cursor: 'pointer' }}>
                            {fbLoading ? 'Loading…' : 'Search'}
                        </button>
                    </div>

                    {fbError && (
                        <p style={{ padding: '0.6rem 0.8rem', background: '#450a0a', border: '1px solid #991b1b', borderRadius: '6px', color: '#fca5a5', fontSize: '0.84rem', marginBottom: '0.75rem' }}>
                            {fbError}
                        </p>
                    )}

                    {fbLoading && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr>{['Task ID', 'Skill', 'Rating', 'Comment', 'Submitted'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                            <tbody>{[0, 1, 2].map(i => <tr key={i} style={{ borderBottom: '1px solid var(--line)', opacity: 0.4 }}>{[0, 1, 2, 3, 4].map(j => <td key={j} style={{ padding: '0.5rem' }}><div style={{ height: '0.8rem', background: 'var(--line)', borderRadius: '3px', width: '70%' }} /></td>)}</tr>)}</tbody>
                        </table>
                    )}

                    {!fbLoading && feedbackList.length === 0 && !fbError && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.86rem', textAlign: 'center', padding: '1.5rem 0' }}>No feedback found.</p>
                    )}

                    {!fbLoading && feedbackList.length > 0 && (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead><tr>{['Task ID', 'Skill', 'Rating', 'Comment', 'Submitted'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {feedbackList.map((f, i) => {
                                        const submitted = f.createdAt ? new Date(f.createdAt).toLocaleString() : '—';
                                        const comment = f.comment ?? '—';
                                        const commentDisplay = comment.length > 60 ? comment.slice(0, 59) + '…' : comment;
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{f.task_id ?? '—'}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)' }}>{f.skill_id ?? '—'}</td>
                                                <td style={{ padding: '0.5rem' }}>{ratingPill(f.rating)}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)' }}>{commentDisplay}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{submitted}</td>
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
