'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Clock, CheckCircle2, XCircle, Send, RefreshCw } from 'lucide-react';

type CommsStatus = 'draft' | 'pending_review' | 'approved' | 'sent' | 'rejected';
type CommsType = 'email' | 'memo' | 'meeting_summary' | 'announcement' | 'report' | 'proposal';

type CommsDraft = {
    id: string;
    botId: string;
    commsType: CommsType;
    subject: string;
    recipientCount: number;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: CommsStatus;
    scheduledAt?: string;
    createdAt: string;
};

const API_BASE =
    typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
        : 'http://localhost:3000';

const TYPE_LABEL: Record<CommsType, string> = {
    email: 'Email', memo: 'Memo', meeting_summary: 'Meeting Summary',
    announcement: 'Announcement', report: 'Report', proposal: 'Proposal',
};

const TYPE_ICON: Record<CommsType, string> = {
    email: '✉', memo: '📝', meeting_summary: '🗒',
    announcement: '📢', report: '📊', proposal: '📋',
};

const STATUS_STYLE: Record<CommsStatus, { bg: string; color: string; icon: React.ElementType }> = {
    draft:          { bg: '#f1f5f9', color: '#475569', icon: Clock },
    pending_review: { bg: '#fef9c3', color: '#854d0e', icon: Clock },
    approved:       { bg: '#dcfce7', color: '#166534', icon: CheckCircle2 },
    sent:           { bg: '#eff6ff', color: '#1e40af', icon: Send },
    rejected:       { bg: '#fee2e2', color: '#991b1b', icon: XCircle },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
    low:    { color: '#94a3b8' },
    normal: { color: '#475569' },
    high:   { color: '#d97706' },
    urgent: { color: '#dc2626' },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#94a3b8', background: '#f8fafc', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#334155', verticalAlign: 'middle' };

function EmptyState() {
    return (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
            <Mail size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No communications pending review.</p>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>Corporate assistant drafts will appear here for approval before sending.</p>
        </div>
    );
}

export default function CommsDraftsPanel({ workspaceId }: { workspaceId: string }) {
    const [drafts, setDrafts] = useState<CommsDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<CommsStatus | 'all'>('pending_review');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/v1/comms/drafts?${params.toString()}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setDrafts(Array.isArray(data) ? data : (data.drafts ?? []));
        } catch {
            setDrafts([]);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, filter]);

    useEffect(() => { load(); }, [load]);

    const act = async (id: string, action: 'approve' | 'reject' | 'send') => {
        try {
            await fetch(`${API_BASE}/v1/comms/drafts/${id}/${action}`, { method: 'POST' });
            await load();
        } catch {
            setError(`Failed to ${action}`);
        }
    };

    const filters: { key: CommsStatus | 'all'; label: string }[] = [
        { key: 'pending_review', label: 'Pending' },
        { key: 'approved', label: 'Approved' },
        { key: 'sent', label: 'Sent' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'all', label: 'All' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {filters.map(({ key, label }) => (
                        <button key={key} type="button" onClick={() => setFilter(key)} style={{ padding: '5px 12px', border: `1px solid ${filter === key ? '#0066cc' : '#e2e8f0'}`, borderRadius: 20, background: filter === key ? 'rgba(0,102,204,0.07)' : '#fff', color: filter === key ? '#0066cc' : '#64748b', fontSize: 12, fontWeight: filter === key ? 600 : 400, cursor: 'pointer' }}>
                            {label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                    <RefreshCw size={12} />Refresh
                </button>
            </div>

            {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>{error}</div>}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading communications…</div>
            ) : drafts.length === 0 ? (
                <EmptyState />
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Subject', 'Type', 'Recipients', 'Priority', 'Status', 'Actions'].map(h => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {drafts.map((d, i) => {
                                const st = STATUS_STYLE[d.status];
                                const StIcon = st.icon;
                                const pr = PRIORITY_STYLE[d.priority] ?? PRIORITY_STYLE.normal;
                                return (
                                    <tr key={d.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                                        <td style={td}><span style={{ fontWeight: 500 }}>{d.subject}</span></td>
                                        <td style={td}><span style={{ fontSize: 12 }}>{TYPE_ICON[d.commsType]} {TYPE_LABEL[d.commsType]}</span></td>
                                        <td style={{ ...td, color: '#64748b' }}>{d.recipientCount}</td>
                                        <td style={{ ...td, fontWeight: 600, color: pr.color, fontSize: 12 }}>{d.priority.toUpperCase()}</td>
                                        <td style={td}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}>
                                                <StIcon size={10} />{d.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {d.status === 'pending_review' && (
                                                    <>
                                                        <button type="button" onClick={() => act(d.id, 'approve')} style={{ padding: '4px 8px', border: '1px solid #bbf7d0', borderRadius: 6, background: '#f0fdf4', cursor: 'pointer', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Approve</button>
                                                        <button type="button" onClick={() => act(d.id, 'reject')} style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Reject</button>
                                                    </>
                                                )}
                                                {d.status === 'approved' && (
                                                    <button type="button" onClick={() => act(d.id, 'send')} style={{ padding: '4px 8px', border: '1px solid #bfdbfe', borderRadius: 6, background: '#eff6ff', cursor: 'pointer', fontSize: 11, color: '#1d4ed8', fontWeight: 600 }}>Send Now</button>
                                                )}
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
