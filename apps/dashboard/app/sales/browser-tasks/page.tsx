'use client';

import { useEffect, useRef, useState } from 'react';
import { SalesSectionNav } from '../../components/sales-section-nav';

interface BrowserStep {
    action: string;
    target?: string;
    value?: string;
    ok: boolean;
    errorMessage?: string;
    durationMs?: number;
    timestamp: string;
}

interface BrowserTask {
    id: string;
    botId: string;
    goal: string;
    allowedDomain?: string | null;
    status: 'pending' | 'running' | 'completed' | 'failed';
    steps: BrowserStep[];
    result?: string | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
    createdAt: string;
    updatedAt: string;
}

const STATUS_COLOR: Record<string, string> = {
    pending: 'var(--ink-muted)',
    running: 'var(--warn)',
    completed: 'var(--ok)',
    failed: 'var(--danger)',
};

const PAGE_SIZE = 25;
const POLL_INTERVAL_MS = 5000;

export default function BrowserTasksPage() {
    const [tasks, setTasks] = useState<BrowserTask[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [botId, setBotId] = useState('');
    const [goal, setGoal] = useState('');
    const [prospectId, setProspectId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        void load();
        pollRef.current = setInterval(() => {
            void loadSilent();
        }, POLL_INTERVAL_MS);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    async function load() {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/sales/browser-tasks?page=${page}&limit=${PAGE_SIZE}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { tasks: BrowserTask[]; total: number };
            setTasks(data.tasks ?? []);
            setTotal(data.total ?? 0);
        } catch (err) {
            setError(String(err));
        } finally {
            setLoading(false);
        }
    }

    async function loadSilent() {
        try {
            const res = await fetch(`/api/sales/browser-tasks?page=${page}&limit=${PAGE_SIZE}`);
            if (!res.ok) return;
            const data = await res.json() as { tasks: BrowserTask[]; total: number };
            setTasks(data.tasks ?? []);
            setTotal(data.total ?? 0);
        } catch {
            // silent
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!botId.trim() || !goal.trim()) return;
        setSubmitting(true);
        setSubmitError('');
        try {
            const res = await fetch('/api/sales/browser-tasks', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    botId: botId.trim(),
                    goal: goal.trim(),
                    prospectId: prospectId.trim() || undefined,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setShowModal(false);
            setBotId('');
            setGoal('');
            setProspectId('');
            await load();
        } catch (err) {
            setSubmitError(String(err));
        } finally {
            setSubmitting(false);
        }
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="page-shell">
            <SalesSectionNav />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
                        Browser Tasks
                    </h1>
                    <p style={{ color: 'var(--ink-soft)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                        Automated browser tasks run by the sales agent
                    </p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    style={{
                        background: 'var(--brand)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '0.5rem 1.25rem',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                    }}
                >
                    + New Task
                </button>
            </div>

            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid var(--danger)', borderRadius: 8, padding: '0.75rem 1rem', color: 'var(--danger)', fontSize: '0.875rem' }}>
                    {error}
                </div>
            )}

            {loading ? (
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>Loading…</p>
            ) : tasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--ink-muted)' }}>
                    <p style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>No browser tasks yet</p>
                    <p style={{ fontSize: '0.875rem' }}>Create a task to have the sales agent browse the web on your behalf.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {tasks.map(task => (
                        <div
                            key={task.id}
                            style={{
                                background: 'var(--card)',
                                border: '1px solid var(--line)',
                                borderRadius: 10,
                                padding: '1rem 1.25rem',
                                boxShadow: 'var(--shadow-sm)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                        <span
                                            style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                padding: '0.125rem 0.5rem',
                                                borderRadius: 6,
                                                background: `${STATUS_COLOR[task.status] ?? 'var(--ink-muted)'}1a`,
                                                color: STATUS_COLOR[task.status] ?? 'var(--ink-muted)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                            }}
                                        >
                                            {task.status}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
                                            {task.id.slice(-8)}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-word' }}>
                                        {task.goal}
                                    </p>
                                    {task.allowedDomain && (
                                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                                            Domain: {task.allowedDomain}
                                        </p>
                                    )}
                                    {task.result && (
                                        <p style={{ margin: '0.375rem 0 0', fontSize: '0.875rem', color: 'var(--ink-soft)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {task.result.slice(0, 300)}{task.result.length > 300 ? '…' : ''}
                                        </p>
                                    )}
                                    {task.errorMessage && (
                                        <p style={{ margin: '0.375rem 0 0', fontSize: '0.875rem', color: 'var(--danger)', wordBreak: 'break-word' }}>
                                            {task.errorMessage.slice(0, 200)}
                                        </p>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem', flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                        {new Date(task.createdAt).toLocaleString()}
                                    </span>
                                    {task.steps.length > 0 && (
                                        <button
                                            onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                                            style={{
                                                background: 'transparent',
                                                border: '1px solid var(--line)',
                                                borderRadius: 6,
                                                padding: '0.25rem 0.625rem',
                                                fontSize: '0.75rem',
                                                color: 'var(--ink-soft)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {expanded === task.id ? 'Hide' : `${task.steps.length} step${task.steps.length !== 1 ? 's' : ''}`}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {expanded === task.id && task.steps.length > 0 && (
                                <div
                                    style={{
                                        marginTop: '0.875rem',
                                        borderTop: '1px solid var(--line)',
                                        paddingTop: '0.875rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.375rem',
                                    }}
                                >
                                    {task.steps.map((step, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '0.625rem',
                                                fontSize: '0.8125rem',
                                            }}
                                        >
                                            <span style={{ color: step.ok ? 'var(--ok)' : 'var(--danger)', fontWeight: 700, flexShrink: 0 }}>
                                                {step.ok ? '✓' : '✗'}
                                            </span>
                                            <span style={{ color: 'var(--brand)', fontFamily: 'monospace', flexShrink: 0 }}>
                                                {step.action}
                                            </span>
                                            {step.target && (
                                                <span style={{ color: 'var(--ink-soft)', wordBreak: 'break-all' }}>
                                                    {step.target.slice(0, 80)}
                                                </span>
                                            )}
                                            {step.value && (
                                                <span style={{ color: 'var(--ink-muted)', flex: 1, wordBreak: 'break-word' }}>
                                                    → {step.value.slice(0, 100)}
                                                </span>
                                            )}
                                            {step.errorMessage && (
                                                <span style={{ color: 'var(--danger)', flex: 1, wordBreak: 'break-word' }}>
                                                    {step.errorMessage.slice(0, 100)}
                                                </span>
                                            )}
                                            {step.durationMs != null && (
                                                <span style={{ color: 'var(--ink-muted)', flexShrink: 0, marginLeft: 'auto' }}>
                                                    {step.durationMs}ms
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={{
                            padding: '0.375rem 0.875rem',
                            border: '1px solid var(--line)',
                            borderRadius: 6,
                            background: 'var(--card)',
                            cursor: page === 1 ? 'not-allowed' : 'pointer',
                            color: page === 1 ? 'var(--ink-muted)' : 'var(--ink)',
                            fontSize: '0.875rem',
                        }}
                    >
                        ← Prev
                    </button>
                    <span style={{ fontSize: '0.875rem', color: 'var(--ink-soft)' }}>
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        style={{
                            padding: '0.375rem 0.875rem',
                            border: '1px solid var(--line)',
                            borderRadius: 6,
                            background: 'var(--card)',
                            cursor: page === totalPages ? 'not-allowed' : 'pointer',
                            color: page === totalPages ? 'var(--ink-muted)' : 'var(--ink)',
                            fontSize: '0.875rem',
                        }}
                    >
                        Next →
                    </button>
                </div>
            )}

            {/* New Task Modal */}
            {showModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.5)',
                        zIndex: 100,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
                >
                    <div
                        style={{
                            background: 'var(--card)',
                            borderRadius: 12,
                            padding: '1.5rem',
                            width: '100%',
                            maxWidth: 520,
                            boxShadow: 'var(--shadow-lg)',
                        }}
                    >
                        <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink)' }}>
                            New Browser Task
                        </h2>
                        <form onSubmit={e => { void handleSubmit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
                                    Bot ID *
                                </label>
                                <input
                                    type="text"
                                    value={botId}
                                    onChange={e => setBotId(e.target.value)}
                                    required
                                    placeholder="e.g. sales-bot-1"
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--line)', borderRadius: 6, fontSize: '0.875rem', color: 'var(--ink)', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
                                    Goal *
                                </label>
                                <textarea
                                    value={goal}
                                    onChange={e => setGoal(e.target.value)}
                                    required
                                    rows={4}
                                    placeholder="Describe what the browser agent should do…"
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--line)', borderRadius: 6, fontSize: '0.875rem', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.375rem' }}>
                                    Prospect ID <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={prospectId}
                                    onChange={e => setProspectId(e.target.value)}
                                    placeholder="Link to a prospect"
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--line)', borderRadius: 6, fontSize: '0.875rem', color: 'var(--ink)', boxSizing: 'border-box' }}
                                />
                            </div>
                            {submitError && (
                                <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.875rem' }}>{submitError}</p>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    style={{ padding: '0.5rem 1rem', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', color: 'var(--ink-soft)', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submitting || !botId.trim() || !goal.trim()}
                                    style={{
                                        padding: '0.5rem 1.25rem',
                                        border: 'none',
                                        borderRadius: 8,
                                        background: submitting ? 'var(--ink-muted)' : 'var(--brand)',
                                        color: '#fff',
                                        cursor: submitting ? 'not-allowed' : 'pointer',
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    {submitting ? 'Submitting…' : 'Run Task'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
