'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Clock, CheckCircle2, XCircle, Send, RefreshCw } from 'lucide-react';
import OperatorGuide from './operator-guide';

const COMMS_GUIDE_ITEMS = [
    { label: 'Recipient list is correct', hint: 'Verify recipientCount matches your intended audience. A memo to 200 people vs 45 is a very different action. Cross-check with the subject line context.', level: 'critical' as const },
    { label: 'Sender identity', hint: 'The agent sends under the authorised account. Confirm the "from" identity is appropriate — an email from the CEO should not come from a support mailbox.', level: 'critical' as const },
    { label: 'No legally sensitive statements', hint: 'Look for: promises of refunds/compensation, liability admissions, guarantee statements, or regulatory claims. These require legal sign-off before sending.', level: 'critical' as const },
    { label: 'Tone matches urgency and relationship', hint: '"URGENT" priority + formal tone to customers is right. "URGENT" + casual tone to the board is wrong. Check priority badge vs communication type.', level: 'caution' as const },
    { label: 'Send Now is permanent', hint: 'Once you click Send Now, the message is dispatched to the connector immediately. There is no recall. For high recipient counts (>50), require a second reviewer.', level: 'critical' as const },
    { label: 'Scheduled timing', hint: 'If a scheduledAt time is shown, verify the timezone is correct. A "9am" announcement sent at 9am UTC reaches US/East at 4am — check this before approving.', level: 'caution' as const },
];

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

const API_BASE = '';

const TYPE_LABEL: Record<CommsType, string> = {
    email: 'Email', memo: 'Memo', meeting_summary: 'Meeting Summary',
    announcement: 'Announcement', report: 'Report', proposal: 'Proposal',
};

const TYPE_ICON: Record<CommsType, string> = {
    email: '✉', memo: '📝', meeting_summary: '🗒',
    announcement: '📢', report: '📊', proposal: '📋',
};

const STATUS_STYLE: Record<CommsStatus, { bg: string; color: string; icon: React.ElementType }> = {
    draft:          { bg: 'var(--bg)', color: 'var(--ink-muted)', icon: Clock },
    pending_review: { bg: 'var(--warn-bg)', color: 'var(--warn)', icon: Clock },
    approved:       { bg: 'var(--ok-bg)', color: 'var(--ok)', icon: CheckCircle2 },
    sent:           { bg: 'var(--info-bg)', color: 'var(--info)', icon: Send },
    rejected:       { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: XCircle },
};

const PRIORITY_STYLE: Record<string, { color: string }> = {
    low:    { color: 'var(--ink-muted)' },
    normal: { color: 'var(--ink-muted)' },
    high:   { color: 'var(--warn)' },
    urgent: { color: 'var(--danger)' },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };

function EmptyState() {
    return (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
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
            const res = await fetch(`${API_BASE}/api/comms-drafts?${params.toString()}`);
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
            await fetch(`${API_BASE}/api/comms-drafts/${id}/${action}`, { method: 'POST' });
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
            <OperatorGuide
                title="Comms Inbox — Operator Review Guide"
                intro="The Corporate Assistant sends messages under your organisation's name. Approval is a hard gate — sending is permanent."
                items={COMMS_GUIDE_ITEMS}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {filters.map(({ key, label }) => (
                        <button key={key} type="button" onClick={() => setFilter(key)} style={{ padding: '5px 12px', border: `1px solid ${filter === key ? 'var(--accent)' : 'var(--bg)'}`, borderRadius: 20, background: filter === key ? 'rgba(0,102,204,0.07)' : 'var(--card)', color: filter === key ? 'var(--accent)' : 'var(--ink-muted)', fontSize: 12, fontWeight: filter === key ? 600 : 400, cursor: 'pointer' }}>
                            {label}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer' }}>
                    <RefreshCw size={12} />Refresh
                </button>
            </div>

            {error && <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', borderRadius: 8, fontSize: 13, color: 'var(--danger)' }}>{error}</div>}

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading communications…</div>
            ) : drafts.length === 0 ? (
                <EmptyState />
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
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
                                    <tr key={d.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? 'var(--bg)' : 'var(--card)' }}>
                                        <td style={td}><span style={{ fontWeight: 500 }}>{d.subject}</span></td>
                                        <td style={td}><span style={{ fontSize: 12 }}>{TYPE_ICON[d.commsType]} {TYPE_LABEL[d.commsType]}</span></td>
                                        <td style={{ ...td, color: 'var(--ink-muted)' }}>{d.recipientCount}</td>
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
                                                        <button type="button" onClick={() => act(d.id, 'approve')} style={{ padding: '4px 8px', border: '1px solid var(--ok-border)', borderRadius: 6, background: 'var(--ok-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>Approve</button>
                                                        <button type="button" onClick={() => act(d.id, 'reject')} style={{ padding: '4px 8px', border: '1px solid var(--danger-border)', borderRadius: 6, background: 'var(--danger-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Reject</button>
                                                    </>
                                                )}
                                                {d.status === 'approved' && (
                                                    <button type="button" onClick={() => act(d.id, 'send')} style={{ padding: '4px 8px', border: '1px solid var(--info-border)', borderRadius: 6, background: 'var(--info-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--info)', fontWeight: 600 }}>Send Now</button>
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
