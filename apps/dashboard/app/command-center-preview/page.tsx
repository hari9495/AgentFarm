'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ArrowUpRight, ArrowDownRight, Plus, RefreshCw, ChevronDown,
    CheckCircle2, Clock, ShieldCheck, ExternalLink,
} from 'lucide-react';
import { UiKit, Masthead, Panel, Button, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';
import { StatCard } from '@/components/21st/stat-card';

// ── Mock data (mirrors the real /page.tsx overview shape) ────────────────────
const summary = {
    tenant_name: 'Acme Corp', plan_name: 'Enterprise', tenant_status: 'active',
    pending_approvals: 3, total_workspaces: 4, estimated_cost: 486.2,
};
const workspace = {
    workspace_name: 'Primary Dev', role_type: 'admin', workspace_status: 'healthy',
    bot_status: 'on shift', runtime_tier: 'Max', latest_incident_level: 'none',
};
const health = [
    { label: 'Workspaces', value: 100 },
    { label: 'Approvals', value: 92 },
    { label: 'Connectors', value: 75 },
];
const approvals = [
    { id: 'AP-4821', action: 'connector_execute · jira — create issue', risk: 'medium', age: '2m' },
    { id: 'AP-4820', action: 'send_outreach · gmail — 12 recipients', risk: 'high', age: '9m' },
    { id: 'AP-4818', action: 'mcp_tool_call · filesystem.write', risk: 'medium', age: '14m' },
];
const ledger = [
    { t: '18:04:12', a: 'connector_execute · jira', u: 'maya.r', s: 'ok' as const, l: 'done' },
    { t: '18:03:47', a: 'approval_decision · approved', u: 'system', s: 'ok' as const, l: 'ok' },
    { t: '18:02:09', a: 'task_dispatch · runtime', u: 'ci.bot', s: 'err' as const, l: 'failed' },
    { t: '18:01:55', a: 'memory_write · episodic', u: 'recruiter', s: 'ok' as const, l: 'done' },
    { t: '18:00:30', a: 'connector_execute · slack', u: 'maya.r', s: 'warn' as const, l: 'retried' },
    { t: '17:59:12', a: 'billing_sweep · daily', u: 'system', s: 'ok' as const, l: 'ok' },
];
const tone = (v: number) => (v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--danger)');

function Kv({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
            <span style={{ color: 'var(--ink-muted)' }}>{k}</span>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{children}</span>
        </div>
    );
}

export default function CommandCenterPreview() {
    const [ws, setWs] = useState('Primary Dev');
    const allHealthy = health.every((h) => h.value >= 75);

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Masthead
                eyebrow="Company Dashboard — Operations"
                title="Command Center"
                actions={<>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', alignSelf: 'center' }}>
                        <select value={ws} onChange={(e) => setWs(e.target.value)} className="uk-mono"
                            style={{ padding: '6px 26px 6px 10px', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 11, appearance: 'none', cursor: 'pointer', outline: 'none' }}>
                            <option>Primary Dev</option><option>Staging</option><option>Production</option>
                        </select>
                        <ChevronDown size={11} style={{ position: 'absolute', right: 9, pointerEvents: 'none', color: 'var(--ink-muted)' }} />
                    </div>
                    <WfThemeToggle />
                    <Button variant="ghost" size="sm"><RefreshCw size={12} /></Button>
                    <Button variant="primary" size="sm"><Plus size={13} /> New task</Button>
                </>}
                stats={<>
                    <Stat n="08" k="On shift" tone="ok" />
                    <Stat n="14" k="Tasks live" tone="accent" />
                    <Stat n="03" k="Approvals" tone="warn" />
                </>}
            />

            <div style={{ padding: 28, maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 26 }}>
                {/* KPI row — 21st animated cards, editorial skin */}
                <section>
                    <Eyebrow style={{ marginBottom: 12 }}>Today — live figures</Eyebrow>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 14 }}>
                        <StatCard className="!rounded-[3px] !shadow-none" title="Tasks completed" value={1204} change={12} changeDescription="yesterday" suffix="" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                        <StatCard className="!rounded-[3px] !shadow-none" title="Approval rate" value={94} change={3} changeDescription="last week" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                        <StatCard className="!rounded-[3px] !shadow-none" title="Latency drop" value={18} change={-8} changeDescription="last week" icon={<ArrowDownRight className="h-4 w-4 text-red-600 dark:text-red-400" />} />
                        <StatCard className="!rounded-[3px] !shadow-none" title="Active agents" value={12} change={2} changeDescription="last month" suffix="" icon={<ArrowUpRight className="h-4 w-4 text-green-600 dark:text-green-400" />} />
                    </div>
                </section>

                {/* System health + pending approvals */}
                <section style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
                    <Panel title="System health" action={<Badge tone={allHealthy ? 'ok' : 'warn'}>{allHealthy ? 'All healthy' : 'Review'}</Badge>}>
                        <div style={{ display: 'grid', gap: 16 }}>
                            {health.map((h) => (
                                <div key={h.label} style={{ display: 'grid', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span className="uk-eyebrow">{h.label}</span>
                                        <span className="uk-mono" style={{ fontSize: 13, fontWeight: 600, color: tone(h.value) }}>{h.value}%</span>
                                    </div>
                                    <div style={{ height: 4, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${h.value}%`, background: tone(h.value), transition: 'width 0.7s ease' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>

                    <Panel title="Pending approvals" action={<Link href="/design-system" className="uk-eyebrow" style={{ textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Queue <ExternalLink size={10} /></Link>}>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {approvals.map((a) => (
                                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                                    <Clock size={15} color="var(--warn)" style={{ flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.action}</div>
                                        <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 2 }}>{a.id} · {a.age} ago</div>
                                    </div>
                                    <Badge tone={a.risk === 'high' ? 'err' : 'warn'}>{a.risk}</Badge>
                                    <Button variant="primary" size="sm">Approve</Button>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </section>

                {/* Tenant + workspace */}
                <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Panel title="Tenant summary">
                        <Kv k="Tenant">{summary.tenant_name}</Kv>
                        <Kv k="Plan">{summary.plan_name}</Kv>
                        <Kv k="Status"><Badge tone="ok">{summary.tenant_status}</Badge></Kv>
                        <Kv k="Pending approvals">{summary.pending_approvals}</Kv>
                        <Kv k="Workspaces">{summary.total_workspaces}</Kv>
                        <Kv k="Est. monthly cost"><span className="uk-mono">${summary.estimated_cost.toFixed(1)}</span></Kv>
                    </Panel>
                    <Panel title="Workspace & bot">
                        <Kv k="Workspace">{workspace.workspace_name}</Kv>
                        <Kv k="Role">{workspace.role_type}</Kv>
                        <Kv k="Workspace status"><Badge tone="ok">{workspace.workspace_status}</Badge></Kv>
                        <Kv k="Bot status"><Badge tone="accent">{workspace.bot_status}</Badge></Kv>
                        <Kv k="Runtime tier">{workspace.runtime_tier}</Kv>
                        <Kv k="Latest incident">{workspace.latest_incident_level}</Kv>
                    </Panel>
                </section>

                {/* Activity ledger */}
                <section>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Display size={20}>Activity ledger</Display>
                        <Eyebrow>{String(ledger.length).padStart(2, '0')} recent events</Eyebrow>
                    </div>
                    <table className="uk-ledger">
                        <thead><tr><th>Timestamp</th><th>Action</th><th>Actor</th><th>Status</th></tr></thead>
                        <tbody>
                            {ledger.map((r) => (
                                <tr key={r.t}>
                                    <td className="uk-num">{r.t}</td>
                                    <td>{r.a}</td>
                                    <td className="uk-num">{r.u}</td>
                                    <td><Badge tone={r.s}>{r.l}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                <footer style={{ display: 'flex', gap: 14, alignItems: 'center', paddingTop: 8, color: 'var(--ink-muted)' }}>
                    <ShieldCheck size={13} />
                    <span style={{ fontSize: 12 }}>Preview with mock data · live wiring pending full-stack run</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                        <Link href="/design-hybrid" className="uk-eyebrow" style={{ textDecoration: 'none' }}>Hybrid ref</Link>
                        <Link href="/design-system" className="uk-eyebrow" style={{ textDecoration: 'none' }}>Design system</Link>
                    </span>
                </footer>
            </div>
        </UiKit>
    );
}
