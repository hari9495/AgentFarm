'use client';

import { useEffect, useState, useCallback } from 'react';

type TaskHistoryPanelProps = { tenantId: string };

type TaskRecord = {
    id: string;
    taskId: string;
    botId: string;
    workspaceId: string;
    modelProvider: string;
    modelProfile: string;
    modelTier: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    estimatedCostUsd: number | null;
    latencyMs: number;
    outcome: string;
    executedAt: string;
};

type TasksResponse = {
    tasks: TaskRecord[];
    total: number;
    hasMore: boolean;
    nextCursor: string | null;
};

const OUTCOME_BADGE: Record<string, { bg: string; color: string }> = {
    success: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
    approval_queued: { bg: '#fef9c3', color: '#854d0e' },
};

function formatCost(v: number | null): string {
    if (v === null) return '—';
    return `$${v.toFixed(4)}`;
}

function formatTokens(v: number | null): string {
    if (v === null) return '—';
    return v.toLocaleString();
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return (
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
}

export default function TaskHistoryPanel({ tenantId: _tenantId }: TaskHistoryPanelProps) {
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterOutcome, setFilterOutcome] = useState('');
    const [filterBotId, setFilterBotId] = useState('');
    const [filterProvider, setFilterProvider] = useState('');
    const [filterFrom, setFilterFrom] = useState('');
    const [filterTo, setFilterTo] = useState('');

    const fetchTasks = useCallback(
        async (reset: boolean, cursor?: string | null) => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams();
                if (filterOutcome) params.set('outcome', filterOutcome);
                if (filterBotId.trim()) params.set('botId', filterBotId.trim());
                if (filterProvider) params.set('modelProvider', filterProvider);
                if (filterFrom) params.set('from', filterFrom);
                if (filterTo) params.set('to', filterTo);
                if (!reset && cursor) params.set('cursor', cursor);

                const res = await fetch(`/api/analytics/tasks?${params.toString()}`, {
                    cache: 'no-store',
                });
                const data = (await res.json()) as TasksResponse & { error?: string };
                if (!res.ok) {
                    setError(data.error ?? 'Failed to load task history.');
                    return;
                }
                if (reset) {
                    setTasks(data.tasks ?? []);
                    setNextCursor(data.nextCursor ?? null);
                } else {
                    setTasks((prev) => [...prev, ...(data.tasks ?? [])]);
                    setNextCursor(data.nextCursor ?? null);
                }
                setTotal(data.total ?? 0);
                setHasMore(data.hasMore ?? false);
            } catch {
                setError('Network error loading task history.');
            } finally {
                setLoading(false);
            }
        },
        [filterOutcome, filterBotId, filterProvider, filterFrom, filterTo],
    );

    useEffect(() => {
        void fetchTasks(true, null);
    }, [fetchTasks]);

    function clearFilters() {
        setFilterOutcome('');
        setFilterBotId('');
        setFilterProvider('');
        setFilterFrom('');
        setFilterTo('');
    }

    const activeFilters: string[] = [];
    if (filterOutcome) activeFilters.push(`outcome: ${filterOutcome}`);
    if (filterProvider) activeFilters.push(`provider: ${filterProvider}`);
    if (filterBotId.trim()) activeFilters.push(`bot: ${filterBotId.trim()}`);
    if (filterFrom) activeFilters.push(`from: ${filterFrom}`);
    if (filterTo) activeFilters.push(`to: ${filterTo}`);

    const TH: React.CSSProperties = { padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 };
    const TD: React.CSSProperties = { padding: '0.6rem 0.75rem' };
    const TD_MUTED: React.CSSProperties = { padding: '0.6rem 0.75rem', color: 'var(--ink-muted)', fontSize: '0.8rem' };
    const FIELD_STYLE: React.CSSProperties = {
        padding: '0.35rem 0.5rem',
        fontSize: '0.85rem',
        border: '1px solid var(--line)',
        borderRadius: '4px',
        background: 'var(--bg)',
        color: 'var(--ink)',
    };

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>

            {/* ── Filter bar ── */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.6rem',
                    marginBottom: '1rem',
                    alignItems: 'flex-end',
                }}
            >
                <div>
                    <label
                        style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}
                    >
                        Outcome
                    </label>
                    <select
                        value={filterOutcome}
                        onChange={(e) => setFilterOutcome(e.target.value)}
                        style={{ ...FIELD_STYLE, minWidth: '150px' }}
                    >
                        <option value="">All</option>
                        <option value="success">Success</option>
                        <option value="failed">Failed</option>
                        <option value="approval_queued">Approval Queued</option>
                    </select>
                </div>
                <div>
                    <label
                        style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}
                    >
                        Provider
                    </label>
                    <select
                        value={filterProvider}
                        onChange={(e) => setFilterProvider(e.target.value)}
                        style={{ ...FIELD_STYLE, minWidth: '140px' }}
                    >
                        <option value="">All</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="azure">Azure</option>
                        <option value="google">Google</option>
                    </select>
                </div>
                <div>
                    <label
                        style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}
                    >
                        Bot ID
                    </label>
                    <input
                        type="text"
                        value={filterBotId}
                        onChange={(e) => setFilterBotId(e.target.value)}
                        placeholder="Filter by bot ID"
                        style={{ ...FIELD_STYLE, minWidth: '160px' }}
                    />
                </div>
                <div>
                    <label
                        style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}
                    >
                        From
                    </label>
                    <input
                        type="date"
                        value={filterFrom}
                        onChange={(e) => setFilterFrom(e.target.value)}
                        style={FIELD_STYLE}
                    />
                </div>
                <div>
                    <label
                        style={{ display: 'block', fontSize: '0.75rem', color: 'var(--ink-muted)', marginBottom: '0.2rem' }}
                    >
                        To
                    </label>
                    <input
                        type="date"
                        value={filterTo}
                        onChange={(e) => setFilterTo(e.target.value)}
                        style={FIELD_STYLE}
                    />
                </div>
                {activeFilters.length > 0 && (
                    <button
                        onClick={clearFilters}
                        style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.8rem',
                            border: '1px solid var(--line)',
                            borderRadius: '4px',
                            background: 'var(--bg)',
                            color: 'var(--ink-muted)',
                            cursor: 'pointer',
                        }}
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* ── Summary bar ── */}
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    alignItems: 'center',
                    marginBottom: '0.75rem',
                    fontSize: '0.8rem',
                    color: 'var(--ink-muted)',
                }}
            >
                <span>
                    Showing {tasks.length} of {total.toLocaleString()} total tasks
                </span>
                {activeFilters.map((f) => (
                    <span
                        key={f}
                        style={{
                            display: 'inline-block',
                            padding: '0.1rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: '#f1f5f9',
                            color: '#475569',
                        }}
                    >
                        {f}
                    </span>
                ))}
            </div>

            {/* ── Error banner ── */}
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

            {/* ── Table ── */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                            <th style={TH}>Task ID</th>
                            <th style={TH}>Bot ID</th>
                            <th style={TH}>Provider</th>
                            <th style={TH}>Model</th>
                            <th style={TH}>Outcome</th>
                            <th style={TH}>Tokens</th>
                            <th style={TH}>Cost</th>
                            <th style={TH}>Latency</th>
                            <th style={TH}>Executed At</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td
                                            colSpan={9}
                                            style={{
                                                padding: '0.8rem 0.75rem',
                                                color: 'var(--ink-muted)',
                                                fontSize: '0.8rem',
                                            }}
                                        >
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    width: `${60 + (i % 3) * 20}%`,
                                                    height: '0.9rem',
                                                    background: 'var(--line)',
                                                    borderRadius: '3px',
                                                    opacity: 0.5,
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </>
                        )}
                        {!loading && tasks.length === 0 && (
                            <tr>
                                <td
                                    colSpan={9}
                                    style={{
                                        padding: '2rem',
                                        textAlign: 'center',
                                        color: 'var(--ink-muted)',
                                        fontStyle: 'italic',
                                    }}
                                >
                                    No task records found for the selected filters.
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            tasks.map((task) => {
                                const badge = OUTCOME_BADGE[task.outcome] ?? OUTCOME_BADGE['failed'];
                                return (
                                    <tr key={task.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                                            {task.taskId.slice(0, 12)}
                                        </td>
                                        <td style={{ ...TD_MUTED, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                            {task.botId.slice(0, 12)}
                                        </td>
                                        <td style={TD_MUTED}>{task.modelProvider}</td>
                                        <td style={TD_MUTED}>{task.modelProfile}</td>
                                        <td style={TD}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: badge.bg,
                                                    color: badge.color,
                                                }}
                                            >
                                                {task.outcome}
                                            </span>
                                        </td>
                                        <td style={TD_MUTED}>{formatTokens(task.totalTokens)}</td>
                                        <td style={TD_MUTED}>{formatCost(task.estimatedCostUsd)}</td>
                                        <td style={TD_MUTED}>{task.latencyMs}ms</td>
                                        <td style={TD_MUTED}>{formatDate(task.executedAt)}</td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* ── Load More ── */}
            {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                    <button
                        className="secondary-action"
                        onClick={() => { void fetchTasks(false, nextCursor); }}
                        disabled={loading}
                        style={{ textDecoration: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
                    >
                        {loading ? 'Loading…' : 'Load more'}
                    </button>
                </div>
            )}
        </section>
    );
}
