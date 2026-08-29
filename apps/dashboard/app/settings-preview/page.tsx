'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    Settings, Users, KeyRound, Bell, ShieldCheck, AlertOctagon, Trash2, Plus,
} from 'lucide-react';
import { UiKit, Masthead, Panel, Button, Badge, Eyebrow, Input } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

type Section = 'general' | 'team' | 'keys' | 'notifications' | 'security' | 'danger';
const NAV: { key: Section; label: string; icon: React.ElementType }[] = [
    { key: 'general', label: 'General', icon: Settings },
    { key: 'team', label: 'Team', icon: Users },
    { key: 'keys', label: 'API keys', icon: KeyRound },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'security', label: 'Security', icon: ShieldCheck },
    { key: 'danger', label: 'Danger zone', icon: AlertOctagon },
];

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
    return (
        <button onClick={onToggle} aria-pressed={on}
            style={{ width: 38, height: 22, borderRadius: 999, border: '1px solid var(--line)', background: on ? 'var(--accent)' : 'var(--bg-deep)', position: 'relative', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
        </button>
    );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--line)', gap: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>{k}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>
        </div>
    );
}

const TEAM = [
    { mono: 'MR', name: 'Maya Rodriguez', email: 'maya@acme.com', role: 'Owner' },
    { mono: 'JC', name: 'James Chen', email: 'james@acme.com', role: 'Admin' },
    { mono: 'PK', name: 'Priya Kumar', email: 'priya@acme.com', role: 'Operator' },
    { mono: 'DB', name: 'David Brown', email: 'david@acme.com', role: 'Viewer' },
];
const KEYS = [
    { name: 'Production', masked: 'af_live_••••••••2f9a', created: '2026-06-12', used: '2m ago' },
    { name: 'CI pipeline', masked: 'af_live_••••••••7c31', created: '2026-07-04', used: '1h ago' },
];

export default function SettingsPreview() {
    const [sec, setSec] = useState<Section>('general');
    const [notif, setNotif] = useState({ approvals: true, budget: true, incidents: true, digest: false });

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Workspace — Settings"
                title="Settings"
                actions={<>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Command center</Link>
                    <WfThemeToggle />
                    <Button variant="primary" size="sm">Save changes</Button>
                </>}
            />

            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 0 }}>
                {/* Section nav */}
                <div style={{ borderRight: '1px solid var(--line)', padding: '18px 12px' }}>
                    {NAV.map(({ key, label, icon: Icon }) => (
                        <button key={key} onClick={() => setSec(key)}
                            style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 2, border: 'none', borderRadius: 3, cursor: 'pointer', background: sec === key ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent', color: key === 'danger' ? 'var(--danger)' : sec === key ? 'var(--accent)' : 'var(--ink-soft)', fontSize: 13, fontWeight: sec === key ? 600 : 500 }}>
                            <Icon size={15} /> {label}
                        </button>
                    ))}
                </div>

                {/* Panel */}
                <div style={{ overflowY: 'auto', padding: 28, maxWidth: 720 }}>
                    {sec === 'general' && (
                        <Panel title="General">
                            <div style={{ display: 'grid', gap: 16 }}>
                                <div style={{ display: 'grid', gap: 6 }}><Eyebrow>Workspace name</Eyebrow><Input defaultValue="Primary Dev Workspace" /></div>
                                <div style={{ display: 'grid', gap: 6 }}><Eyebrow>Workspace ID</Eyebrow><Input defaultValue="ws_primary_001" readOnly style={{ color: 'var(--ink-muted)' }} /></div>
                                <Row k="Plan"><Badge tone="accent">Enterprise</Badge></Row>
                                <Row k="Region"><span className="uk-mono" style={{ fontSize: 12.5 }}>South India</span></Row>
                                <Row k="Timezone"><span className="uk-mono" style={{ fontSize: 12.5 }}>Asia/Kolkata (IST)</span></Row>
                            </div>
                        </Panel>
                    )}

                    {sec === 'team' && (
                        <Panel title="Team members" action={<Button variant="ghost" size="sm"><Plus size={12} /> Invite</Button>}>
                            <div style={{ display: 'grid', gap: 0 }}>
                                {TEAM.map((m) => (
                                    <div key={m.email} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--line)' }}>
                                        <div style={{ width: 34, height: 34, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span className="uk-mono" style={{ fontSize: 11, fontWeight: 600 }}>{m.mono}</span></div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{m.name}</div>
                                            <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{m.email}</div>
                                        </div>
                                        <Badge tone={m.role === 'Owner' ? 'accent' : 'neutral'}>{m.role}</Badge>
                                        {m.role !== 'Owner' && <Button variant="ghost" size="sm">Remove</Button>}
                                    </div>
                                ))}
                            </div>
                        </Panel>
                    )}

                    {sec === 'keys' && (
                        <Panel title="API keys" action={<Button variant="primary" size="sm"><Plus size={12} /> Generate key</Button>}>
                            <div style={{ display: 'grid', gap: 0 }}>
                                {KEYS.map((key) => (
                                    <div key={key.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{key.name}</div>
                                            <div className="uk-mono" style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{key.masked} · created {key.created} · used {key.used}</div>
                                        </div>
                                        <Button variant="danger" size="sm">Revoke</Button>
                                    </div>
                                ))}
                            </div>
                        </Panel>
                    )}

                    {sec === 'notifications' && (
                        <Panel title="Notifications">
                            {[['approvals', 'Approval requests', 'When an agent proposes a high-risk action'], ['budget', 'Budget alerts', 'At 80% and 90% of budget'], ['incidents', 'Incidents', 'Circuit breaker trips and failures'], ['digest', 'Weekly digest', 'A summary of workforce activity']].map(([k, label, desc]) => (
                                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--line)', gap: 16 }}>
                                    <div><div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{label}</div><div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>{desc}</div></div>
                                    <Toggle on={notif[k as keyof typeof notif]} onToggle={() => setNotif((n) => ({ ...n, [k]: !n[k as keyof typeof notif] }))} />
                                </div>
                            ))}
                        </Panel>
                    )}

                    {sec === 'security' && (
                        <Panel title="Security">
                            <Row k="Single sign-on (SAML)"><Badge tone="ok">enabled</Badge></Row>
                            <Row k="Multi-factor auth"><Badge tone="ok">required</Badge></Row>
                            <Row k="Session lifetime"><span className="uk-mono" style={{ fontSize: 12.5 }}>30 days</span></Row>
                            <Row k="IP allowlist"><span className="uk-mono" style={{ fontSize: 12.5, color: 'var(--ink-muted)' }}>not configured</span><Button variant="ghost" size="sm">Add</Button></Row>
                            <Row k="Audit log export"><Badge tone="accent">Axiom · live</Badge></Row>
                        </Panel>
                    )}

                    {sec === 'danger' && (
                        <div className="uk-panel" style={{ padding: 20, borderLeft: '2px solid var(--danger)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}><AlertOctagon size={16} color="var(--danger)" /><span style={{ fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>Danger zone</span></div>
                            <Row k="Transfer ownership"><Button variant="ghost" size="sm">Transfer</Button></Row>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--line)', gap: 16 }}>
                                <div><div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>Delete workspace</div><div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>Permanently removes all agents, tasks, and evidence. Cannot be undone.</div></div>
                                <Button variant="danger" size="sm"><Trash2 size={12} /> Delete</Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </UiKit>
    );
}
