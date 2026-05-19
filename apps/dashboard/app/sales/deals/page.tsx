'use client';

import Link from 'next/link';
import { PageHeader } from '../../components/page-header';
import { useEffect, useState } from 'react';
import { SalesSectionNav } from '../../components/sales-section-nav';

type DealStage = 'discovery' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';

interface Deal {
    id: string;
    title: string;
    stage: DealStage;
    value?: number;
    currency?: string;
    updatedAt: string;
    createdAt: string;
}

interface DealsResponse {
    deals: Deal[];
    total: number;
    page: number;
}

const STAGE_LABELS: Record<DealStage, string> = {
    discovery: 'Discovery',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed_won: 'Won',
    closed_lost: 'Lost',
};

const STAGE_BADGE: Record<DealStage, { bg: string; color: string }> = {
    discovery: { bg: 'rgba(148,163,184,0.15)', color: 'var(--ink-muted)' },
    proposal: { bg: 'rgba(2,132,199,0.12)', color: 'var(--info)' },
    negotiation: { bg: 'rgba(217,119,6,0.12)', color: 'var(--warn)' },
    closed_won: { bg: 'rgba(5,150,105,0.12)', color: 'var(--ok)' },
    closed_lost: { bg: 'rgba(220,38,38,0.12)', color: 'var(--danger)' },
};

type SortField = 'title' | 'value' | 'updatedAt';

function formatCurrency(value: number | undefined, currency = 'USD'): string {
    if (value == null || value === 0) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

const PAGE_SIZE = 25;

export default function DealsPage() {
    const [deals, setDeals] = useState<Deal[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [stageFilter, setStageFilter] = useState<DealStage | ''>('');
    const [sortField, setSortField] = useState<SortField>('updatedAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    useEffect(() => {
        void loadDeals();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, stageFilter]);

    async function loadDeals() {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            });
            if (stageFilter) params.set('stage', stageFilter);

            const res = await fetch(`/api/sales/deals?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load deals');
            const data = await res.json() as DealsResponse;
            setDeals(data.deals ?? []);
            setTotal(data.total ?? 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }

    // Client-side filter + sort
    const filtered = deals
        .filter(d =>
            search.trim() === '' || d.title.toLowerCase().includes(search.toLowerCase()),
        )
        .sort((a, b) => {
            let cmp = 0;
            if (sortField === 'title') cmp = a.title.localeCompare(b.title);
            else if (sortField === 'value') cmp = (a.value ?? 0) - (b.value ?? 0);
            else cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
            return sortDir === 'asc' ? cmp : -cmp;
        });

    const totalPages = Math.ceil(total / PAGE_SIZE);

    function toggleSort(field: SortField) {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    }

    const sortIcon = (field: SortField) =>
        sortField === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Sales"
                title="Deals"
                description="Track deal stages, value, and pipeline progress."
                backHref="/sales"
                backLabel="← Sales"
            />

            <SalesSectionNav />

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="search"
                    placeholder="Search deals…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
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
                    value={stageFilter}
                    onChange={e => { setStageFilter(e.target.value as DealStage | ''); setPage(1); }}
                    style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        fontSize: '0.875rem',
                        color: 'var(--ink)',
                        background: 'var(--card)',
                    }}
                >
                    <option value="">All stages</option>
                    {(Object.entries(STAGE_LABELS) as [DealStage, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                    ))}
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginLeft: 'auto' }}>
                    {total} deal{total !== 1 ? 's' : ''}
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
                        boxShadow: 'var(--shadow-sm)',
                        overflow: 'hidden',
                    }}
                >
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
                                <th
                                    onClick={() => toggleSort('title')}
                                    style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                                >
                                    Title{sortIcon('title')}
                                </th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Stage
                                </th>
                                <th
                                    onClick={() => toggleSort('value')}
                                    style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                                >
                                    Value{sortIcon('value')}
                                </th>
                                <th
                                    onClick={() => toggleSort('updatedAt')}
                                    style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                                >
                                    Updated{sortIcon('updatedAt')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.875rem' }}>
                                        No deals found.
                                    </td>
                                </tr>
                            )}
                            {filtered.map((deal, i) => {
                                const badge = STAGE_BADGE[deal.stage] ?? STAGE_BADGE.discovery;
                                return (
                                    <tr
                                        key={deal.id}
                                        style={{
                                            borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
                                            transition: 'background 0.1s',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <Link
                                                href={`/sales/deals/${deal.id}`}
                                                style={{ color: 'var(--ink)', fontWeight: 500, textDecoration: 'none', fontSize: '0.875rem' }}
                                            >
                                                {deal.title}
                                            </Link>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: 999, background: badge.bg, color: badge.color }}>
                                                {STAGE_LABELS[deal.stage]}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.875rem', color: 'var(--ink-soft)' }}>
                                            {formatCurrency(deal.value, deal.currency)}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                                            {new Date(deal.updatedAt).toLocaleDateString()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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
