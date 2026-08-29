'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ShieldAlert, Power, Zap, ScrollText, RotateCcw, Eye, FileCheck2,
} from 'lucide-react';
import { UiKit, Masthead, Panel, Button, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

const breakers = [
    { name: 'jira', state: 'closed', tone: 'ok' as const, note: 'healthy · 0 failures' },
    { name: 'gmail', state: 'closed', tone: 'ok' as const, note: 'healthy · 0 failures' },
    { name: 'github', state: 'closed', tone: 'ok' as const, note: 'healthy · 0 failures' },
    { name: 'azure_arm', state: 'half-open', tone: 'warn' as const, note: 'recovering · 2 recent failures' },
];
const policies = [
    { name: 'Role RBAC', detail: '14 roles · verb-level', tone: 'ok' as const },
    { name: 'Connector guardrails', detail: '8 rules active', tone: 'ok' as const },
    { name: 'MCP allowlist', detail: '12 tools permitted', tone: 'ok' as const },
    { name: 'Budget limits', detail: 'daily + monthly caps', tone: 'ok' as const },
    { name: 'Data retention', detail: '90-day TTL', tone: 'ok' as const },
];
const violations = [
    { t: '2026-08-27', rule: 'budget · daily 90% throttle', workspace: 'Production', tone: 'warn' as const, label: 'throttled' },
    { t: '2026-08-24', rule: 'connector · scope denied (slack:admin)', workspace: 'Staging', tone: 'err' as const, label: 'blocked' },
];

export default function GovernancePreview() {
    const [killed, setKilled] = useState(false);

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Governance — Control & Compliance"
                title="Governance"
                actions={<>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Command center</Link>
                    <WfThemeToggle />
                    <Button variant="ghost" size="sm"><FileCheck2 size={12} /> Export compliance</Button>
                </>}
                stats={<>
                    <Stat n="94%" k="Approval rate" tone="ok" />
                    <Stat n="14" k="Policies active" tone="accent" />
                    <Stat n="02" k="Violations 30d" tone="warn" />
                </>}
            />

            <div style={{ padding: 28, maxWidth: 1120, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
                {/* Kill switch — prominent control */}
                <div style={{ gridColumn: '1 / -1' }}>
                    <div className="uk-panel" style={{ padding: 0, overflow: 'hidden', borderColor: killed ? 'var(--danger)' : 'var(--line)' }}>
                        <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 18, background: killed ? 'color-mix(in srgb, var(--danger) 8%, transparent)' : 'transparent' }}>
                            <div style={{ width: 52, height: 52, border: `1px solid ${killed ? 'var(--danger)' : 'var(--ok)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Power size={22} color={killed ? 'var(--danger)' : 'var(--ok)'} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                                    <Display size={18}>Kill switch</Display>
                                    <Badge tone={killed ? 'err' : 'ok'}>{killed ? 'ACTIVE — agents halted' : 'Armed · ready'}</Badge>
                                </div>
                                <p style={{ fontSize: 13, color: 'var(--ink-muted)', margin: 0 }}>
                                    {killed
                                        ? 'All agent execution is stopped workspace-wide. In-flight tasks were cancelled.'
                                        : 'Emergency stop for this workspace — halts all agent execution within a 30-second control window.'}
                                </p>
                            </div>
                            {killed ? (
                                <Button variant="primary" onClick={() => setKilled(false)}><RotateCcw size={14} /> Resume agents</Button>
                            ) : (
                                <Button variant="danger" onClick={() => setKilled(true)}><ShieldAlert size={14} /> Activate kill switch</Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Circuit breakers */}
                <Panel title="Circuit breakers" action={<span className="uk-eyebrow" style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Zap size={11} /> per-service</span>}>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {breakers.map((b) => (
                            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${b.tone === 'ok' ? 'ok' : 'warn'})`, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <span className="uk-mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{b.name}</span>
                                    <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 2 }}>{b.note}</div>
                                </div>
                                <Badge tone={b.tone}>{b.state}</Badge>
                                {b.state !== 'closed' && <Button variant="ghost" size="sm">Reset</Button>}
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* Active policies */}
                <Panel title="Active policies" action={<Badge tone="accent"><ScrollText size={11} /> OPA-backed</Badge>}>
                    <div style={{ display: 'grid', gap: 0 }}>
                        {policies.map((p) => (
                            <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                                <div>
                                    <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{p.name}</div>
                                    <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)', marginTop: 2 }}>{p.detail}</div>
                                </div>
                                <Badge tone="ok">enforced</Badge>
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* Violations */}
                <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                        <Display size={20}>Violation history</Display>
                        <Eyebrow style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><Eye size={11} /> last 30 days</Eyebrow>
                    </div>
                    <table className="uk-ledger">
                        <thead><tr><th>Date</th><th>Rule</th><th>Workspace</th><th>Outcome</th></tr></thead>
                        <tbody>
                            {violations.map((v) => (
                                <tr key={v.t}>
                                    <td className="uk-num">{v.t}</td>
                                    <td className="uk-mono" style={{ fontSize: 12 }}>{v.rule}</td>
                                    <td>{v.workspace}</td>
                                    <td><Badge tone={v.tone}>{v.label}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="uk-eyebrow" style={{ marginTop: 12, color: 'var(--ok)' }}>✓ Both violations were caught and enforced by policy — nothing reached production.</p>
                </div>
            </div>
        </UiKit>
    );
}
