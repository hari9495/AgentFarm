'use client';

import { useCallback, useEffect, useState } from 'react';
import { Layers, Clock, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import OperatorGuide from './operator-guide';

const PP_GUIDE_ITEMS = [
    { label: 'Capacity vs story points', hint: 'For sprint plans: check teamSize × sprint velocity against the estimated scope. If the plan exceeds capacity by >20%, send back for re-scoping.', level: 'critical' as const },
    { label: 'Dependencies are identified', hint: 'Roadmaps and release plans should list blockers. An agent-generated plan with no dependencies is likely incomplete — ask it to identify cross-team dependencies.', level: 'caution' as const },
    { label: 'Risk level calibration', hint: '"High" risk plans need mitigation strategies documented. If riskLevel is high but the plan has no risk section, reject and request a risk register alongside it.', level: 'caution' as const },
    { label: 'Duration is realistic', hint: 'Compare durationDays to scope. A 90-day roadmap for 18 epics with a team of 4 is under-resourced. A 1-day sprint plan that spans 2 weeks is mislabelled.', level: 'verify' as const },
    { label: 'Retrospective actions are specific', hint: 'Retrospective items should name owners and deadlines. "Improve communication" is not actionable — it should be "Engineering sync every Monday at 10am, owned by EM".', level: 'caution' as const },
    { label: 'Approve = this plan is the team\'s direction', hint: 'Once approved, the PM agent will use this plan to guide task generation and sprint execution. Ensure the priorities match actual business objectives.', level: 'critical' as const },
];

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
    draft:     { bg: 'var(--bg)', color: 'var(--ink-muted)' },
    in_review: { bg: 'var(--warn-bg)', color: 'var(--warn)' },
    approved:  { bg: 'var(--ok-bg)', color: 'var(--ok)' },
    active:    { bg: 'var(--info-bg)', color: 'var(--info)' },
    completed: { bg: 'var(--ok-bg)', color: 'var(--ok)' },
    on_hold:   { bg: 'var(--warn-bg)', color: 'var(--warn)' },
};

const RISK_STYLE: Record<string, { bg: string; color: string; icon: React.ElementType }> = {
    low:    { bg: 'var(--ok-bg)', color: 'var(--ok)', icon: CheckCircle2 },
    medium: { bg: 'var(--warn-bg)', color: 'var(--warn)', icon: AlertTriangle },
    high:   { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: AlertTriangle },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };

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
            <OperatorGuide
                title="Project Plans — Operator Review Guide"
                intro="The PM agent generates plans from task context and workspace history. Review before approval — this becomes the team's execution direction."
                items={PP_GUIDE_ITEMS}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['in_review', 'approved', 'active', 'all'] as const).map(k => (
                        <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: '5px 12px', border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--bg)'}`, borderRadius: 20, background: filter === k ? 'rgba(0,102,204,0.07)' : 'var(--card)', color: filter === k ? 'var(--accent)' : '#64748b', fontSize: 12, fontWeight: filter === k ? 600 : 400, cursor: 'pointer' }}>
                            {k === 'all' ? 'All' : k.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading plans…</div>
            ) : plans.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
                    <Layers size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ margin: 0, fontSize: 14 }}>No project plans yet.</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>Sprint plans, roadmaps, and risk registers from your project manager will appear here.</p>
                </div>
            ) : (
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Title', 'Type', 'Team', 'Duration', 'Risk', 'Status', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {plans.map((p, i) => {
                                const st = STATUS_STYLE[p.status];
                                const rk = RISK_STYLE[p.riskLevel];
                                const RIcon = rk.icon;
                                return (
                                    <tr key={p.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : 'var(--card)' }}>
                                        <td style={{ ...td, fontWeight: 500 }}>{p.title}</td>
                                        <td style={td}><span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--bg)', color: 'var(--ink-muted)' }}>{TYPE_LABEL[p.planType]}</span></td>
                                        <td style={{ ...td, color: 'var(--ink-muted)' }}>{p.teamSize}</td>
                                        <td style={{ ...td, color: 'var(--ink-muted)' }}>{p.durationDays}d</td>
                                        <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: rk.bg, color: rk.color, fontSize: 11, fontWeight: 600 }}><RIcon size={10} />{p.riskLevel}</span></td>
                                        <td style={td}><span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}>{p.status.replace('_', ' ')}</span></td>
                                        <td style={td}>
                                            {p.status === 'in_review' && <button type="button" onClick={() => approve(p.id)} style={{ padding: '4px 10px', border: '1px solid var(--ok-border)', borderRadius: 6, background: 'var(--ok-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>Approve</button>}
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
