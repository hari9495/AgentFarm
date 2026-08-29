'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { HeadphonesIcon, AlertCircle, Clock, CheckCircle2, ArrowUpRight, RefreshCw } from 'lucide-react';
import OperatorGuide from './operator-guide';

const SUPPORT_GUIDE_ITEMS = [
    { label: 'SLA deadline — act immediately on near-breach', hint: 'Tickets with slaBreachAt within 1 hour need immediate action. An escalated or resolved ticket stops the SLA clock. Check the "escalated" tab regularly.', level: 'critical' as const },
    { label: 'Draft response accuracy', hint: 'When agentDraftReady shows "Ready", click Review to read the draft before resolving. Check: does it address the actual customer complaint? Are product claims accurate?', level: 'critical' as const },
    { label: 'CRITICAL tickets must not be auto-resolved', hint: 'Never resolve a CRITICAL ticket without reading the draft. Critical tickets often involve data loss, security issues, or outages — the draft may need a subject matter expert review first.', level: 'critical' as const },
    { label: 'Escalate means a human takes over', hint: 'Escalating moves the ticket to "escalated" status and removes it from agent queue. A human must then own this ticket end-to-end. Confirm the escalation recipient is available.', level: 'caution' as const },
    { label: 'Customer channel affects tone', hint: 'Portal tickets are from technical users (more detailed language OK). Chat tickets expect fast, brief responses. Email tickets allow more formal structure. Match the draft tone to channel.', level: 'verify' as const },
    { label: 'Bulk resolve only safe statuses', hint: 'Only resolve tickets in "pending_customer" or "in_progress". Never bulk-resolve tickets in "open" without reading each draft — the customer has not yet responded to the agent\'s reply.', level: 'caution' as const },
];

type TicketStatus = 'open' | 'in_progress' | 'pending_customer' | 'resolved' | 'escalated';
type TicketPriority = 'low' | 'normal' | 'high' | 'critical';

type SupportTicket = {
    id: string;
    ticketNumber: string;
    subject: string;
    customerName: string;
    channel: 'email' | 'chat' | 'phone' | 'portal';
    priority: TicketPriority;
    status: TicketStatus;
    agentDraftReady: boolean;
    slaBreachAt?: string;
    operatorNotes?: string;
    createdAt: string;
    updatedAt: string;
};

const API_BASE = '';

const STATUS_STYLE: Record<TicketStatus, { bg: string; color: string; icon: React.ElementType }> = {
    open:             { bg: 'var(--info-bg)', color: 'var(--info)', icon: Clock },
    in_progress:      { bg: 'var(--warn-bg)', color: 'var(--warn)', icon: Clock },
    pending_customer: { bg: 'var(--bg)', color: 'var(--ink-muted)', icon: Clock },
    resolved:         { bg: 'var(--ok-bg)', color: 'var(--ok)', icon: CheckCircle2 },
    escalated:        { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: AlertCircle },
};

const PRIORITY_STYLE: Record<TicketPriority, { color: string }> = {
    low: { color: 'var(--ink-muted)' }, normal: { color: 'var(--ink-muted)' },
    high: { color: 'var(--warn)' }, critical: { color: 'var(--danger)' },
};

const CHANNEL_ICON: Record<string, string> = {
    email: '✉', chat: '💬', phone: '📞', portal: '🌐',
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };

