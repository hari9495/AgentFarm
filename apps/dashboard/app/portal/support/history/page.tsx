'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type IssueStatus = 'open' | 'diagnosing' | 'fixing' | 'escalated' | 'resolved';
type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

type ChatMessage = { id: string; role: string; content: string; createdAt: string };

type Issue = {
    id: string;
    title: string;
    description: string;
    status: IssueStatus;
    severity: IssueSeverity;
    tierReached: number | null;
    fixApplied: boolean;
    escalatedTo: string | null;
    prUrl: string | null;
    csatToken: string | null;
    csatRated: boolean;
    createdAt: string;
    resolvedAt: string | null;
    messages?: ChatMessage[];
};

const STATUS_LABEL: Record<IssueStatus, string> = {
    open: 'Open',
    diagnosing: 'Diagnosing',
    fixing: 'Fixing',
    escalated: 'Escalated',
    resolved: 'Resolved',
};

const STATUS_COLOR: Record<IssueStatus, { bg: string; text: string }> = {
    open: { bg: 'var(--warn-bg)', text: 'var(--warn)' },
    diagnosing: { bg: 'var(--info-bg)', text: 'var(--info)' },
    fixing: { bg: 'var(--ok-bg)', text: 'var(--ok)' },
    escalated: { bg: 'var(--danger-bg)', text: 'var(--danger)' },
    resolved: { bg: 'var(--bg)', text: 'var(--ink-muted)' },
};

