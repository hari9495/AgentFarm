'use client';

import { useCallback, useEffect, useState } from 'react';
import { Megaphone, TrendingUp, RefreshCw, Play, Pause, CheckCircle2, Clock } from 'lucide-react';
import OperatorGuide from './operator-guide';

const CAMP_GUIDE_ITEMS = [
    { label: 'Budget is within approved limit', hint: 'Confirm budgetUsd is within your approved channel spend. The agent may propose a budget based on historical averages — verify against current quarter allocation.', level: 'critical' as const },
    { label: 'Targeting does not violate compliance', hint: 'Check targetAudience for age, demographic, or geographic targeting that may violate GDPR, CCPA, or platform-specific ad policies.', level: 'critical' as const },
    { label: 'Channel is appropriate for the message', hint: '"Paid Search" for brand awareness and "Email" for product launch announcements have different intent match. Mismatch = wasted budget.', level: 'caution' as const },
    { label: 'CTR benchmark check (active campaigns)', hint: 'Expected CTR by channel: Email 2–5%, Paid Search 2–4%, Social 0.5–1.5%, Display 0.1–0.3%. A 10%+ CTR likely has a tracking error — pause and investigate.', level: 'caution' as const },
    { label: 'Start/end dates are correct', hint: 'Verify campaign dates do not overlap with product blackout periods, competitive launches, or major company events. The agent has no calendar context.', level: 'caution' as const },
    { label: 'Approve = live spend authorisation', hint: 'Approving a campaign authorises the marketing agent to begin execution on the connected channel. Budget will begin accruing immediately after the start date.', level: 'critical' as const },
];

type CampaignStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'paused' | 'completed' | 'rejected';
type CampaignChannel = 'email' | 'social' | 'paid_search' | 'display' | 'content' | 'seo';

type Campaign = {
    id: string;
    name: string;
    channel: CampaignChannel;
    targetAudience: string;
    budgetUsd: number;
    status: CampaignStatus;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    startDate?: string;
    endDate?: string;
    createdAt: string;
};

const API_BASE = '';

const CHANNEL_LABEL: Record<CampaignChannel, string> = {
    email: 'Email', social: 'Social', paid_search: 'Paid Search',
    display: 'Display', content: 'Content', seo: 'SEO',
};

const STATUS_STYLE: Record<CampaignStatus, { bg: string; color: string; icon: React.ElementType }> = {
    draft:            { bg: '#f1f5f9', color: '#475569', icon: Clock },
    pending_approval: { bg: '#fef9c3', color: 'var(--warn)', icon: Clock },
    approved:         { bg: '#dcfce7', color: 'var(--ok)', icon: CheckCircle2 },
    active:           { bg: '#eff6ff', color: '#1e40af', icon: Play },
    paused:           { bg: '#fef3c7', color: 'var(--warn)', icon: Pause },
    completed:        { bg: '#f0fdf4', color: 'var(--ok)', icon: CheckCircle2 },
    rejected:         { bg: '#fee2e2', color: 'var(--danger)', icon: Clock },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };

export default function CampaignsPanel({ workspaceId }: { workspaceId: string }) {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<CampaignStatus | 'all'>('pending_approval');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/api/campaigns?${params.toString()}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setCampaigns(Array.isArray(data) ? data : (data.campaigns ?? []));
        } catch {
            setCampaigns([]);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, filter]);

    useEffect(() => { load(); }, [load]);

    const act = async (id: string, action: 'approve' | 'reject' | 'pause' | 'resume') => {
        await fetch(`${API_BASE}/api/campaigns/${id}/${action}`, { method: 'POST' }).catch(() => null);
        await load();
    };

    const ctr = (c: Campaign) =>
        c.impressions && c.clicks ? ((c.clicks / c.impressions) * 100).toFixed(1) + '%' : '—';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <OperatorGuide
                title="Campaigns — Operator Review Guide"
                intro="The Marketing agent drafts and proposes campaigns. Approving authorises spend. Pausing stops active spend immediately."
                items={CAMP_GUIDE_ITEMS}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['pending_approval', 'active', 'paused', 'all'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '5px 12px', border: `1px solid ${filter === k ? '#0066cc' : '#e2e8f0'}`, borderRadius: 20, background: filter === k ? 'rgba(0,102,204,0.07)' : '#fff', color: filter === k ? '#0066cc' : '#64748b', fontSize: 12, fontWeight: filter === k ? 600 : 400, cursor: 'pointer' }}>
                            {k === 'all' ? 'All' : k.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 12, color: '#64748b', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading campaigns…</div>
            ) : campaigns.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
                    <Megaphone size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No campaigns yet.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Marketing campaigns drafted by your marketing specialist will appear here.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Campaign', 'Channel', 'Budget', 'CTR', 'Conversions', 'Status', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {campaigns.map((c, i) => {
                                const st = STATUS_STYLE[c.status];
                                const StIcon = st.icon;
                                return (
                                    <tr key={c.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500 }}>{c.name}</div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{c.targetAudience}</div>
                                        </td>
                                        <td style={td}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--bg)', color: '#475569' }}>{CHANNEL_LABEL[c.channel]}</span></td>
                                        <td style={{ ...td, color: '#64748b' }}>${c.budgetUsd.toLocaleString()}</td>
                                        <td style={{ ...td, color: '#64748b' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                {c.clicks != null && <TrendingUp size={11} style={{ color: 'var(--ok)' }} />}
                                                {ctr(c)}
                                            </div>
                                        </td>
                                        <td style={{ ...td, color: '#64748b' }}>{c.conversions?.toLocaleString() ?? '—'}</td>
                                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}><StIcon size={10} />{c.status.replace('_', ' ')}</span></td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {c.status === 'pending_approval' && <>
                                                    <button type="button" onClick={() => act(c.id, 'approve')} style={{ padding: '4px 8px', border: '1px solid var(--ok-border)', borderRadius: 6, background: 'var(--ok-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>Approve</button>
                                                    <button type="button" onClick={() => act(c.id, 'reject')} style={{ padding: '4px 8px', border: '1px solid var(--danger-border)', borderRadius: 6, background: 'var(--danger-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Reject</button>
                                                </>}
                                                {c.status === 'active' && <button type="button" onClick={() => act(c.id, 'pause')} style={{ padding: '4px 8px', border: '1px solid #fef08a', borderRadius: 6, background: '#fefce8', cursor: 'pointer', fontSize: 11, color: '#ca8a04', fontWeight: 600 }}>Pause</button>}
                                                {c.status === 'paused' && <button type="button" onClick={() => act(c.id, 'resume')} style={{ padding: '4px 8px', border: '1px solid var(--info-border)', borderRadius: 6, background: 'var(--info-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--info)', fontWeight: 600 }}>Resume</button>}
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
