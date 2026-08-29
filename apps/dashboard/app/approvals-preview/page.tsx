'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
    Search, Check, X, FileDiff, Clock, ShieldAlert, ExternalLink, ChevronDown,
} from 'lucide-react';
import { UiKit, Masthead, Panel, Button, Badge, Input, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

type Risk = 'low' | 'medium' | 'high';
type Item = {
    id: string; action: string; connector: string; risk: Risk; requester: string;
    workspace: string; age: string; summary: string; diff: string[]; evidence: string;
};

const QUEUE: Item[] = [
    { id: 'AP-4821', action: 'connector_execute', connector: 'jira · create issue', risk: 'medium', requester: 'developer', workspace: 'Primary Dev', age: '2m', summary: 'Create issue PROJ-1043 “Fix flaky auth test” in project PROJ.', diff: ['+ project: PROJ', '+ summary: Fix flaky auth test', '+ type: Bug', '+ priority: High'], evidence: 'task 98f2a1 · llm decision + policy pass' },
    { id: 'AP-4820', action: 'send_outreach', connector: 'gmail · 12 recipients', risk: 'high', requester: 'sales-agent', workspace: 'Primary Dev', age: '9m', summary: 'Send Q3 renewal outreach to 12 enterprise contacts.', diff: ['+ to: 12 recipients (enterprise)', '+ template: renewal-q3', '+ personalization: on', '! external send · irreversible'], evidence: 'task 77c1b8 · classified high · gated' },
    { id: 'AP-4818', action: 'mcp_tool_call', connector: 'filesystem · write', risk: 'medium', requester: 'developer', workspace: 'Staging', age: '14m', summary: 'Write generated migration to db/migrations/0042_add_index.sql.', diff: ['+ path: db/migrations/0042_add_index.sql', '+ 34 lines', '+ reversible: yes'], evidence: 'task 51aa02 · capability allowlist ok' },
    { id: 'AP-4815', action: 'connector_execute', connector: 'slack · post message', risk: 'low', requester: 'support-exec', workspace: 'Primary Dev', age: '21m', summary: 'Post incident status update to #customers.', diff: ['+ channel: #customers', '+ status: monitoring', '+ auto-generated summary'], evidence: 'task 41c9d0 · low risk' },
    { id: 'AP-4812', action: 'deploy_action', connector: 'azure · restart vm', risk: 'high', requester: 'devops', workspace: 'Production', age: '33m', summary: 'Restart provisioning VM af-vm-07 (unresponsive health checks).', diff: ['+ resource: af-vm-07', '+ action: restart', '! production · service impact'], evidence: 'task 22b7e1 · classified high · gated' },
];

const RISK_TONE: Record<Risk, 'ok' | 'warn' | 'err'> = { low: 'ok', medium: 'warn', high: 'err' };

export default function ApprovalsPreview() {
    const [risk, setRisk] = useState<'all' | Risk>('all');
    const [q, setQ] = useState('');
    const [selectedId, setSelectedId] = useState(QUEUE[0].id);
    const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({});

    const filtered = useMemo(
        () => QUEUE.filter((i) => (risk === 'all' || i.risk === risk) && (q === '' || (i.action + i.connector + i.requester).toLowerCase().includes(q.toLowerCase()))),
        [risk, q],
    );
    const selected = QUEUE.find((i) => i.id === selectedId) ?? filtered[0] ?? QUEUE[0];
    const pending = QUEUE.filter((i) => !decided[i.id]).length;

    const decide = (id: string, d: 'approved' | 'rejected') => setDecided((m) => ({ ...m, [id]: d }));

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Governance — Approval Queue"
                title="Approvals"
                actions={<>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Command center</Link>
                    <WfThemeToggle />
                    <Button variant="primary" size="sm"><Check size={13} /> Bulk approve low-risk</Button>
                </>}
                stats={<>
                    <Stat n={String(pending).padStart(2, '0')} k="Pending" tone="warn" />
                    <Stat n="27" k="Approved today" tone="ok" />
                    <Stat n="1.4s" k="Avg decision" tone="accent" />
                </>}
            />

            {/* Filter bar */}
            <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: '0 1 280px' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                    <Input placeholder="Search action, connector, requester…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['all', 'low', 'medium', 'high'] as const).map((r) => (
                        <button key={r} onClick={() => setRisk(r)} className="uk-eyebrow"
                            style={{ padding: '6px 11px', border: '1px solid var(--line)', borderRadius: 3, cursor: 'pointer',
                                background: risk === r ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                                color: risk === r ? 'var(--accent)' : 'var(--ink-muted)', borderColor: risk === r ? 'var(--accent)' : 'var(--line)' }}>
                            {r}
                        </button>
                    ))}
                </div>
                <span className="uk-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>{filtered.length} in queue</span>
            </div>

            {/* Queue + detail */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 0, minHeight: 0 }}>
                {/* Left — queue list */}
                <div style={{ borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
                    {filtered.map((i) => {
                        const isSel = i.id === selected.id;
                        const d = decided[i.id];
                        return (
                            <button key={i.id} onClick={() => setSelectedId(i.id)}
                                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 24px', background: isSel ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent', border: 'none', borderBottom: '1px solid var(--line)', borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
                                <Clock size={15} color={d ? 'var(--ink-muted)' : 'var(--warn)'} style={{ marginTop: 2, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                        <span className="uk-mono" style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{i.action}</span>
                                        <Badge tone={RISK_TONE[i.risk]}>{i.risk}</Badge>
                                        {d && <Badge tone={d === 'approved' ? 'ok' : 'err'}>{d}</Badge>}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.connector}</div>
                                    <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 3 }}>{i.id} · {i.requester} · {i.workspace} · {i.age} ago</div>
                                </div>
                            </button>
                        );
                    })}
                    {filtered.length === 0 && <div style={{ padding: 28, color: 'var(--ink-muted)', fontSize: 13 }}>No approvals match this filter.</div>}
                </div>

                {/* Right — detail */}
                <div style={{ overflowY: 'auto', padding: 24 }}>
                    <Eyebrow style={{ marginBottom: 8 }}>{selected.id} · requested {selected.age} ago</Eyebrow>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <Display size={22}>{selected.action}</Display>
                        <Badge tone={RISK_TONE[selected.risk]}>{selected.risk} risk</Badge>
                    </div>
                    <div className="uk-mono" style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 16 }}>{selected.connector} · by {selected.requester} · {selected.workspace}</div>

                    <p style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 18 }}>{selected.summary}</p>

                    <Panel title="Proposed change" style={{ marginBottom: 16 }}>
                        <pre className="uk-mono" style={{ margin: 0, fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                            {selected.diff.map((line, k) => (
                                <div key={k} style={{ color: line.startsWith('!') ? 'var(--danger)' : line.startsWith('+') ? 'var(--ok)' : 'var(--ink-soft)' }}>{line}</div>
                            ))}
                        </pre>
                    </Panel>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-muted)', marginBottom: 20 }}>
                        <ShieldAlert size={13} color="var(--accent)" />
                        <span className="uk-mono">evidence › {selected.evidence}</span>
                        <Link href="#" className="uk-eyebrow" style={{ textDecoration: 'none', marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Bundle <ExternalLink size={10} /></Link>
                    </div>

                    {decided[selected.id] ? (
                        <div className="uk-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: `2px solid ${decided[selected.id] === 'approved' ? 'var(--ok)' : 'var(--danger)'}` }}>
                            {decided[selected.id] === 'approved' ? <Check size={16} color="var(--ok)" /> : <X size={16} color="var(--danger)" />}
                            <span style={{ fontSize: 13, fontWeight: 600, color: decided[selected.id] === 'approved' ? 'var(--ok)' : 'var(--danger)' }}>
                                {decided[selected.id] === 'approved' ? 'Approved — executing via connector' : 'Rejected — agent notified'}
                            </span>
                            <button onClick={() => setDecided((m) => { const n = { ...m }; delete n[selected.id]; return n; })} className="uk-eyebrow" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>undo</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: 10 }}>
                            <Button variant="primary" onClick={() => decide(selected.id, 'approved')} style={{ flex: 1, justifyContent: 'center' }}><Check size={14} /> Approve</Button>
                            <Button variant="danger" onClick={() => decide(selected.id, 'rejected')}><X size={14} /> Reject</Button>
                            <Button variant="ghost"><FileDiff size={14} /> Review diff</Button>
                        </div>
                    )}
                </div>
            </div>
        </UiKit>
    );
}
