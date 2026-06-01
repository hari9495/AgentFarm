'use client';

import { PageHeader } from '../../components/page-header';
import { useEffect, useState } from 'react';
import { SalesSectionNav } from '../../components/sales-section-nav';

type LeadStatus = 'NEW' | 'NURTURE' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED';

interface Lead {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    company?: string;
    leadSource?: string;
    status: LeadStatus;
    sfLeadId?: string;
    nextContactAt?: string;
    qualifiedAt?: string;
    convertedAt?: string;
    disqualifiedAt?: string;
    createdAt: string;
    updatedAt: string;
}

interface LeadsResponse {
    leads: Lead[];
    total: number;
    page: number;
}

const STATUS_LABELS: Record<LeadStatus, string> = {
    NEW: 'New',
    NURTURE: 'Nurture',
    QUALIFIED: 'Qualified',
    DISQUALIFIED: 'Disqualified',
    CONVERTED: 'Converted',
};

const STATUS_BADGE: Record<LeadStatus, { bg: string; color: string }> = {
    NEW: { bg: 'rgba(148,163,184,0.15)', color: 'var(--ink-muted)' },
    NURTURE: { bg: 'rgba(2,132,199,0.12)', color: 'var(--info)' },
    QUALIFIED: { bg: 'rgba(5,150,105,0.12)', color: 'var(--ok)' },
    DISQUALIFIED: { bg: 'rgba(220,38,38,0.12)', color: 'var(--danger)' },
    CONVERTED: { bg: 'rgba(124,58,237,0.12)', color: 'var(--brand)' },
};

const ALL_STATUSES: LeadStatus[] = ['NEW', 'NURTURE', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'];

const PAGE_SIZE = 25;

function fullName(lead: Lead): string {
    const parts = [lead.firstName, lead.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '—';
}

export default function LeadsPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [updateError, setUpdateError] = useState('');

    useEffect(() => {
        void loadLeads();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, statusFilter]);

    async function loadLeads() {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
            });
            if (statusFilter) params.set('status', statusFilter);

            const res = await fetch(`/api/sales/leads?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load leads');
            const data = await res.json() as LeadsResponse;
            setLeads(data.leads ?? []);
            setTotal(data.total ?? 0);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load');
        } finally {
            setLoading(false);
        }
    }

    async function updateStatus(lead: Lead, newStatus: LeadStatus) {
        if (lead.status === newStatus) return;
        setUpdatingId(lead.id);
        setUpdateError('');
        try {
            const res = await fetch(`/api/sales/leads/${lead.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({})) as { error?: string };
                throw new Error(body.error ?? `HTTP ${res.status}`);
            }
            setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l));
        } catch (e) {
            setUpdateError(e instanceof Error ? e.message : 'Update failed');
        } finally {
            setUpdatingId(null);
        }
    }

    const filtered = leads.filter(l => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
            fullName(l).toLowerCase().includes(q) ||
            (l.email ?? '').toLowerCase().includes(q) ||
            (l.company ?? '').toLowerCase().includes(q)
        );
    });

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Sales"
                title="Leads"
                description="Review inbound leads and update their qualification status."
                backHref="/sales"
                backLabel="← Sales"
            />

            <SalesSectionNav />

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="search"
                    placeholder="Search by name, email, company…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        fontSize: '0.875rem',
                        color: 'var(--ink)',
                        background: 'var(--card)',
                        width: 260,
                    }}
                />
                <select
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value as LeadStatus | ''); setPage(1); }}
                    style={{
                        padding: '0.5rem 0.75rem',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        fontSize: '0.875rem',
                        color: 'var(--ink)',
                        background: 'var(--card)',
                    }}
                >
                    <option value="">All statuses</option>
                    {ALL_STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginLeft: 'auto' }}>
                    {total} lead{total !== 1 ? 's' : ''}
                </span>
            </div>

            {updateError && (
                <p style={{ color: 'var(--danger)', fontSize: '0.875rem', margin: 0 }}>{updateError}</p>
            )}

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
                                {['Name', 'Company', 'Email', 'Source', 'Status', 'Created'].map(h => (
                                    <th
                                        key={h}
                                        style={{
                                            padding: '0.75rem 1rem',
                                            textAlign: h === 'Status' || h === 'Created' ? 'right' : 'left',
                                            fontSize: '0.78rem',
                                            fontWeight: 700,
                                            color: 'var(--ink-muted)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.875rem' }}
                                    >
                                        No leads found.
                                    </td>
                                </tr>
                            )}
                            {filtered.map((lead, i) => {
                                const badge = STATUS_BADGE[lead.status] ?? STATUS_BADGE.NEW;
                                const isUpdating = updatingId === lead.id;
                                return (
                                    <tr
                                        key={lead.id}
                                        style={{
                                            borderBottom: i < filtered.length - 1 ? '1px solid var(--line)' : 'none',
                                            opacity: isUpdating ? 0.6 : 1,
                                            transition: 'background 0.1s, opacity 0.1s',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--bg)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'; }}
                                    >
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink)' }}>
                                                {fullName(lead)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--ink-soft)' }}>
                                            {lead.company ?? '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--ink-soft)' }}>
                                            {lead.email ? (
                                                <a
                                                    href={`mailto:${lead.email}`}
                                                    style={{ color: 'var(--brand)', textDecoration: 'none' }}
                                                >
                                                    {lead.email}
                                                </a>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                                            {lead.leadSource ?? '—'}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                            <select
                                                value={lead.status}
                                                disabled={isUpdating}
                                                onChange={e => void updateStatus(lead, e.target.value as LeadStatus)}
                                                style={{
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: 999,
                                                    background: badge.bg,
                                                    color: badge.color,
                                                    border: `1px solid ${badge.color}40`,
                                                    cursor: isUpdating ? 'not-allowed' : 'pointer',
                                                    appearance: 'auto',
                                                }}
                                            >
                                                {ALL_STATUSES.map(s => (
                                                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                                            {new Date(lead.createdAt).toLocaleDateString()}
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