const SEVERITY_DOT: Record<IssueSeverity, string> = {
    critical: 'var(--danger)',
    high: 'var(--warn)',
    medium: 'var(--warn)',
    low: 'var(--ok)',
};

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function IssueHistoryPage() {
    const router = useRouter();
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<IssueStatus | 'all'>('all');
    const [search, setSearch] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        fetch('/api/portal/auth/me', { credentials: 'same-origin' })
            .then((r) => { if (!r.ok) router.replace('/portal/login'); })
            .catch(() => router.replace('/portal/login'));
    }, [router]);

    const fetchIssues = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        const qs = filter !== 'all' ? `?status=${filter}` : '';
        try {
            const r = await fetch(`/api/portal/support/issues${qs}`, { credentials: 'same-origin' });
            if (r.status === 503) { setError('Issue history requires database connection.'); return; }
            if (!r.ok) { setError('Failed to load issues.'); return; }
            const data = await r.json() as { issues: Issue[] };
            setIssues(data.issues);
            setError(null);
        } catch { setError('Failed to load issues.'); }
        finally { if (!silent) setLoading(false); }
    }, [filter]);

    useEffect(() => {
        void fetchIssues();
    }, [fetchIssues]);

    // Auto-refresh every 20 s while any issue is not yet resolved
    useEffect(() => {
        if (refreshRef.current) clearInterval(refreshRef.current);
        const hasActive = issues.some((i) => i.status !== 'resolved');
        if (hasActive) {
            refreshRef.current = setInterval(() => { void fetchIssues(true); }, 20_000);
        }
        return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }, [issues, fetchIssues]);

    const q = search.trim().toLowerCase();
    const filtered = issues.filter((i) => {
        if (filter !== 'all' && i.status !== filter) return false;
        if (q) return i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
        return true;
    });

    return (
        <main style={{ minHeight: 'calc(100vh - 52px)', background: 'var(--bg)', padding: '2rem 1.5rem', fontFamily: 'Inter, system-ui, sans-serif' }}>
            <div style={{ maxWidth: 900, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.2rem' }}>Ticket History</h1>
                        <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)' }}>All support tickets for your account</p>
                    </div>
                    <Link href="/portal/support" style={{ padding: '0.4rem 0.9rem', background: 'var(--info)', color: 'var(--card)', borderRadius: 6, fontSize: '0.83rem', fontWeight: 600, textDecoration: 'none' }}>
                        + New Ticket
                    </Link>
                </div>

                {/* Search */}
                <div style={{ marginBottom: '0.75rem' }}>
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search tickets by title or description…"
                        style={{ width: '100%', padding: '0.45rem 0.8rem', fontSize: '0.85rem', border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none', fontFamily: 'inherit', background: '#fff', color: '#0f172a' }}
                    />
                </div>

                {/* Filter tabs */}
                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    {(['all', 'open', 'diagnosing', 'fixing', 'escalated', 'resolved'] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => setFilter(s)}
                            style={{
                                padding: '0.28rem 0.75rem', fontSize: '0.8rem', fontWeight: 600,
                                border: '1px solid var(--line)', borderRadius: 20,
                                background: filter === s ? 'var(--bg-deep)' : 'var(--card)',
                                color: filter === s ? 'var(--card)' : 'var(--ink-muted)',
                                cursor: 'pointer',
                            }}
                        >
                            {s === 'all' ? 'All' : STATUS_LABEL[s as IssueStatus]}
                        </button>
                    ))}
                </div>

                {/* Content */}
                {loading && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink-muted)', fontSize: '0.9rem' }}>Loading…</div>
                )}
                {error && (
                    <div style={{ padding: '1rem', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, color: 'var(--danger)', fontSize: '0.84rem' }}>{error}</div>
                )}
                {!loading && !error && filtered.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
                        No tickets found.{' '}
                        <Link href="/portal/support" style={{ color: 'var(--info)' }}>Open a support chat</Link> to create one.
                    </div>
                )}
                {!loading && !error && filtered.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {filtered.map((issue) => {
                            const sc = STATUS_COLOR[issue.status];
                            return (
                                <div key={issue.id} style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '1rem 1.1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                    {/* Severity dot */}
                                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: SEVERITY_DOT[issue.severity], marginTop: 5, flexShrink: 0 }} title={issue.severity} />

                                    {/* Main content */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {issue.title}
                                            </span>
                                            <span style={{ padding: '0.1rem 0.45rem', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: sc.bg, color: sc.text, flexShrink: 0 }}>
                                                {STATUS_LABEL[issue.status]}
                                            </span>
                                            {issue.fixApplied && (
                                                <span style={{ padding: '0.1rem 0.45rem', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: 'var(--ok-bg)', color: 'var(--ok)', flexShrink: 0 }}>
                                                    ✓ Fixed
                                                </span>
                                            )}
                                            {issue.escalatedTo && (
                                                <span style={{ padding: '0.1rem 0.45rem', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: 'var(--danger-bg)', color: 'var(--danger)', flexShrink: 0 }}>
                                                    ↑ Tier {issue.tierReached ?? '?'} escalated
                                                </span>
                                            )}
                                            {issue.prUrl && (
                                                <a href={issue.prUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '0.1rem 0.45rem', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: 'var(--ok-bg)', color: 'var(--ok)', textDecoration: 'none', flexShrink: 0 }}>
                                                    🔀 PR raised
                                                </a>
                                            )}
                                            {issue.csatToken && issue.csatRated && (
                                                <span style={{ padding: '0.1rem 0.45rem', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: '#fffbeb', color: '#92400e', flexShrink: 0 }}>
                                                    ⭐ Rated
                                                </span>
                                            )}
                                            {issue.csatToken && !issue.csatRated && issue.status === 'resolved' && (
                                                <Link href={`/portal/support/csat?token=${encodeURIComponent(issue.csatToken)}`} style={{ padding: '0.1rem 0.45rem', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, background: '#eff6ff', color: '#2563eb', textDecoration: 'none', flexShrink: 0 }}>
                                                    ★ Rate support
                                                </Link>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {issue.description}
                                        </p>
                                    </div>

                                    {/* Meta + expand */}
                                    <div style={{ flexShrink: 0, textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                        <div>{formatDate(issue.createdAt)}</div>
                                        {issue.resolvedAt && (
                                            <div style={{ color: 'var(--ok)', marginTop: '0.15rem' }}>
                                                Resolved {formatDate(issue.resolvedAt)}
                                            </div>
                                        )}
                                        {issue.tierReached && (
                                            <div style={{ marginTop: '0.15rem' }}>Tier {issue.tierReached}</div>
                                        )}
                                        {(issue.messages?.length ?? 0) > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setExpanded((prev) => prev === issue.id ? null : issue.id)}
                                                style={{ marginTop: '0.3rem', fontSize: '0.72rem', color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                            >
                                                {expanded === issue.id ? '▲ Hide chat' : `▼ ${issue.messages!.length} messages`}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Expanded chat thread */}
                                {expanded === issue.id && issue.messages && issue.messages.length > 0 && (
                                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 300, overflowY: 'auto' }}>
                                        {issue.messages.map((msg) => (
                                            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                                <div style={{
                                                    maxWidth: '80%', padding: '0.3rem 0.6rem', fontSize: '0.8rem', lineHeight: 1.45,
                                                    borderRadius: msg.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px',
                                                    background: msg.role === 'user' ? 'var(--bg-deep)' : msg.role === 'agent' ? 'var(--bg)' : 'var(--bg)',
                                                    color: msg.role === 'user' ? 'var(--card)' : 'var(--ink)',
                                                    border: msg.role === 'step' || msg.role === 'fix' ? '1px solid #e2e8f0' : 'none',
                                                    fontStyle: msg.role === 'step' ? 'italic' : undefined,
                                                }}>
                                                    {msg.role === 'step' && <span style={{ color: 'var(--ok)', marginRight: '0.3rem' }}>✓</span>}
                                                    {msg.role === 'fix' && <span style={{ color: 'var(--ok)', fontWeight: 600, marginRight: '0.3rem' }}>Fix:</span>}
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
