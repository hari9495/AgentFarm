'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LeadStatus = 'NEW' | 'NURTURE' | 'QUALIFIED' | 'DISQUALIFIED' | 'CONVERTED';

interface Lead {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    message: string | null;
    leadSource: string;
    status: LeadStatus;
    nurtureStep: number;
    lastContactAt: string | null;
    nextContactAt: string | null;
    qualifiedAt: string | null;
    sfLeadId: string | null;
    createdAt: string;
}

interface LeadsResponse {
    leads: Lead[];
    total: number;
    page: number;
    limit: number;
}

const STATUS_OPTIONS: LeadStatus[] = ['NEW', 'NURTURE', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'];

const STATUS_BADGE: Record<LeadStatus, string> = {
    NEW: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    NURTURE: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    QUALIFIED: 'bg-green-500/20 text-green-300 border border-green-500/30',
    DISQUALIFIED: 'bg-red-500/20 text-red-300 border border-red-500/30',
    CONVERTED: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LeadsPage() {
    const [tab, setTab] = useState<'all' | 'nurture'>('all');
    const [leads, setLeads] = useState<Lead[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');

    const LIMIT = 20;

    async function loadLeads(p = 1, statusOverride?: LeadStatus | '') {
        setLoading(true);
        setError(null);
        const activeFilter = statusOverride !== undefined ? statusOverride : statusFilter;
        const effectiveStatus = tab === 'nurture' ? 'NURTURE' : (activeFilter || undefined);
        const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
        if (effectiveStatus) params.set('status', effectiveStatus);

        try {
            const res = await fetch(`/api/leads?${params.toString()}`);
            if (!res.ok) {
                setError('Failed to load leads.');
                return;
            }
            const data = (await res.json()) as LeadsResponse;
            setLeads(data.leads ?? []);
            setTotal(data.total ?? 0);
            setPage(data.page ?? 1);
        } catch {
            setError('Network error loading leads.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadLeads(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    async function updateStatus(leadId: string, newStatus: LeadStatus) {
        setUpdatingId(leadId);
        try {
            const res = await fetch(`/api/leads/${leadId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                await loadLeads(page);
                if (selectedLead?.id === leadId) {
                    const updated = (await res.json()) as { lead?: Lead };
                    if (updated.lead) setSelectedLead(updated.lead);
                }
            }
        } catch {
            // best-effort
        } finally {
            setUpdatingId(null);
        }
    }

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white">
            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">Lead Queue</h1>
                        <p className="text-sm text-white/50 mt-1">
                            Manage inbound leads and nurture sequences
                        </p>
                    </div>
                    <span className="text-sm text-white/30">{total} total</span>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 bg-white/5 rounded-lg p-1 w-fit">
                    {(['all', 'nurture'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/40 hover:text-white/70'
                                }`}
                        >
                            {t === 'all' ? 'All Leads' : 'Nurture Queue'}
                        </button>
                    ))}
                </div>

                {/* Filters (All tab only) */}
                {tab === 'all' && (
                    <div className="flex gap-3 mb-5 flex-wrap">
                        <select
                            className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-sm text-white/70 focus:outline-none focus:border-white/30"
                            value={statusFilter}
                            onChange={(e) => {
                                const val = e.target.value as LeadStatus | '';
                                setStatusFilter(val);
                                void loadLeads(1, val);
                            }}
                        >
                            <option value="">All statuses</option>
                            {STATUS_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Content */}
                {loading ? (
                    <div className="text-white/40 text-sm py-12 text-center">Loading…</div>
                ) : error ? (
                    <div className="text-red-400 text-sm py-12 text-center">{error}</div>
                ) : leads.length === 0 ? (
                    <div className="text-white/30 text-sm py-12 text-center">No leads found.</div>
                ) : (
                    <div className="rounded-xl border border-white/8 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-white/8 bg-white/3">
                                    <th className="text-left px-4 py-3 text-white/50 font-medium">Name</th>
                                    <th className="text-left px-4 py-3 text-white/50 font-medium">Company</th>
                                    <th className="text-left px-4 py-3 text-white/50 font-medium">Status</th>
                                    {tab === 'nurture' && (
                                        <th className="text-left px-4 py-3 text-white/50 font-medium">Step</th>
                                    )}
                                    {tab === 'nurture' && (
                                        <th className="text-left px-4 py-3 text-white/50 font-medium">Next Contact</th>
                                    )}
                                    <th className="text-left px-4 py-3 text-white/50 font-medium">Created</th>
                                    <th className="text-left px-4 py-3 text-white/50 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads.map((lead) => (
                                    <tr
                                        key={lead.id}
                                        className="border-b border-white/5 hover:bg-white/3 cursor-pointer transition-colors"
                                        onClick={() => setSelectedLead(lead)}
                                    >
                                        <td className="px-4 py-3 text-white">
                                            {lead.firstName} {lead.lastName}
                                            <div className="text-xs text-white/40 mt-0.5">{lead.email}</div>
                                        </td>
                                        <td className="px-4 py-3 text-white/70">{lead.company}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[lead.status] ?? ''}`}>
                                                {lead.status}
                                            </span>
                                        </td>
                                        {tab === 'nurture' && (
                                            <td className="px-4 py-3 text-white/60">
                                                {lead.nurtureStep} / 3
                                            </td>
                                        )}
                                        {tab === 'nurture' && (
                                            <td className="px-4 py-3 text-white/60 text-xs">
                                                {lead.nextContactAt
                                                    ? new Date(lead.nextContactAt).toLocaleDateString()
                                                    : '—'}
                                            </td>
                                        )}
                                        <td className="px-4 py-3 text-white/40 text-xs">
                                            {new Date(lead.createdAt).toLocaleDateString()}
                                        </td>
                                        <td
                                            className="px-4 py-3"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <select
                                                className="bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/60 focus:outline-none disabled:opacity-40"
                                                value={lead.status}
                                                disabled={updatingId === lead.id}
                                                onChange={(e) =>
                                                    void updateStatus(lead.id, e.target.value as LeadStatus)
                                                }
                                            >
                                                {STATUS_OPTIONS.map((s) => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-5 text-sm text-white/40">
                        <span>Page {page} of {totalPages}</span>
                        <div className="flex gap-2">
                            <button
                                disabled={page <= 1}
                                onClick={() => void loadLeads(page - 1)}
                                className="px-3 py-1 rounded border border-white/10 hover:border-white/30 disabled:opacity-30 transition-colors"
                            >
                                Prev
                            </button>
                            <button
                                disabled={page >= totalPages}
                                onClick={() => void loadLeads(page + 1)}
                                className="px-3 py-1 rounded border border-white/10 hover:border-white/30 disabled:opacity-30 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail drawer */}
            {selectedLead && (
                <div
                    className="fixed inset-0 z-50 flex items-end justify-end"
                    onClick={() => setSelectedLead(null)}
                >
                    <div
                        className="bg-[#111118] border-l border-white/10 h-full w-full max-w-sm overflow-y-auto p-6 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-base font-semibold">Lead Detail</h2>
                            <button
                                onClick={() => setSelectedLead(null)}
                                className="text-white/40 hover:text-white/80 text-xl leading-none"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4 text-sm">
                            <div>
                                <div className="text-white/40 text-xs mb-1">Name</div>
                                <div className="text-white">{selectedLead.firstName} {selectedLead.lastName}</div>
                            </div>
                            <div>
                                <div className="text-white/40 text-xs mb-1">Email</div>
                                <div className="text-white/80">{selectedLead.email}</div>
                            </div>
                            <div>
                                <div className="text-white/40 text-xs mb-1">Company</div>
                                <div className="text-white/80">{selectedLead.company}</div>
                            </div>
                            <div>
                                <div className="text-white/40 text-xs mb-1">Status</div>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[selectedLead.status] ?? ''}`}>
                                    {selectedLead.status}
                                </span>
                            </div>
                            {selectedLead.message && (
                                <div>
                                    <div className="text-white/40 text-xs mb-1">Message</div>
                                    <div className="text-white/70 bg-white/5 rounded p-3 text-xs leading-relaxed">
                                        {selectedLead.message}
                                    </div>
                                </div>
                            )}
                            <div>
                                <div className="text-white/40 text-xs mb-1">Lead Source</div>
                                <div className="text-white/60">{selectedLead.leadSource}</div>
                            </div>
                            {selectedLead.sfLeadId && (
                                <div>
                                    <div className="text-white/40 text-xs mb-1">Salesforce ID</div>
                                    <div className="font-mono text-white/60 text-xs">{selectedLead.sfLeadId}</div>
                                </div>
                            )}
                            <div>
                                <div className="text-white/40 text-xs mb-1">Nurture Step</div>
                                <div className="text-white/60">{selectedLead.nurtureStep} / 3</div>
                            </div>
                            {selectedLead.nextContactAt && (
                                <div>
                                    <div className="text-white/40 text-xs mb-1">Next Contact</div>
                                    <div className="text-white/60">
                                        {new Date(selectedLead.nextContactAt).toLocaleString()}
                                    </div>
                                </div>
                            )}
                            {selectedLead.lastContactAt && (
                                <div>
                                    <div className="text-white/40 text-xs mb-1">Last Contact</div>
                                    <div className="text-white/60">
                                        {new Date(selectedLead.lastContactAt).toLocaleString()}
                                    </div>
                                </div>
                            )}
                            <div>
                                <div className="text-white/40 text-xs mb-1">Created</div>
                                <div className="text-white/60">
                                    {new Date(selectedLead.createdAt).toLocaleString()}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/8">
                                <div className="text-white/40 text-xs mb-2">Change Status</div>
                                <div className="flex flex-wrap gap-2">
                                    {STATUS_OPTIONS.filter((s) => s !== selectedLead.status).map((s) => (
                                        <button
                                            key={s}
                                            disabled={updatingId === selectedLead.id}
                                            onClick={() => void updateStatus(selectedLead.id, s)}
                                            className="px-3 py-1 rounded border border-white/15 text-xs text-white/60 hover:text-white hover:border-white/30 disabled:opacity-40 transition-colors"
                                        >
                                            → {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
