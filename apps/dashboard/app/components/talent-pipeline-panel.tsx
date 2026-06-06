'use client';

import { useCallback, useEffect, useState } from 'react';
import { Users, Briefcase, RefreshCw, CheckCircle2, Clock, XCircle } from 'lucide-react';
import OperatorGuide from './operator-guide';

const TALENT_GUIDE_ITEMS = [
    { label: 'Match score is algorithmic, not a hiring decision', hint: 'Match score reflects skills overlap with the JD. It does not assess culture fit, communication, or growth potential. Never advance or reject based on score alone.', level: 'critical' as const },
    { label: 'Advance stage means communications will follow', hint: 'Moving a candidate from "screening" to "interviewing" will trigger the agent to draft and queue interview invitation emails. Confirm the candidate is ready for contact.', level: 'critical' as const },
    { label: 'Source credibility', hint: 'Check the source field. "LinkedIn" and "Referral" are higher-signal than "Cold outreach". A 95% match from cold outreach warrants more scrutiny than a referral at 80%.', level: 'caution' as const },
    { label: 'Offer stage requires legal/HR sign-off', hint: 'Never advance a candidate to "offer_sent" without an approved offer letter and HR sign-off on compensation. The agent will draft offer communications automatically.', level: 'critical' as const },
    { label: 'Open requisitions vs active candidates', hint: 'Check that the number of candidates in "interviewing" and "offer_sent" stages does not exceed the headcount approved for each requisition.', level: 'caution' as const },
    { label: 'Rejected candidates receive notifications', hint: 'Rejecting a candidate triggers the agent to draft and queue a rejection email. Review your rejection email template before using bulk reject.', level: 'caution' as const },
];

type CandidateStatus = 'sourced' | 'screened' | 'interviewing' | 'offer_sent' | 'hired' | 'rejected';

type Candidate = {
    id: string;
    name: string;
    role: string;
    source: string;
    status: CandidateStatus;
    matchScore: number;
    appliedAt: string;
};

type JobRequisition = {
    id: string;
    title: string;
    department: string;
    status: 'open' | 'on_hold' | 'filled' | 'cancelled';
    candidateCount: number;
    openedAt: string;
};

const API_BASE = '';

const STATUS_STYLE: Record<CandidateStatus, { bg: string; color: string; icon: React.ElementType }> = {
    sourced:      { bg: 'var(--bg)', color: 'var(--ink-muted)', icon: Users },
    screened:     { bg: 'var(--info-bg)', color: 'var(--info)', icon: Clock },
    interviewing: { bg: 'var(--warn-bg)', color: 'var(--warn)', icon: Clock },
    offer_sent:   { bg: '#fdf4ff', color: 'var(--accent)', icon: Briefcase },
    hired:        { bg: 'var(--ok-bg)', color: 'var(--ok)', icon: CheckCircle2 },
    rejected:     { bg: 'var(--danger-bg)', color: 'var(--danger)', icon: XCircle },
};

const JOB_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
    open:      { bg: 'var(--ok-bg)', color: 'var(--ok)' },
    on_hold:   { bg: 'var(--warn-bg)', color: 'var(--warn)' },
    filled:    { bg: 'var(--info-bg)', color: 'var(--info)' },
    cancelled: { bg: 'var(--danger-bg)', color: 'var(--danger)' },
};

const th: React.CSSProperties = { padding: '8px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-muted)', background: 'var(--bg)', textAlign: 'left' as const };
const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--ink-soft)', verticalAlign: 'middle' };

