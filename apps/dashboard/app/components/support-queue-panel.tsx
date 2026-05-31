'use client';

import { useCallback, useEffect, useState } from 'react';
import { HeadphonesIcon, AlertCircle, Clock, CheckCircle2, ArrowUpRight, RefreshCw } from 'lucide-react';

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
    createdAt: string;
    updatedAt: string;
};

const API_BASE =
    typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
        : 'http://localhost:3000';

const STATUS_STYLE: Record<TicketStatus, { bg: string; color: string; icon: React.ElementType }> = {
    open:             { bg: '#eff6ff', color: '#1e40af', icon: Clock },
    in_progress:      { bg: '#fef9c3', color: '#854d0e', icon: Clock },
    pending_customer: { bg: '#f1f5f9', color: '#475569', icon: Clock },
    resolved:         { bg: '#dcfce7', color: '#166534', icon: CheckCircle2 },
    escalated:        { bg: '#fee2e2', color: '#991b1b', icon: AlertCircle },
};

const PRIORITY_STYLE: Record<TicketPriority, { color: string }> = {
    low: { color: '#94a3b8' }, normal: { color: '#475569' },
    high: { color: '#d97706' }, critical: { color: '#dc2626' },
};

const CHANNEL_ICON: Record<string, string> = {
    email: '✉', chat: '💬', phone: '📞', portal: '🌐',
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#94a3b8', background: '#f8fafc', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#334155', verticalAlign: 'middle' };

export default function SupportQueuePanel({ workspaceId }: { workspaceId: string }) {
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<TicketStatus | 'all'>('open');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/v1/support/tickets?${params.toString()}`);
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
        await fetch(`${API_BASE}/v1/support/tickets/${id}/escalate`, { method: 'POST' }).catch(() => null);
        await load();
    };

    const resolve = async (id: string) => {
        await fetch(`${API_BASE}/v1/support/tickets/${id}/resolve`, { method: 'POST' }).catch(() => null);
        await load();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['open', 'in_progress', 'escalated', 'resolved', 'all'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '5px 12px', border: `1px solid ${filter === k ? '#0066cc' : '#e2e8f0'}`, borderRadius: 20, background: filter === k ? 'rgba(0,102,204,0.07)' : '#fff', color: filter === k ? '#0066cc' : '#64748b', fontSize: 12, fontWeight: filter === k ? 600 : 400, cursor: 'pointer' }}>
                            {k === 'all' ? 'All' : k.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading tickets…</div>
            ) : tickets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                    <HeadphonesIcon size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No tickets in the queue.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Customer support agent activity and escalations will appear here.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['#', 'Subject', 'Customer', 'Channel', 'Priority', 'Draft', 'Status', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {tickets.map((t, i) => {
                                const st = STATUS_STYLE[t.status];
                                const StIcon = st.icon;
                                const pr = PRIORITY_STYLE[t.priority];
                                const isBreaching = t.slaBreachAt && new Date(t.slaBreachAt) < new Date(Date.now() + 30 * 60 * 1000);
                                return (
                                    <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                                        <td style={{ ...td, fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{t.ticketNumber}</td>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500 }}>{t.subject}</div>
                                            {isBreaching && <div style={{ fontSize: 10, color: '#dc2626', marginTop: 2 }}>⚠ SLA at risk</div>}
                                        </td>
                                        <td style={{ ...td, color: '#64748b' }}>{t.customerName}</td>
                                        <td style={{ ...td, fontSize: 14 }}>{CHANNEL_ICON[t.channel] ?? t.channel}</td>
                                        <td style={{ ...td, fontWeight: 700, fontSize: 11, color: pr.color }}>{t.priority.toUpperCase()}</td>
                                        <td style={td}>
                                            {t.agentDraftReady
                                                ? <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 20, background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 600 }}>Ready</span>
                                                : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
                                        </td>
                                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}><StIcon size={10} />{t.status.replace('_', ' ')}</span></td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {t.agentDraftReady && <button type="button" style={{ padding: '4px 8px', border: '1px solid #bfdbfe', borderRadius: 6, background: '#eff6ff', cursor: 'pointer', fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>Review</button>}
                                                {['open', 'in_progress'].includes(t.status) && <button type="button" onClick={() => resolve(t.id)} style={{ padding: '4px 8px', border: '1px solid #bbf7d0', borderRadius: 6, background: '#f0fdf4', cursor: 'pointer', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Resolve</button>}
                                                {t.status !== 'escalated' && t.status !== 'resolved' && <button type="button" onClick={() => escalate(t.id)} title="Escalate" style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}><ArrowUpRight size={11} /></button>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