export default function SupportQueuePanel({ workspaceId }: { workspaceId: string }) {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<TicketStatus | 'all'>('open');
    const [expandedNotes, setExpandedNotes] = useState<string | null>(null);
    const [notesDraft, setNotesDraft] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/api/support-queue?${params.toString()}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setTickets(Array.isArray(data) ? data : (data.tickets ?? []));
        } catch {
            setTickets([]);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, filter]);

    useEffect(() => { load(); }, [load]);

    const escalate = async (id: string) => {
        await fetch(`${API_BASE}/api/support-queue/${id}/escalate`, { method: 'POST' }).catch(() => null);
        await load();
    };

    const resolve = async (id: string) => {
        await fetch(`${API_BASE}/api/support-queue/${id}/resolve`, { method: 'POST' }).catch(() => null);
        await load();
    };

    const openNotes = (t: SupportTicket) => {
        setExpandedNotes(t.id);
        setNotesDraft(t.operatorNotes ?? '');
    };

    const saveNotes = async (id: string) => {
        setSavingNotes(true);
        try {
            await fetch(`${API_BASE}/api/support-queue/${id}/notes`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ notes: notesDraft }),
            });
            setTickets((prev) => prev.map((t) => t.id === id ? { ...t, operatorNotes: notesDraft } : t));
            setExpandedNotes(null);
        } catch { /* ignore */ } finally {
            setSavingNotes(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <OperatorGuide
                title="Support Queue — Operator Review Guide"
                intro="The Customer Support agent drafts responses to real customers. Approving a draft triggers an actual reply. SLA breaches are tracked — act on CRITICAL tickets first."
                items={SUPPORT_GUIDE_ITEMS}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['open', 'in_progress', 'escalated', 'resolved', 'all'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '5px 12px', border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--bg)'}`, borderRadius: 20, background: filter === k ? 'rgba(214, 48, 31,0.07)' : 'var(--card)', color: filter === k ? 'var(--accent)' : 'var(--ink-muted)', fontSize: 12, fontWeight: filter === k ? 600 : 400, cursor: 'pointer' }}>
                            {k === 'all' ? 'All' : k.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading tickets…</div>
            ) : tickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
                    <HeadphonesIcon size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No tickets in the queue.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Customer support agent activity and escalations will appear here.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['#', 'Subject', 'Customer', 'Channel', 'Priority', 'Draft', 'Status', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {tickets.map((t, i) => {
                                const st = STATUS_STYLE[t.status];
                                const StIcon = st.icon;
                                const pr = PRIORITY_STYLE[t.priority];
                                const isBreaching = t.slaBreachAt && new Date(t.slaBreachAt) < new Date(Date.now() + 30 * 60 * 1000);
                                return (
                                    <React.Fragment key={t.id}>
                                    <tr style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? 'var(--bg)' : 'var(--card)' }}>
                                        <td style={{ ...td, fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'monospace' }}>{t.ticketNumber}</td>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500 }}>{t.subject}</div>
                                            {isBreaching && <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 2 }}>⚠ SLA at risk</div>}
                                        </td>
                                        <td style={{ ...td, color: 'var(--ink-muted)' }}>{t.customerName}</td>
                                        <td style={{ ...td, fontSize: 14 }}>{CHANNEL_ICON[t.channel] ?? t.channel}</td>
                                        <td style={{ ...td, fontWeight: 700, fontSize: 11, color: pr.color }}>{t.priority.toUpperCase()}</td>
                                        <td style={td}>
                                            {t.agentDraftReady
                                                ? <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 20, background: 'var(--ok-bg)', color: 'var(--ok)', fontSize: 11, fontWeight: 600 }}>Ready</span>
                                                : <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>—</span>}
                                        </td>
                                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}><StIcon size={10} />{t.status.replace('_', ' ')}</span></td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {t.agentDraftReady && <button type="button" style={{ padding: '4px 8px', border: '1px solid var(--info-border)', borderRadius: 6, background: 'var(--info-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--info)', fontWeight: 600 }}>Review</button>}
                                                {['open', 'in_progress'].includes(t.status) && <button type="button" onClick={() => resolve(t.id)} style={{ padding: '4px 8px', border: '1px solid var(--ok-border)', borderRadius: 6, background: 'var(--ok-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>Resolve</button>}
                                                {t.status !== 'escalated' && t.status !== 'resolved' && <button type="button" onClick={() => escalate(t.id)} title="Escalate" style={{ padding: '4px 8px', border: '1px solid var(--danger-border)', borderRadius: 6, background: 'var(--danger-bg)', cursor: 'pointer', color: 'var(--danger)' }}><ArrowUpRight size={11} /></button>}
                                                <button type="button" onClick={() => openNotes(t)} title={t.operatorNotes ? 'Edit notes' : 'Add notes'} style={{ padding: '4px 8px', border: `1px solid ${t.operatorNotes ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg)'}`, borderRadius: 6, background: t.operatorNotes ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--card)', cursor: 'pointer', fontSize: 11, color: t.operatorNotes ? 'var(--accent)' : 'var(--ink-muted)' }}>
                                                    📝{t.operatorNotes ? ' ✓' : ''}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedNotes === t.id && (
                                        <tr key={`${t.id}-notes`} style={{ background: 'var(--bg)' }}>
                                            <td colSpan={8} style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', marginBottom: 4 }}>Operator notes for ticket #{t.ticketNumber}</label>
                                                        <textarea
                                                            rows={3}
                                                            value={notesDraft}
                                                            onChange={(e) => setNotesDraft(e.target.value)}
                                                            placeholder="Add internal notes visible only to operators…"
                                                            style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                        <button type="button" onClick={() => void saveNotes(t.id)} disabled={savingNotes} style={{ padding: '6px 14px', border: '1px solid var(--info-border)', borderRadius: 6, background: 'var(--info-bg)', cursor: 'pointer', fontSize: 12, color: 'var(--info)', fontWeight: 600 }}>
                                                            {savingNotes ? 'Saving…' : 'Save'}
                                                        </button>
                                                        <button type="button" onClick={() => setExpandedNotes(null)} style={{ padding: '6px 14px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', fontSize: 12, color: 'var(--ink-muted)' }}>
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
