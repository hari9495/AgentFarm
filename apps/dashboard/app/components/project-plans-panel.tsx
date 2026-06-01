'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers, Clock, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

type PlanStatus = 'draft' | 'in_review' | 'approved' | 'active' | 'completed' | 'on_hold';
type PlanType = 'sprint_plan' | 'project_roadmap' | 'risk_register' | 'retrospective' | 'release_plan' | 'backlog_refinement';

type ProjectPlan = {
    id: string;
    botId: string;
    planType: PlanType;
    title: string;
    teamSize: number;
    durationDays: number;
    status: PlanStatus;
    riskLevel: 'low' | 'medium' | 'high';
    createdAt: string;
};

const API_BASE = '';

const TYPE_LABEL: Record<PlanType, string> = {
    sprint_plan: 'Sprint Plan', project_roadmap: 'Roadmap', risk_register: 'Risk Register',
    retrospective: 'Retrospective', release_plan: 'Release Plan', backlog_refinement: 'Backlog',
};

const STATUS_STYLE: Record<PlanStatus, { bg: string; color: string }> = {
    draft:     { bg: '#f1f5f9', color: '#475569' },
    in_review: { bg: '#fef9c3', color: '#854d0e' },
    approved:  { bg: '#dcfce7', color: '#166534' },
    active:    { bg: '#eff6ff', color: '#1e40af' },
    completed: { bg: '#f0fdf4', color: '#15803d' },
    on_hold:   { bg: '#fef3c7', color: '#92400e' },
};

const RISK_STYLE: Record<string, { bg: string; color: string; icon: React.ElementType }> = {
    low:    { bg: '#dcfce7', color: '#166534', icon: CheckCircle2 },
    medium: { bg: '#fef9c3', color: '#854d0e', icon: AlertTriangle },
    high:   { bg: '#fee2e2', color: '#991b1b', icon: AlertTriangle },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#94a3b8', background: '#f8fafc', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: '#334155', verticalAlign: 'middle' };

export default function ProjectPlansPanel({ workspaceId }: { workspaceId: string }) {
    const [plans, setPlans] = useState<ProjectPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<PlanStatus | 'all'>('in_review');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (filter !== 'all') params.set('status', filter);
            const res = await fetch(`${API_BASE}/api/project-plans?${params.toString()}`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            setPlans(Array.isArray(data) ? data : (data.plans ?? []));
        } catch {
            setPlans([]);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, filter]);

    useEffect(() => { load(); }, [load]);

    const approve = async (id: string) => {
        await fetch(`${API_BASE}/api/project-plans/${id}/approve`, { method: 'POST' }).catch(() => null);
        await load();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['in_review', 'approved', 'active', 'all'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '5px 12px', border: `1px solid ${filter === k ? '#0066cc' : '#e2e8f0'}`, borderRadius: 20, background: filter === k ? 'rgba(0,102,204,0.07)' : '#fff', color: filter === k ? '#0066cc' : '#64748b', fontSize: 12, fontWeight: filter === k ? 600 : 400, cursor: 'pointer' }}>
                            {k === 'all' ? 'All' : k.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Loading plans…</div>
            ) : plans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
                    <Layers size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No project plans yet.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Sprint plans, roadmaps, and risk registers from your project manager will appear here.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Title', 'Type', 'Team', 'Duration', 'Risk', 'Status', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {plans.map((p, i) => {
                                const st = STATUS_STYLE[p.status];
                                const rk = RISK_STYLE[p.riskLevel];
                                const RIcon = rk.icon;
                                return (
                                    <tr key={p.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : '#fff' }}>
                                        <td style={{ ...td, fontWeight: 500 }}>{p.title}</td>
                                        <td style={td}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>{TYPE_LABEL[p.planType]}</span></td>
                                        <td style={{ ...td, color: '#64748b' }}>{p.teamSize}</td>
                                        <td style={{ ...td, color: '#64748b' }}>{p.durationDays}d</td>
                                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: rk.bg, color: rk.color, fontSize: 11, fontWeight: 600 }}><RIcon size={10} />{p.riskLevel}</span></td>
                                        <td style={td}><span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}>{p.status.replace('_', ' ')}</span></td>
                                        <td style={td}>
                                            {p.status === 'in_review' && <button type="button" onClick={() => approve(p.id)} style={{ padding: '4px 10px', border: '1px solid #bbf7d0', borderRadius: 6, background: '#f0fdf4', cursor: 'pointer', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>Approve</button>}
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
