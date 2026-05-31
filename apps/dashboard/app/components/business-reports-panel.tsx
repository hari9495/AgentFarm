'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart2, Clock, CheckCircle2, XCircle, Download, RefreshCw } from 'lucide-react';

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

const API_BASE =
    typeof window !== 'undefined'
        ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
        : 'http://localhost:3000';

const TYPE_LABEL: Record<ReportType, string> = {
    brd: 'BRD', market_analysis: 'Market Analysis', stakeholder_report: 'Stakeholder Report',
    feasibility_study: 'Feasibility Study', gap_analysis: 'Gap Analysis', requirements_spec: 'Requirements Spec',
};

const STATUS_STYLE: Record<ReportStatus, { bg: string; color: string; icon: React.ElementType }> = {
    draft:          { bg: '#f1f5f9', color: '#475569', icon: Clock },
    pending_review: { bg: '#fef9c3', color: '#854d0e', icon: Clock },
    approved:       { bg: '#dcfce7', color: '#166534', icon: CheckCircle2 },
    rejected:       { bg: '#fee2e2', color: '#991b1b', icon: XCircle },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#94a3b8', background: '#f8fafc', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#334155', verticalAlign: 'middle' };

export default function BusinessReportsPanel({ workspaceId }: { workspaceId: string }) {
    const [reports, setReports] = useState<BusinessReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<ReportStatus | 'all'>('pending_review');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/v1/business/reports?${params.toString()}`);
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
        await fetch(`${API_BASE}/v1/business/reports/${id}/${action}`, { method: 'POST' }).catch(() => null);
        await load();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['pending_review', 'approved', 'rejected', 'all'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '5px 12px', border: `1px solid ${filter === k ? '#0066cc' : '#e2e8f0'}`, borderRadius: 20, background: filter === k ? 'rgba(0,102,204,0.07)' : '#fff', color: filter === k ? '#0066cc' : '#64748b', fontSize: 12, fontWeight: filter === k ? 600 : 400, cursor: 'pointer' }}>
                            {k === 'all' ? 'All' : k.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading reports…</div>
            ) : reports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                    <BarChart2 size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No reports yet.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Business analyst reports (BRDs, specs, analyses) will appear here.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Title', 'Type', 'Pages', 'Status', 'Created', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {reports.map((r, i) => {
                                const st = STATUS_STYLE[r.status];
                                const StIcon = st.icon;
                                return (
                                    <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                                        <td style={td}><div style={{ fontWeight: 500 }}>{r.title}</div><div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{r.summary}</div></td>
                                        <td style={td}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>{TYPE_LABEL[r.reportType]}</span></td>
                                        <td style={{ ...td, color: '#64748b' }}>{r.pageCount}</td>
                                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}><StIcon size={10} />{r.status.replace('_', ' ')}</span></td>
                                        <td style={{ ...td, color: '#64748b', fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button type="button" title="Download" style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', color: '#64748b' }}><Download size={11} /></button>
                                                {r.status === 'pending_review' && <>
                                                    <button type="button" onClick={() => act(r.id, 'approve')} style={{ padding: '4px 8px', border: '1px solid #bbf7d0', borderRadius: 6, background: '#f0fdf4', cursor: 'pointer', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Approve</button>
                                                    <button type="button" onClick={() => act(r.id, 'reject')} style={{ padding: '4px 8px', border: '1px solid #fecaca', borderRadius: 6, background: '#fef2f2', cursor: 'pointer', fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Reject</button>
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
