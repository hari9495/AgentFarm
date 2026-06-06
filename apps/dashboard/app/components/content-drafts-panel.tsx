'use client';

import { useCallback, useEffect, useState } from 'react';
import { FileText, CheckCircle2, XCircle, Clock, RefreshCw, Eye } from 'lucide-react';
import OperatorGuide from './operator-guide';

const CONTENT_GUIDE_ITEMS = [
    { label: 'Factual accuracy', hint: 'Check all statistics, dates, product names, and pricing mentioned in the excerpt. AI agents hallucinate specifics — verify against primary sources before approving.', level: 'critical' as const },
    { label: 'Brand voice consistency', hint: 'Compare tone to your style guide. Watch for: overly formal language, superlatives ("best", "only"), unsubstantiated claims, and competitor mentions.', level: 'caution' as const },
    { label: 'Target channel fit', hint: 'A "blog_post" going to "twitter" is a mismatch. Confirm the channel matches the draft type and word count. Social posts should be ≤ 280 chars after formatting.', level: 'caution' as const },
    { label: 'Word count vs brief', hint: 'Compare wordCount to your brief. Significant over/under (>20%) suggests the agent misunderstood scope — send back with a revised prompt.', level: 'verify' as const },
    { label: 'No PII or confidential data', hint: 'Scan the excerpt for customer names, internal project codenames, unreleased feature names, or financial figures not yet in the public record.', level: 'critical' as const },
    { label: 'Publish = live', hint: 'Clicking Publish sends the content to the targetChannel integration. There is no draft mode after this — it will go live immediately.', level: 'verify' as const },
];

type DraftStatus = 'pending_review' | 'approved' | 'rejected' | 'published';
type DraftType = 'blog_post' | 'social_post' | 'email_campaign' | 'technical_doc' | 'api_doc' | 'runbook' | 'release_note';

type ContentDraft = {
    id: string;
    botId: string;
    agentRole: string;
    draftType: DraftType;
    title: string;
    excerpt: string;
    wordCount: number;
    status: DraftStatus;
    targetChannel?: string;
    createdAt: string;
    updatedAt: string;
};

const API_BASE = '';

const TYPE_LABEL: Record<DraftType, string> = {
    blog_post: 'Blog Post',
    social_post: 'Social Post',
    email_campaign: 'Email Campaign',
    technical_doc: 'Technical Doc',
    api_doc: 'API Doc',
    runbook: 'Runbook',
    release_note: 'Release Note',
};

const STATUS_STYLE: Record<DraftStatus, { bg: string; color: string; icon: React.ElementType }> = {
    pending_review: { bg: 'var(--warn-bg)', color: 'var(--warn)', icon: Clock },
    approved:       { bg: 'var(--ok-bg)', color: 'var(--ok)', icon: CheckCircle2 },
    rejected:       { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: XCircle },
    published:      { bg: 'var(--info-bg)', color: 'var(--info)', icon: CheckCircle2 },
};

const ROLE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
    content_writer:    { bg: 'color-mix(in srgb, var(--accent) 8%, transparent)', color: 'var(--accent)', label: 'Content Writer' },
    technical_writer:  { bg: 'var(--info-bg)', color: 'var(--info)', label: 'Tech Writer' },
    corporate_assistant: { bg: 'var(--warn-bg)', color: 'var(--warn)', label: 'Corp. Assistant' },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };

function EmptyState() {
    return (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
            <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No drafts awaiting review.</p>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>Content and technical writing agents will surface drafts here.</p>
        </div>
    );
}

export default function ContentDraftsPanel({ workspaceId }: { workspaceId: string }) {
    const [drafts, setDrafts] = useState<ContentDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<DraftStatus | 'all'>('pending_review');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/api/content-drafts?${params.toString()}`);
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

    const act = async (id: string, action: 'approve' | 'reject' | 'publish') => {
        try {
            await fetch(`${API_BASE}/api/content-drafts/${id}/${action}`, { method: 'POST' });
            await load();
        } catch {
            setError(`Failed to ${action} draft`);
        }
    };

    const statusFilters: { key: DraftStatus | 'all'; label: string }[] = [
        { key: 'pending_review', label: 'Pending' },
        { key: 'approved', label: 'Approved' },
        { key: 'published', label: 'Published' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'all', label: 'All' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <OperatorGuide
                title="Content Drafts — Operator Review Guide"
                intro="AI-generated content requires editorial sign-off before publishing. The agent cannot verify facts — that is your role."
                items={CONTENT_GUIDE_ITEMS}
            />
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {statusFilters.map(({ key, label }) => (
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
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading drafts…</div>
            ) : drafts.length === 0 ? (
                <EmptyState />
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                {['Title', 'Type', 'Agent', 'Words', 'Status', 'Actions'].map(h => (
                                    <th key={h} style={th}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {drafts.map((d, i) => {
                                const st = STATUS_STYLE[d.status];
                                const StIcon = st.icon;
                                const rb = ROLE_BADGE[d.agentRole] ?? { bg: 'var(--bg)', color: 'var(--ink-muted)', label: d.agentRole };
                                return (
                                    <tr key={d.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? 'var(--bg)' : 'var(--card)' }}>
                                        <td style={td}>
                                            <div style={{ fontWeight: 500, color: 'var(--ink-soft)' }}>{d.title}</div>
                                            <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.excerpt}</div>
                                        </td>
                                        <td style={td}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink-muted)' }}>{TYPE_LABEL[d.draftType] ?? d.draftType}</span></td>
                                        <td style={td}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: rb.bg, color: rb.color }}>{rb.label}</span></td>
                                        <td style={{ ...td, color: 'var(--ink-muted)' }}>{d.wordCount.toLocaleString()}</td>
                                        <td style={td}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}>
                                                <StIcon size={10} />{d.status.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button type="button" title="Preview" style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', fontSize: 11, color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Eye size={11} />
                                                </button>
                                                {d.status === 'pending_review' && (
                                                    <>
                                                        <button type="button" onClick={() => act(d.id, 'approve')} style={{ padding: '4px 8px', border: '1px solid var(--ok-border)', borderRadius: 6, background: 'var(--ok-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>Approve</button>
                                                        <button type="button" onClick={() => act(d.id, 'reject')} style={{ padding: '4px 8px', border: '1px solid var(--danger-border)', borderRadius: 6, background: 'var(--danger-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Reject</button>
                                                    </>
                                                )}
                                                {d.status === 'approved' && (
                                                    <button type="button" onClick={() => act(d.id, 'publish')} style={{ padding: '4px 8px', border: '1px solid var(--info-border)', borderRadius: 6, background: 'var(--info-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--info)', fontWeight: 600 }}>Publish</button>
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
