'use client';

import { useEffect, useState } from 'react';
import { UiKit, Masthead, Badge, Button, Stat, Eyebrow } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

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

const statusTone = (s: LeadStatus): 'ok' | 'warn' | 'err' | 'accent' | 'neutral' =>
    ({ NEW: 'accent', NURTURE: 'warn', QUALIFIED: 'ok', DISQUALIFIED: 'err', CONVERTED: 'ok' } as const)[s] ?? 'neutral';

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
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Sales — Pipeline"
                title="Lead Queue"
                actions={<WfThemeToggle />}
                stats={<Stat n={total.toLocaleString()} k="Total leads" tone="accent" />}
            />

            <div style={{ padding: 28, maxWidth: 1200, margin: '0 auto', width: '100%', display: 'grid', gap: 18 }}>
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['all', 'nurture'] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className="uk-eyebrow"
                            style={{
                                padding: '7px 14px',
                                border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--line)'}`,
                                borderRadius: 3,
                                cursor: 'pointer',
                                background: tab === t ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                                color: tab === t ? 'var(--accent)' : 'var(--ink-muted)',
                            }}
                        >
                            {t === 'all' ? 'All Leads' : 'Nurture Queue'}
                        </button>
                    ))}
                    {tab === 'all' && (
                        <select
                            className="uk-input"
                            style={{ marginLeft: 'auto', width: 180 }}
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
                    )}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="uk-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>Loading…</div>
                ) : error ? (
                    <div className="uk-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--danger)', fontSize: 13, borderLeft: '2px solid var(--danger)' }}>{error}</div>
                ) : leads.length === 0 ? (
                    <div className="uk-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>No leads found.</div>
                ) : (
                    <table className="uk-ledger">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Company</th>
                                <th>Status</th>
                                {tab === 'nurture' && <th>Step</th>}
                                {tab === 'nurture' && <th>Next Contact</th>}
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.map((lead) => (
                                <tr key={lead.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLead(lead)}>
                                    <td>
                                        <div style={{ color: 'var(--ink)', fontWeight: 500 }}>{lead.firstName} {lead.lastName}</div>
                                        <div className="uk-mono" style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{lead.email}</div>
                                    </td>
                                    <td>{lead.company}</td>
                                    <td><Badge tone={statusTone(lead.status)}>{lead.status}</Badge></td>
                                    {tab === 'nurture' && <td className="uk-num">{lead.nurtureStep} / 3</td>}
                                    {tab === 'nurture' && (
                                        <td className="uk-num">{lead.nextContactAt ? new Date(lead.nextContactAt).toLocaleDateString() : '—'}</td>
                                    )}
                                    <td className="uk-num">{new Date(lead.createdAt).toLocaleDateString()}</td>
                                    <td onClick={(e) => e.stopPropagation()}>
                                        <select
                                            className="uk-input"
                                            style={{ padding: '4px 8px', fontSize: 12 }}
                                            value={lead.status}
                                            disabled={updatingId === lead.id}
                                            onChange={(e) => void updateStatus(lead.id, e.target.value as LeadStatus)}
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
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-muted)' }}>
                        <span className="uk-mono">Page {page} of {totalPages}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => void loadLeads(page - 1)}>Prev</Button>
                            <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => void loadLeads(page + 1)}>Next</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail drawer */}
            {selectedLead && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.35)' }} onClick={() => setSelectedLead(null)}>
                    <div
                        className="uk"
                        style={{ background: 'var(--card)', borderLeft: '1px solid var(--line)', height: '100%', width: '100%', maxWidth: 400, overflowY: 'auto', padding: 24 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                            <Eyebrow>Lead Detail</Eyebrow>
                            <button onClick={() => setSelectedLead(null)} style={{ background: 'none', border: 'none', color: 'var(--ink-muted)', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>×</button>
                        </div>

                        <div style={{ display: 'grid', gap: 16, fontSize: 13 }}>
                            <Field label="Name"><span style={{ color: 'var(--ink)' }}>{selectedLead.firstName} {selectedLead.lastName}</span></Field>
                            <Field label="Email">{selectedLead.email}</Field>
                            <Field label="Company">{selectedLead.company}</Field>
                            <Field label="Status"><Badge tone={statusTone(selectedLead.status)}>{selectedLead.status}</Badge></Field>
                            {selectedLead.message && (
                                <Field label="Message">
                                    <div className="uk-panel" style={{ padding: 12, fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)' }}>{selectedLead.message}</div>
                                </Field>
                            )}
                            <Field label="Lead Source">{selectedLead.leadSource}</Field>
                            {selectedLead.sfLeadId && <Field label="Salesforce ID"><span className="uk-mono" style={{ fontSize: 12 }}>{selectedLead.sfLeadId}</span></Field>}
                            <Field label="Nurture Step">{selectedLead.nurtureStep} / 3</Field>
                            {selectedLead.nextContactAt && <Field label="Next Contact">{new Date(selectedLead.nextContactAt).toLocaleString()}</Field>}
                            {selectedLead.lastContactAt && <Field label="Last Contact">{new Date(selectedLead.lastContactAt).toLocaleString()}</Field>}
                            <Field label="Created">{new Date(selectedLead.createdAt).toLocaleString()}</Field>

                            <div style={{ paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                                <Eyebrow style={{ marginBottom: 10 }}>Change Status</Eyebrow>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {STATUS_OPTIONS.filter((s) => s !== selectedLead.status).map((s) => (
                                        <Button key={s} variant="ghost" size="sm" disabled={updatingId === selectedLead.id} onClick={() => void updateStatus(selectedLead.id, s)}>
                                            → {s}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </UiKit>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div className="uk-eyebrow" style={{ marginBottom: 4 }}>{label}</div>
            <div style={{ color: 'var(--ink-soft)' }}>{children}</div>
        </div>
    );
}
