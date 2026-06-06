'use client';

import { useEffect, useState, useCallback } from 'react';

type AbTestsPanelProps = { tenantId: string };

type AbTest = {
    id: string;
    tenantId: string;
    botId: string;
    name: string;
    versionAId: string;
    versionBId: string;
    trafficSplit: number;
    status: string;
    conclusionNote: string | null;
    createdAt: string;
    updatedAt: string;
};

type VariantStats = {
    variant: 'A' | 'B';
    versionId: string;
    assignmentCount: number;
    avgScore: number | null;
    successCount: null;
    failureCount: null;
    avgLatencyMs: null;
};

type AbTestResults = {
    abTestId: string;
    name: string;
    status: string;
    a: VariantStats;
    b: VariantStats;
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    active: { bg: 'var(--ok-bg)', color: 'var(--ok)' },
    paused: { bg: 'var(--warn-bg)', color: 'var(--warn)' },
    concluded: { bg: 'var(--bg)', color: 'var(--ink-muted)' },
};

export default function AbTestsPanel({ tenantId: _tenantId }: AbTestsPanelProps) {
    const [abTests, setAbTests] = useState<AbTest[]>([]);
    const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
    const [results, setResults] = useState<AbTestResults | null>(null);
    const [loading, setLoading] = useState(true);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [concluding, setConcluding] = useState<string | null>(null);
    const [showConcluded, setShowConcluded] = useState(false);
    const [conclusionNotes, setConclusionNotes] = useState<Record<string, string>>({});
    const [openConcludeId, setOpenConcludeId] = useState<string | null>(null);

    // Create form
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formBotId, setFormBotId] = useState('');
    const [formVersionA, setFormVersionA] = useState('');
    const [formVersionB, setFormVersionB] = useState('');
    const [formSplit, setFormSplit] = useState(50);

    const fetchAbTests = useCallback(async () => {
        try {
            const res = await fetch('/api/ab-tests', { cache: 'no-store' });
            const data = (await res.json()) as { abTests?: AbTest[]; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load A/B tests.');
            } else {
                setAbTests(data.abTests ?? []);
                setError(null);
            }
        } catch {
            setError('Network error loading A/B tests.');
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        fetchAbTests().finally(() => setLoading(false));
    }, [fetchAbTests]);

    const fetchResults = useCallback(async (abTestId: string) => {
        setSelectedTestId(abTestId);
        setResultsLoading(true);
        setResults(null);
        try {
            const res = await fetch(
                `/api/ab-tests/${encodeURIComponent(abTestId)}/results`,
                { cache: 'no-store' },
            );
            const data = (await res.json()) as { results?: AbTestResults; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load test results.');
            } else {
                setResults(data.results ?? null);
                setError(null);
            }
        } catch {
            setError('Network error loading test results.');
        } finally {
            setResultsLoading(false);
        }
    }, []);

    async function handleConclude(test: AbTest) {
        if (!window.confirm(`Conclude A/B test "${test.name}"? This cannot be undone.`)) return;
        setConcluding(test.id);
        const note = conclusionNotes[test.id] ?? '';
        try {
            const res = await fetch(
                `/api/ab-tests/${encodeURIComponent(test.id)}/conclude`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conclusionNote: note || undefined }),
                },
            );
            const data = (await res.json()) as { abTest?: AbTest; error?: string; message?: string };
            if (!res.ok) {
                window.alert(data.message ?? data.error ?? 'Failed to conclude test.');
                return;
            }
            setOpenConcludeId(null);
            if (selectedTestId === test.id) {
                setSelectedTestId(null);
                setResults(null);
            }
            await fetchAbTests();
        } catch {
            window.alert('Network error concluding test.');
        } finally {
            setConcluding(null);
        }
    }

    async function handleCreate() {
        if (!formName.trim() || !formBotId.trim() || !formVersionA.trim() || !formVersionB.trim()) {
            setCreateError('Name, Bot ID, Version A ID, and Version B ID are required.');
            return;
        }
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/ab-tests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    botId: formBotId.trim(),
                    name: formName.trim(),
                    versionAId: formVersionA.trim(),
                    versionBId: formVersionB.trim(),
                    trafficSplit: formSplit,
                }),
            });
            const data = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) {
                setCreateError(data.message ?? data.error ?? 'Failed to create test.');
                return;
            }
            setShowCreateForm(false);
            setFormName(''); setFormBotId(''); setFormVersionA(''); setFormVersionB(''); setFormSplit(50);
            await fetchAbTests();
        } catch {
            setCreateError('Network error creating test.');
        } finally {
            setCreating(false);
        }
    }

    const visibleTests = showConcluded
        ? abTests
        : abTests.filter((t) => t.status !== 'concluded');

    const TH: React.CSSProperties = { padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 };
    const TD: React.CSSProperties = { padding: '0.65rem 0.75rem' };
    const TD_MUTED: React.CSSProperties = { padding: '0.65rem 0.75rem', color: 'var(--ink-muted)', fontSize: '0.8rem' };
    const TD_SOFT: React.CSSProperties = { padding: '0.65rem 0.75rem', color: 'var(--ink-soft)' };

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '1rem',
                }}
            >
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                    A/B Tests
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--ink-muted)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={showConcluded}
                            onChange={(e) => setShowConcluded(e.target.checked)}
                        />
                        Show concluded
                    </label>
                    <button
                        type="button"
                        className="primary-action"
                        style={{ fontSize: '0.8rem', padding: '0.3rem 0.7rem' }}
                        onClick={() => { setShowCreateForm((v) => !v); setCreateError(null); }}
                    >
                        {showCreateForm ? 'Cancel' : '+ New Test'}
                    </button>
                </div>
            </div>

            {/* Create form */}
            {showCreateForm && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)' }}>New A/B Test</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.6rem' }}>
                        {[
                            ['Test Name *', formName, setFormName, 'e.g. prompt-v2-vs-v1'],
                            ['Bot ID *', formBotId, setFormBotId, 'e.g. bot_dev_001'],
                            ['Version A ID *', formVersionA, setFormVersionA, 'control version ID'],
                            ['Version B ID *', formVersionB, setFormVersionB, 'challenger version ID'],
                        ].map(([label, val, setter, ph]) => (
                            <label key={label as string} style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                {label as string}
                                <input
                                    type="text"
                                    value={val as string}
                                    onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                                    placeholder={ph as string}
                                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: '0.2rem', padding: '0.3rem 0.5rem', border: '1px solid var(--line)', borderRadius: 5, fontSize: '0.82rem' }}
                                />
                            </label>
                        ))}
                    </div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.6rem' }}>
                        Traffic Split — A: {formSplit}% / B: {100 - formSplit}%
                        <input type="range" min={10} max={90} value={formSplit} onChange={(e) => setFormSplit(Number(e.target.value))} style={{ display: 'block', width: '100%', marginTop: '0.2rem' }} />
                    </label>
                    {createError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0 0 0.5rem' }}>{createError}</p>}
                    <button type="button" className="primary-action" disabled={creating} onClick={() => void handleCreate()} style={{ fontSize: '0.8rem', padding: '0.35rem 0.8rem' }}>
                        {creating ? 'Creating…' : 'Create Test'}
                    </button>
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div
                    style={{
                        background: 'var(--danger-bg)',
                        border: '1px solid var(--danger-border)',
                        borderRadius: '6px',
                        padding: '0.65rem 0.9rem',
                        color: 'var(--danger)',
                        fontSize: '0.85rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    {error}
                </div>
            )}

            {/* Tests table */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                            <th style={TH}>Name</th>
                            <th style={TH}>Bot ID</th>
                            <th style={TH}>Split (A/B)</th>
                            <th style={TH}>Status</th>
                            <th style={TH}>Created</th>
                            <th style={TH}></th>
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
                        {!loading && visibleTests.length === 0 && (
                            <tr>
                                <td
                                    colSpan={6}
                                    style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontStyle: 'italic' }}
                                >
                                    No A/B tests found.
                                </td>
                            </tr>
                        )}
                        {!loading && visibleTests.map((test) => {
                            const splitB = Math.round(test.trafficSplit * 100);
                            const splitA = 100 - splitB;
                            const badgeStyle = STATUS_BADGE[test.status] ?? STATUS_BADGE['concluded'];
                            const isResultsOpen = selectedTestId === test.id;
                            return (
                                <tr key={test.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                    <td style={{ ...TD, fontWeight: 500, color: 'var(--ink)' }}>{test.name}</td>
                                    <td style={TD}>
                                        <code style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }} title={test.botId}>
                                            {test.botId.slice(0, 12)}…
                                        </code>
                                    </td>
                                    <td style={TD_SOFT}>{splitA}/{splitB}</td>
                                    <td style={TD}>
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                padding: '0.15rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                background: badgeStyle.bg,
                                                color: badgeStyle.color,
                                            }}
                                        >
                                            {test.status}
                                        </span>
                                    </td>
                                    <td style={TD_MUTED}>{new Date(test.createdAt).toLocaleString()}</td>
                                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                            <button
                                                onClick={() => {
                                                    if (isResultsOpen) {
                                                        setSelectedTestId(null);
                                                        setResults(null);
                                                    } else {
                                                        void fetchResults(test.id);
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.25rem 0.6rem',
                                                    fontSize: '0.75rem',
                                                    border: '1px solid var(--line)',
                                                    borderRadius: '4px',
                                                    background: 'var(--bg)',
                                                    color: 'var(--ink)',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {isResultsOpen ? 'Hide Results' : 'View Results'}
                                            </button>
                                            {test.status === 'active' && (
                                                <button
                                                    onClick={() =>
                                                        setOpenConcludeId(
                                                            openConcludeId === test.id ? null : test.id,
                                                        )
                                                    }
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid var(--danger-border)',
                                                        borderRadius: '4px',
                                                        background: 'var(--card)',
                                                        color: 'var(--danger)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    Conclude
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── Results panel (below table) ── */}
            {selectedTestId && (
                <div
                    style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                    }}
                >
                    <p
                        style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-muted)',
                            marginBottom: '0.75rem',
                        }}
                    >
                        Results — {abTests.find((t) => t.id === selectedTestId)?.name ?? selectedTestId}
                    </p>
                    {resultsLoading && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem', margin: 0 }}>
                            Loading results…
                        </p>
                    )}
                    {!resultsLoading && !results && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
                            No results available.
                        </p>
                    )}
                    {!resultsLoading && results && (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '1rem',
                                maxWidth: '600px',
                            }}
                        >
                            {[results.a, results.b].map((v) => (
                                <div
                                    key={v.variant}
                                    style={{
                                        background: 'var(--bg)',
                                        border: '1px solid var(--line)',
                                        borderRadius: '8px',
                                        padding: '0.75rem 1rem',
                                    }}
                                >
                                    <p
                                        style={{
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            color: 'var(--ink-muted)',
                                            marginBottom: '0.5rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                        }}
                                    >
                                        Variant {v.variant}
                                    </p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                                        Version:{' '}
                                        <code style={{ fontSize: '0.75rem' }} title={v.versionId}>
                                            {v.versionId.slice(0, 12)}…
                                        </code>
                                    </p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginBottom: '0.25rem' }}>
                                        Assignments: <strong>{v.assignmentCount}</strong>
                                    </p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                                        Avg Score:{' '}
                                        <strong>
                                            {v.avgScore !== null ? v.avgScore.toFixed(2) : '—'}
                                        </strong>
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Conclude form (below table) ── */}
            {openConcludeId && (
                <div
                    style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        background: 'var(--warn-bg)',
                        border: '1px solid var(--warn-border)',
                        borderRadius: '8px',
                    }}
                >
                    <p
                        style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--warn)',
                            marginBottom: '0.75rem',
                        }}
                    >
                        Conclude: {abTests.find((t) => t.id === openConcludeId)?.name ?? openConcludeId}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '480px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                            Conclusion note (optional):
                        </label>
                        <textarea
                            rows={2}
                            value={conclusionNotes[openConcludeId] ?? ''}
                            onChange={(e) =>
                                setConclusionNotes((prev) => ({
                                    ...prev,
                                    [openConcludeId]: e.target.value,
                                }))
                            }
                            style={{
                                padding: '0.4rem 0.6rem',
                                border: '1px solid var(--line)',
                                borderRadius: '5px',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                                fontSize: '0.85rem',
                                resize: 'vertical',
                            }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => {
                                    const test = abTests.find((t) => t.id === openConcludeId);
                                    if (test) void handleConclude(test);
                                }}
                                disabled={concluding === openConcludeId}
                                style={{
                                    padding: '0.3rem 0.75rem',
                                    fontSize: '0.8rem',
                                    border: '1px solid var(--danger-border)',
                                    borderRadius: '4px',
                                    background: 'var(--card)',
                                    color: 'var(--danger)',
                                    cursor: concluding === openConcludeId ? 'not-allowed' : 'pointer',
                                    opacity: concluding === openConcludeId ? 0.6 : 1,
                                }}
                            >
                                {concluding === openConcludeId ? 'Concluding…' : 'Confirm Conclude'}
                            </button>
                            <button
                                onClick={() => setOpenConcludeId(null)}
                                style={{
                                    padding: '0.3rem 0.75rem',
                                    fontSize: '0.8rem',
                                    border: '1px solid var(--line)',
                                    borderRadius: '4px',
                                    background: 'var(--bg)',
                                    color: 'var(--ink-muted)',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
