'use client';

/**
 * Hybrid Command Center overview — the /command-center-preview design wired to
 * LIVE data. Rendered inside the real page.tsx overview tab (under the existing
 * topbar), so it carries no masthead of its own — just the overview sections
 * (KPIs, system health, pending approvals, tenant/workspace, activity ledger).
 */

import Link from 'next/link';
import { Clock, ExternalLink } from 'lucide-react';
import { UiKit, Panel, Button, Badge, Eyebrow, Display, Stat } from './ui-kit';

export type CcKpi = { label: string; value: string; trend: string; delta: string; deltaTone: string; status: string; statusTone: string };
export type CcApproval = { approval_id: string; action_summary: string; risk_level: 'low' | 'medium' | 'high'; requested_at: string; bot_id: string };
export type CcEvent = { event_id: string; event_type: string; summary: string; severity: string; source_system: string; created_at: string };

type Props = {
    stats: { onShift: number; tasksLive: number; approvals: number };
    kpis: CcKpi[];
    health: { workspaces: number; approvals: number; connectors: number };
    approvals: CcApproval[];
    summary: { tenant_name: string; plan_name: string; tenant_status: string; pending_approvals: number; total_workspaces: number };
    workspace: { workspace_name: string; role_type: string; workspace_status: string; bot_status: string; runtime_tier: string; latest_incident_level: string };
    estimatedCost: number;
    events: CcEvent[];
    source: 'live' | 'fallback';
};

const toneVar = (t: string) => (t === 'low' || t === 'ok' ? 'var(--ok)' : t === 'high' || t === 'danger' || t === 'critical' ? 'var(--danger)' : t === 'neutral' ? 'var(--ink-muted)' : 'var(--warn)');
const healthTone = (v: number) => (v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--danger)');
const okStatus = (s: string) => ['active', 'ready', 'healthy', 'ok', 'live'].includes((s ?? '').toLowerCase());
const riskTone = (r: string): 'ok' | 'warn' | 'err' => (r === 'low' ? 'ok' : r === 'high' ? 'err' : 'warn');
const sevTone = (s: string): 'ok' | 'warn' | 'err' => (s === 'high' || s === 'critical' ? 'err' : s === 'medium' || s === 'warn' ? 'warn' : 'ok');
const ago = (iso: string) => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};
const hhmmss = (iso: string) => { try { return new Date(iso).toLocaleTimeString('en-GB', { hour12: false }); } catch { return iso.slice(11, 19); } };

function Kv({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
            <span style={{ color: 'var(--ink-muted)' }}>{k}</span>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{children}</span>
        </div>
    );
}

