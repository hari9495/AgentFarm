'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Pause, MessageSquare, Settings, Brain, Plug, ShieldCheck, Zap,
} from 'lucide-react';
import { UiKit, Panel, Button, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

const activity = [
    { t: '18:04:12', action: 'screen_candidate · Jordan Lee', status: 'ok' as const, label: 'done' },
    { t: '17:41:09', action: 'send_outreach · gmail (8)', status: 'warn' as const, label: 'gated' },
    { t: '17:22:55', action: 'schedule_interview · calendar', status: 'ok' as const, label: 'done' },
    { t: '16:58:30', action: 'draft_jd · Staff Engineer', status: 'ok' as const, label: 'done' },
    { t: '16:30:14', action: 'rank_applicants · greenhouse', status: 'ok' as const, label: 'done' },
    { t: '15:52:41', action: 'send_offer · Jordan Lee', status: 'err' as const, label: 'awaiting approval' },
];
const capabilities = [
    { name: 'Gmail', kind: 'connector' }, { name: 'Greenhouse', kind: 'connector' },
    { name: 'Calendar', kind: 'connector' }, { name: 'Slack', kind: 'connector' },
    { name: 'screen', kind: 'action' }, { name: 'outreach', kind: 'action' },
    { name: 'schedule', kind: 'action' }, { name: 'offer', kind: 'action' },
];

export default function AgentDetailPreview() {
    const [tab, setTab] = useState<'activity' | 'capabilities'>('activity');

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <header style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)', padding: '16px 28px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none' }}>← Workforce</Link>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <WfThemeToggle />
                        <Button variant="ghost" size="sm"><MessageSquare size={12} /> Message</Button>
                        <Button variant="ghost" size="sm"><Pause size={12} /> Pause shift</Button>
                        <Button variant="ghost" size="sm"><Settings size={12} /></Button>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        {/* square monogram */}
                        <div style={{ width: 64, height: 64, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', flexShrink: 0 }}>
                            <span className="uk-mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--accent)', letterSpacing: '0.02em' }}>RC</span>
                        </div>
                        <div>
                            <Eyebrow style={{ marginBottom: 5 }}>Talent Acquisition · Digital Employee · #AG-RC-0007</Eyebrow>
                            <Display size={34}>Recruiter</Display>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ok)', fontWeight: 600 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} /> On shift
                        </span>
                    </div>
                </div>
            </header>

            {/* Stat row */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 40, flexWrap: 'wrap' }}>
                <Stat n="342" k="Tasks completed" tone="accent" />
                <Stat n="94%" k="Success rate" tone="ok" />
                <Stat n="1.2s" k="Avg decision" />
                <Stat n="$148" k="Cost this month" tone="muted" />
                <Stat n="47" k="Lessons learned" tone="accent" />
            </div>

            <div style={{ padding: 28, maxWidth: 1120, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20, alignItems: 'start' }}>
                {/* Left — activity / capabilities tabs */}
                <div>
                    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--line)', marginBottom: 16 }}>
                        {([['activity', 'Recent activity'], ['capabilities', 'Capabilities']] as const).map(([k, label]) => (
                            <button key={k} onClick={() => setTab(k)} className="uk-eyebrow"
                                style={{ padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: `2px solid ${tab === k ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', color: tab === k ? 'var(--accent)' : 'var(--ink-muted)', marginBottom: -1 }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {tab === 'activity' && (
                        <table className="uk-ledger">
                            <thead><tr><th>Timestamp</th><th>Action</th><th>Status</th></tr></thead>
                            <tbody>
                                {activity.map((a) => (
                                    <tr key={a.t}>
                                        <td className="uk-num">{a.t}</td>
                                        <td>{a.action}</td>
                                        <td><Badge tone={a.status}>{a.label}</Badge></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {tab === 'capabilities' && (
                        <div style={{ display: 'grid', gap: 20 }}>
                            <div>
                                <Eyebrow style={{ marginBottom: 10 }}>Connectors</Eyebrow>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {capabilities.filter((c) => c.kind === 'connector').map((c) => (
                                        <span key={c.name} className="uk-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 12 }}>
                                            <Plug size={12} color="var(--accent)" /> {c.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <Eyebrow style={{ marginBottom: 10 }}>Actions it owns</Eyebrow>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {capabilities.filter((c) => c.kind === 'action').map((c) => (
                                        <span key={c.name} className="uk-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', border: '1px solid var(--line)', borderRadius: 3, fontSize: 12 }}>
                                            <Zap size={12} color="var(--ok)" /> {c.name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right — persona / config */}
                <div style={{ display: 'grid', gap: 20 }}>
                    <Panel title="Persona & model">
                        {[['Model', 'claude-opus'], ['Tone', 'Professional, concise'], ['Onboarded', 'Jul 2026'], ['Escalation', 'Human on high-risk']].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
                                <span style={{ color: 'var(--ink-muted)' }}>{k}</span>
                                <span className="uk-mono" style={{ color: 'var(--ink)' }}>{v}</span>
                            </div>
                        ))}
                    </Panel>

                    <Panel title="Learning" action={<Badge tone="accent"><Brain size={11} /> RAG on</Badge>}>
                        <p style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, margin: 0 }}>
                            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>47 lessons</span> learned from approved and rejected work — applied automatically to future tasks. Last reinforced 2h ago.
                        </p>
                    </Panel>

                    <div className="uk-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: '2px solid var(--accent)' }}>
                        <ShieldCheck size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>All high-risk actions route to the approval queue before execution.</span>
                    </div>
                </div>
            </div>
        </UiKit>
    );
}