export default function TalentPipelinePanel({ workspaceId }: { workspaceId: string }) {
    const [view, setView] = useState<'candidates' | 'requisitions'>('candidates');
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [requisitions, setRequisitions] = useState<JobRequisition[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ workspace_id: workspaceId });
            if (view === 'candidates') {
                const res = await fetch(`${API_BASE}/api/talent-pipeline/candidates?${params.toString()}`);
                const data = await res.json().catch(() => ({}));
                setCandidates(Array.isArray(data) ? data : (data.candidates ?? []));
            } else {
                const res = await fetch(`${API_BASE}/api/talent-pipeline/requisitions?${params.toString()}`);
                const data = await res.json().catch(() => ({}));
                setRequisitions(Array.isArray(data) ? data : (data.requisitions ?? []));
            }
        } catch {
            setCandidates([]); setRequisitions([]);
        } finally {
            setLoading(false);
        }
    }, [workspaceId, view]);

    useEffect(() => { load(); }, [load]);

    const advance = async (id: string) => {
        await fetch(`${API_BASE}/api/talent-pipeline/candidates/${id}/advance`, { method: 'POST' }).catch(() => null);
        await load();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <OperatorGuide
                title="Talent Pipeline — Operator Review Guide"
                intro="The Recruiter agent sources and advances candidates. Stage changes trigger real communications to real people — review carefully before each action."
                items={TALENT_GUIDE_ITEMS}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['candidates', 'requisitions'] as const).map(v => (
                        <button key={v} type="button" onClick={() => setView(v)} style={{ padding: '5px 14px', border: `1px solid ${view === v ? 'var(--accent)' : 'var(--bg)'}`, borderRadius: 20, background: view === v ? 'rgba(0,102,204,0.07)' : 'var(--card)', color: view === v ? 'var(--accent)' : '#64748b', fontSize: 12, fontWeight: view === v ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize' }}>
                            {v}
                        </button>
                    ))}
                </div>
                <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', fontSize: 12, color: 'var(--ink-muted)', cursor: 'pointer' }}><RefreshCw size={12} />Refresh</button>
            </div>
            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-muted)', fontSize: 13 }}>Loading…</div>
            ) : view === 'candidates' ? (
                candidates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
                        <Users size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontSize: 14 }}>No candidates in the pipeline yet.</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12 }}>Your recruiter agent will populate shortlists here.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Name', 'Role', 'Source', 'Match', 'Status', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {candidates.map((c, i) => {
                                    const st = STATUS_STYLE[c.status];
                                    const StIcon = st.icon;
                                    return (
                                        <tr key={c.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : 'var(--card)' }}>
                                            <td style={{ ...td, fontWeight: 500 }}>{c.name}</td>
                                            <td style={td}>{c.role}</td>
                                            <td style={{ ...td, color: 'var(--ink-muted)', fontSize: 12 }}>{c.source}</td>
                                            <td style={td}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <div style={{ width: 48, height: 5, borderRadius: 3, background: 'var(--line)', overflow: 'hidden' }}>
                                                        <div style={{ width: `${c.matchScore}%`, height: '100%', background: c.matchScore >= 80 ? 'var(--ok)' : c.matchScore >= 60 ? 'var(--warn)' : 'var(--danger)', borderRadius: 3 }} />
                                                    </div>
                                                    <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{c.matchScore}%</span>
                                                </div>
                                            </td>
                                            <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}><StIcon size={10} />{c.status.replace('_', ' ')}</span></td>
                                            <td style={td}>
                                                {!['hired', 'rejected'].includes(c.status) && <button type="button" onClick={() => advance(c.id)} style={{ padding: '4px 10px', border: '1px solid var(--info-border)', borderRadius: 6, background: 'var(--info-bg)', cursor: 'pointer', fontSize: 11, color: 'var(--info)', fontWeight: 600 }}>Advance</button>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            ) : (
                requisitions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-muted)' }}>
                        <Briefcase size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontSize: 14 }}>No open requisitions.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr>{['Title', 'Department', 'Candidates', 'Status', 'Opened'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {requisitions.map((r, i) => {
                                    const st = JOB_STATUS_STYLE[r.status] ?? JOB_STATUS_STYLE.open;
                                    return (
                                        <tr key={r.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', background: i % 2 === 1 ? '#fafafa' : 'var(--card)' }}>
                                            <td style={{ ...td, fontWeight: 500 }}>{r.title}</td>
                                            <td style={{ ...td, color: 'var(--ink-muted)' }}>{r.department}</td>
                                            <td style={{ ...td, color: 'var(--ink-muted)' }}>{r.candidateCount}</td>
                                            <td style={td}><span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 20, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}>{r.status.replace('_', ' ')}</span></td>
                                            <td style={{ ...td, color: 'var(--ink-muted)', fontSize: 12 }}>{new Date(r.openedAt).toLocaleDateString()}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            )}
        </div>
    );
}