export default function CommandCenterOverview(p: Props) {
    const allHealthy = p.health.workspaces >= 75 && p.health.approvals >= 75 && p.health.connectors >= 75;
    return (
        <UiKit style={{ background: 'var(--bg)' }}>
            <div style={{ display: 'grid', gap: 26 }}>
                {/* Stat strip */}
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Stat n={String(p.stats.onShift).padStart(2, '0')} k="Bots on shift" tone="ok" />
                    <Stat n={String(p.stats.tasksLive).padStart(2, '0')} k="Workspaces" tone="accent" />
                    <Stat n={String(p.stats.approvals).padStart(2, '0')} k="Approvals waiting" tone={p.stats.approvals > 0 ? 'warn' : 'ok'} />
                    <span className="uk-mono" style={{ marginLeft: 'auto', fontSize: 11, color: p.source === 'live' ? 'var(--ok)' : 'var(--warn)' }}>
                        ● {p.source === 'live' ? 'Live sync' : 'Fallback mode'}
                    </span>
                </div>

                {/* KPI cards */}
                <section>
                    <Eyebrow style={{ marginBottom: 12 }}>Key metrics</Eyebrow>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
                        {p.kpis.map((k) => (
                            <div key={k.label} className="uk-panel" style={{ padding: 16 }}>
                                <Eyebrow style={{ marginBottom: 8 }}>{k.label}</Eyebrow>
                                <Display size={24} style={{ marginBottom: 8 }}>{k.value}</Display>
                                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginBottom: 8 }}>{k.trend}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    <span className="uk-mono" style={{ fontSize: 10, color: toneVar(k.deltaTone) }}>{k.delta}</span>
                                    <span className="uk-mono" style={{ fontSize: 10, color: toneVar(k.statusTone), marginLeft: 'auto' }}>{k.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Health + approvals */}
                <section style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
                    <Panel title="System health" action={<Badge tone={allHealthy ? 'ok' : 'warn'}>{allHealthy ? 'All healthy' : 'Review'}</Badge>}>
                        <div style={{ display: 'grid', gap: 16 }}>
                            {([['Workspaces', p.health.workspaces], ['Approvals', p.health.approvals], ['Connectors', p.health.connectors]] as const).map(([label, v]) => (
                                <div key={label} style={{ display: 'grid', gap: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <span className="uk-eyebrow">{label}</span>
                                        <span className="uk-mono" style={{ fontSize: 13, fontWeight: 600, color: healthTone(v) }}>{v}%</span>
                                    </div>
                                    <div style={{ height: 4, background: 'var(--bg-deep)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${v}%`, background: healthTone(v), transition: 'width 0.7s ease' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Panel>

                    <Panel title="Pending approvals" action={<Link href="/?tab=approvals" className="uk-eyebrow" style={{ textDecoration: 'none', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Queue <ExternalLink size={10} /></Link>}>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {p.approvals.slice(0, 4).map((a) => (
                                <div key={a.approval_id} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                                    <Clock size={15} color="var(--warn)" style={{ flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.action_summary}</div>
                                        <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 2 }}>{a.bot_id.slice(-8)} · {ago(a.requested_at)} ago</div>
                                    </div>
                                    <Badge tone={riskTone(a.risk_level)}>{a.risk_level}</Badge>
                                </div>
                            ))}
                            {p.approvals.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Queue is clear — nothing waiting.</div>}
                        </div>
                    </Panel>
                </section>

                {/* Tenant + workspace */}
                <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Panel title="Tenant summary">
                        <Kv k="Tenant">{p.summary.tenant_name}</Kv>
                        <Kv k="Plan">{p.summary.plan_name}</Kv>
                        <Kv k="Status"><Badge tone={okStatus(p.summary.tenant_status) ? 'ok' : 'warn'}>{p.summary.tenant_status}</Badge></Kv>
                        <Kv k="Pending approvals">{p.summary.pending_approvals}</Kv>
                        <Kv k="Workspaces">{p.summary.total_workspaces}</Kv>
                        <Kv k="Est. monthly cost"><span className="uk-mono">${p.estimatedCost.toFixed(1)}</span></Kv>
                    </Panel>
                    <Panel title="Workspace & bot">
                        <Kv k="Workspace">{p.workspace.workspace_name}</Kv>
                        <Kv k="Role">{p.workspace.role_type}</Kv>
                        <Kv k="Workspace status"><Badge tone={okStatus(p.workspace.workspace_status) ? 'ok' : 'warn'}>{p.workspace.workspace_status}</Badge></Kv>
                        <Kv k="Bot status"><Badge tone={p.workspace.bot_status === 'active' ? 'accent' : 'warn'}>{p.workspace.bot_status}</Badge></Kv>
                        <Kv k="Runtime tier">{p.workspace.runtime_tier}</Kv>
                        <Kv k="Latest incident">{p.workspace.latest_incident_level}</Kv>
                    </Panel>
                </section>

                {/* Activity ledger */}
                <section>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Display size={20}>Activity ledger</Display>
                        <Eyebrow>{String(p.events.length).padStart(2, '0')} recent events</Eyebrow>
                    </div>
                    <table className="uk-ledger">
                        <thead><tr><th>Timestamp</th><th>Event</th><th>Source</th><th>Severity</th></tr></thead>
                        <tbody>
                            {p.events.slice(0, 8).map((e) => (
                                <tr key={e.event_id}>
                                    <td className="uk-num">{hhmmss(e.created_at)}</td>
                                    <td>{e.summary || e.event_type}</td>
                                    <td className="uk-num">{e.source_system}</td>
                                    <td><Badge tone={sevTone(e.severity)}>{e.severity}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            </div>
        </UiKit>
    );
}
