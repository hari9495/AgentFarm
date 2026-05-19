'use client';

import { useState, useCallback } from 'react';

type EpisodicRecord = {
    id: string;
    botId: string;
    workspaceId: string;
    pattern: string;
    summary: string;
    confidence: number;
    observedCount: number;
    lastSeen: string;
    createdAt: string;
};

type ListResponse = {
    records: EpisodicRecord[];
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
};

const PAGE_SIZE = 20;

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
    textAlign: 'left',
    fontSize: '0.7rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--ink-muted)',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--line)',
    whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
    fontSize: '0.82rem',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid var(--line)',
    verticalAlign: 'top',
};

const formatDate = (iso: string): string => {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
};

const truncate = (str: string, max: number): string =>
    str.length > max ? `${str.slice(0, max)}…` : str;

export default function AgentEpisodicMemoryPanel() {
    const [botId, setBotId] = useState('');
    const [workspaceId, setWorkspaceId] = useState('');
    const [page, setPage] = useState(1);
    const [records, setRecords] = useState<EpisodicRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [redactingId, setRedactingId] = useState<string | null>(null);

    const load = useCallback(async (targetPage: number) => {
        if (!botId.trim()) {
            setError('Bot ID is required.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                bot_id: botId.trim(),
                workspace_id: workspaceId.trim() || '',
                page: String(targetPage),
                page_size: String(PAGE_SIZE),
            });
            if (!workspaceId.trim()) {
                params.delete('workspace_id');
            }
            const res = await fetch(`/api/episodic-memory?${params.toString()}`, { cache: 'no-store' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { message?: string };
                setError(body.message ?? `HTTP ${res.status}`);
                return;
            }
            const data = await res.json() as ListResponse;
            setRecords(data.records);
            setTotal(data.total);
            setPage(data.page);
            setHasMore(data.has_more);
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [botId, workspaceId]);

    const handleRedact = async (id: string) => {
        setRedactingId(id);
        try {
            const res = await fetch(`/api/episodic-memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok) {
                setRecords((prev) => prev.filter((r) => r.id !== id));
                setTotal((prev) => prev - 1);
            } else {
                const body = await res.json().catch(() => ({})) as { message?: string };
                setError(body.message ?? 'Redact failed.');
            }
        } catch {
            setError('Network error during redact.');
        } finally {
            setRedactingId(null);
        }
    };

    return (
        <section>
            <h2
                style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: 'var(--ink)',
                    marginBottom: '1rem',
                }}
            >
                Episodic Memory
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginBottom: '1.25rem' }}>
                Browse and redact individual agent memory records. Redacted records are permanently removed.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <input
                    style={inputStyle}
                    placeholder="Bot ID"
                    value={botId}
                    onChange={(e) => setBotId(e.target.value)}
                />
                <input
                    style={inputStyle}
                    placeholder="Workspace ID (optional)"
                    value={workspaceId}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                />
                <button
                    style={{
                        padding: '0.3rem 1rem',
                        fontSize: '0.82rem',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        background: 'var(--ink)',
                        color: 'var(--bg)',
                        cursor: 'pointer',
                    }}
                    onClick={() => void load(1)}
                    disabled={loading}
                >
                    {loading ? 'Loading…' : 'Load'}
                </button>
            </div>

            {error && (
                <p style={{ fontSize: '0.82rem', color: 'var(--red, #c62828)', marginBottom: '0.75rem' }}>
                    {error}
                </p>
            )}

            {records.length > 0 && (
                <>
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', marginBottom: '0.5rem' }}>
                        Showing {records.length} of {total} records
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>Pattern</th>
                                    <th style={thStyle}>Summary</th>
                                    <th style={thStyle}>Confidence</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Observed</th>
                                    <th style={thStyle}>Last Seen</th>
                                    <th style={thStyle}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map((r) => (
                                    <tr key={r.id}>
                                        <td style={tdStyle}>{truncate(r.pattern, 60)}</td>
                                        <td style={{ ...tdStyle, color: 'var(--ink-muted)' }}>
                                            {truncate(r.summary, 80)}
                                        </td>
                                        <td style={tdStyle}>{(r.confidence * 100).toFixed(0)}%</td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{r.observedCount}</td>
                                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(r.lastSeen)}</td>
                                        <td style={tdStyle}>
                                            <button
                                                style={{
                                                    fontSize: '0.75rem',
                                                    padding: '0.2rem 0.6rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--red, #c62828)',
                                                    background: 'transparent',
                                                    color: 'var(--red, #c62828)',
                                                    cursor: 'pointer',
                                                    opacity: redactingId === r.id ? 0.5 : 1,
                                                }}
                                                disabled={redactingId === r.id}
                                                onClick={() => void handleRedact(r.id)}
                                            >
                                                {redactingId === r.id ? '…' : 'Redact'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
                        <button
                            style={{
                                fontSize: '0.8rem',
                                padding: '0.25rem 0.75rem',
                                borderRadius: '4px',
                                border: '1px solid var(--line)',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                                cursor: page <= 1 ? 'default' : 'pointer',
                                opacity: page <= 1 ? 0.4 : 1,
                            }}
                            disabled={page <= 1 || loading}
                            onClick={() => void load(page - 1)}
                        >
                            ← Prev
                        </button>
                        <span style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>Page {page}</span>
                        <button
                            style={{
                                fontSize: '0.8rem',
                                padding: '0.25rem 0.75rem',
                                borderRadius: '4px',
                                border: '1px solid var(--line)',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                                cursor: hasMore ? 'pointer' : 'default',
                                opacity: hasMore ? 1 : 0.4,
                            }}
                            disabled={!hasMore || loading}
                            onClick={() => void load(page + 1)}
                        >
                            Next →
                        </button>
                    </div>
                </>
            )}

            {!loading && records.length === 0 && total === 0 && botId.trim() && (
                <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', marginTop: '0.5rem' }}>
                    No episodic memory records found for this agent.
                </p>
            )}
        </section>
    );
}
