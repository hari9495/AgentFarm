'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SalesSectionNav } from '../../components/sales-section-nav';
import { PageHeader } from '../../components/page-header';

interface Activity {
    id: string;
    activityType: string;
    subject: string;
    body?: string;
    outcome?: string;
    completedAt?: string;
    createdAt: string;
    prospectId?: string;
    dealId?: string;
}

const ACTIVITY_ICONS: Record<string, string> = {
    email: '✉️',
    call: '📞',
    meeting: '🤝',
    note: '📝',
    proposal_sent: '📄',
    contract_sent: '📋',
    contract_signed: '✅',
    demo: '💻',
    follow_up: '🔔',
    linkedin_message: '💼',
};

const ACTIVITY_TYPES = [
    'email', 'call', 'meeting', 'note', 'proposal_sent',
    'contract_sent', 'contract_signed', 'demo', 'follow_up', 'linkedin_message',
] as const;

const PAGE_SIZE = 50;

function ActivityFeedInner() {
    const searchParams = useSearchParams();
    const defaultProspectId = searchParams.get('prospectId') ?? '';

    const [activities, setActivities] = useState<Activity[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [prospectId, setProspectId] = useState(defaultProspectId);
    const [typeFilter, setTypeFilter] = useState('');

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, prospectId]);

    async function load() {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            });
            if (prospectId.trim()) params.set('prospectId', prospectId.trim());

            const res = await fetch(`/api/sales/activities?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load activities');
            const data = await res.json() as { activities: Activity[]; total: number; page: number };
            setActivities(data.activities ?? []);
            setTotal(data.total ?? 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }

    const filtered = typeFilter
        ? activities.filter(a => a.activityType === typeFilter)
        : activities;

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Sales"
                title="Activity"
                description="Review and filter all sales activities across deals and prospects."
                backHref="/sales"
                backLabel="← Sales"
            />

            <SalesSectionNav />

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text"
                    placeholder="Filter by prospect ID…"
                    value={prospectId}
                    onChange={e => { setProspectId(e.target.value); setPage(1); }}
                    style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        fontSize: '0.875rem',
                        color: 'var(--ink)',
                        background: 'var(--card)',
                        width: 220,
                    }}
                />
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        fontSize: '0.875rem',
                        color: 'var(--ink)',
                        background: 'var(--card)',
                    }}
                >
                    <option value="">All types</option>
                    {ACTIVITY_TYPES.map(t => (
                        <option key={t} value={t} style={{ textTransform: 'capitalize' }}>
                            {t.replace(/_/g, ' ')}
                        </option>
                    ))}
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginLeft: 'auto' }}>
                    {total} activit{total !== 1 ? 'ies' : 'y'}
                </span>
            </div>

            {loading && <p style={{ color: 'var(--ink-muted)' }}>Loading…</p>}
            {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

            {!loading && (
                <div
                    style={{
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        borderRadius: 12,
                        padding: '1.25rem',
                        boxShadow: 'var(--shadow-sm)',
                    }}
                >
                    {filtered.length === 0 && (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', textAlign: 'center', padding: '2rem' }}>
                            No activities found.
                        </p>
                    )}
                    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {filtered.map((a, i) => (
                            <li
                                key={a.id}
                                style={{
                                    display: 'flex',
                                    gap: '0.75rem',
                                    paddingBottom: i < filtered.length - 1 ? '1rem' : 0,
                                    marginBottom: i < filtered.length - 1 ? '1rem' : 0,
                                    borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
                                }}
                            >
                                <div
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '50%',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--line)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        fontSize: '1rem',
                                    }}
                                >
                                    {ACTIVITY_ICONS[a.activityType] ?? '📌'}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink)' }}>
                                            {a.subject}
                                        </p>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                                            {new Date(a.completedAt ?? a.createdAt).toLocaleString()}
                                        </span>
                                    </div>
                                    {a.body && (
                                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                                            {a.body}
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                                        <span
                                            style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 600,
                                                color: 'var(--ink-muted)',
                                                textTransform: 'capitalize',
                                                background: 'var(--bg)',
                                                border: '1px solid var(--line)',
                                                borderRadius: 999,
                                                padding: '0.1rem 0.5rem',
                                            }}
                                        >
                                            {a.activityType.replace(/_/g, ' ')}
                                        </span>
                                        {a.outcome && (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>
                                                Outcome: {a.outcome}
                                            </span>
                                        )}
                                        {a.dealId && (
                                            <Link
                                                href={`/sales/deals/${a.dealId}`}
                                                style={{ fontSize: '0.72rem', color: 'var(--brand)', textDecoration: 'none' }}
                                            >
                                                View deal →
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        style={{
                            padding: '0.375rem 0.75rem',
                            borderRadius: 8,
                            border: '1px solid var(--line)',
                            background: 'var(--card)',
                            color: page === 1 ? 'var(--ink-muted)' : 'var(--ink)',
                            cursor: page === 1 ? 'not-allowed' : 'pointer',
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
                            padding: '0.375rem 0.75rem',
                            borderRadius: 8,
                            border: '1px solid var(--line)',
                            background: 'var(--card)',
                            color: page === totalPages ? 'var(--ink-muted)' : 'var(--ink)',
                            cursor: page === totalPages ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                        }}
                    >
                        Next →
                    </button>
                </div>
            )}
        </main>
    );
}

export default function ActivityPage() {
    return (
        <Suspense fallback={<main className="page-shell"><p style={{ color: 'var(--ink-muted)' }}>Loading…</p></main>}>
            <ActivityFeedInner />
        </Suspense>
    );
}
