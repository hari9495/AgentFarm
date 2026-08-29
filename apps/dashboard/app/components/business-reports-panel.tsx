'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart2, Clock, CheckCircle2, XCircle, Download, RefreshCw } from 'lucide-react';
import OperatorGuide from './operator-guide';

const BR_GUIDE_ITEMS = [
    { label: 'Source data verification', hint: 'AI analysts infer from context. Check: are the cited market sizes, growth rates, and competitor data from verifiable sources? Reject if the agent cannot cite a primary source.', level: 'critical' as const },
    { label: 'Numeric accuracy', hint: 'Cross-check key figures (revenue estimates, percentages, headcounts) against your internal data. A 10% error in a BRD can cascade into budget misalignment.', level: 'critical' as const },
    { label: 'Stakeholder list completeness', hint: 'Review the requestedBy field. Is the correct sponsor named? Misattributed reports create accountability gaps in decision trails.', level: 'caution' as const },
    { label: 'Scope creep in BRDs', hint: 'Check that requirements are within the original ask. Agents sometimes add "nice to have" requirements as "must have" — flag these for scope clarification.', level: 'caution' as const },
    { label: 'Page count vs depth', hint: 'A 2-page feasibility study is under-researched. A 60-page BRD for a small feature is over-scoped. Flag outliers for revision before approval.', level: 'verify' as const },
    { label: 'Approval is a strategic commitment', hint: 'Approving a BRD or roadmap report signals executive buy-in. Ensure the report is ready for stakeholder distribution before approving.', level: 'caution' as const },
];

type ReportStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';
type ReportType = 'brd' | 'market_analysis' | 'stakeholder_report' | 'feasibility_study' | 'gap_analysis' | 'requirements_spec';

type BusinessReport = {
    id: string;
    botId: string;
    reportType: ReportType;
    title: string;
    summary: string;
    pageCount: number;
    status: ReportStatus;
    requestedBy?: string;
    createdAt: string;
};

const API_BASE = '';

const TYPE_LABEL: Record<ReportType, string> = {
    brd: 'BRD', market_analysis: 'Market Analysis', stakeholder_report: 'Stakeholder Report',
    feasibility_study: 'Feasibility Study', gap_analysis: 'Gap Analysis', requirements_spec: 'Requirements Spec',
};

const STATUS_STYLE: Record<ReportStatus, { bg: string; color: string; icon: React.ElementType }> = {
    draft:          { bg: 'var(--bg)', color: 'var(--ink-muted)', icon: Clock },
    pending_review: { bg: 'var(--warn-bg)', color: 'var(--warn)', icon: Clock },
    approved:       { bg: 'var(--ok-bg)', color: 'var(--ok)', icon: CheckCircle2 },
    rejected:       { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: XCircle },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };

export default function BusinessReportsPanel({ workspaceId }: { workspaceId: string }) {
    const [reports, setReports] = useState<BusinessReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<ReportStatus | 'all'>('pending_review');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/api/business-reports?${params.toString()}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setReports(Array.isArray(data) ? data : (data.reports ?? []));
        } catch {
            setReports([]);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, filter]);

    useEffect(() => { load(); }, [load]);

    const act = async (id: string, action: 'approve' | 'reject') => {
        await fetch(`${API_BASE}/api/business-reports/${id}/${action}`, { method: 'POST' }).catch(() => null);
        await load();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <OperatorGuide
                title="Business Reports — Operator Review Guide"
                intro="The BA agent produces reports from available workspace context. It cannot independently verify data — your review is the quality gate."
                items={BR_GUIDE_ITEMS}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['pending_review', 'approved', 'rejected', 'all'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '5px 12px', border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--bg)'}`, borderRadius: 20, background: filter === k ? 'rgba(214, 48, 31,0.07)' : 'var(--card)', color: filter === k ? 'var(--accent)' : 'var(--ink-muted)', fontSize: 12, fontWeight: filter === k ? 600 : 400, cursor: 'pointer' }}>
                            {k === 'all' ? 'All' : k.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading reports…</div>
            ) : reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
                    <BarChart2 size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No reports yet.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Business analyst reports (BRDs, specs, analyses) will appear here.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Title', 'Type', 'Pages', 'Status', 'Created', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {reports.map((r, i) => {
                                const st = STATUS_STYLE[r.status];
                                const StIcon = st.icon;
                                return (
                                    <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? 'var(--bg)' : 'var(--card)' }}>
                                        <td style={td}><div style={{ fontWeight: 500 }}>{r.title}</div><div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{r.summary}</div></td>
                                        <td style={td}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink-muted)' }}>{TYPE_LABEL[r.reportType]}</span></td>
                                        <td style={{ ...td, color: 'var(--ink-muted)' }}>{r.pageCount}</td>
                                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}><StIcon size={10} />{r.status.replace('_', ' ')}</span></td>
                                        <td style={{ ...td, color: 'var(--ink-muted)', fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button type="button" title="Download" style={{ padding: '4px 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', color: 'var(--ink-muted)' }}><Download size={11} /></button>
                                                {r.status === 'pending_review' && <>
                                                    <button type="button" onClick={() => act(r.id, 'approve')} style={{ padding: '4px 8px', border: '1px solid var(--ok-border)', borderRadius: 6, background: 'var(--ok-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>Approve</button>
                                                    <button type="button" onClick={() => act(r.id, 'reject')} style={{ padding: '4px 8px', border: '1px solid var(--danger-border)', borderRadius: 6, background: 'var(--danger-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Reject</button>
                                                </>}
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
