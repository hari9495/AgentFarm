'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Plus, RefreshCw, Settings2, Plug } from 'lucide-react';
import { UiKit, Masthead, Button, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

type Conn = { name: string; mono: string; auth: string; status: 'ok' | 'warn' | 'err'; label: string; check: string };

const CONNECTED: Conn[] = [
    { name: 'Jira', mono: 'JR', auth: 'OAuth 2.0', status: 'ok', label: 'connected', check: 'healthy · 1m ago' },
    { name: 'GitHub', mono: 'GH', auth: 'OAuth 2.0', status: 'ok', label: 'connected', check: 'healthy · 1m ago' },
    { name: 'Slack', mono: 'SL', auth: 'OAuth 2.0', status: 'ok', label: 'connected', check: 'healthy · 2m ago' },
    { name: 'Gmail', mono: 'GM', auth: 'OAuth 2.0', status: 'ok', label: 'connected', check: 'healthy · 1m ago' },
    { name: 'Greenhouse', mono: 'GR', auth: 'API key', status: 'ok', label: 'connected', check: 'healthy · 4m ago' },
    { name: 'Salesforce', mono: 'SF', auth: 'OAuth 2.0', status: 'warn', label: 're-consent', check: 'token expires in 3d' },
    { name: 'Azure ARM', mono: 'AZ', auth: 'mTLS', status: 'err', label: 'error', check: 'cert expired · action needed' },
];
const AVAILABLE = ['Linear', 'Asana', 'HubSpot', 'Outlook', 'ClickUp', 'WordPress', 'Trello', 'Azure DevOps'];

export default function ConnectorsPreview() {
    const [filter, setFilter] = useState<'all' | 'ok' | 'issues'>('all');
    const list = useMemo(() => CONNECTED.filter((c) => filter === 'all' || (filter === 'ok' ? c.status === 'ok' : c.status !== 'ok')), [filter]);
    const issues = CONNECTED.filter((c) => c.status !== 'ok').length;

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Integrations — Connector Registry"
                title="Connectors"
                actions={<>
                    <Link href="/command-center-preview" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Command center</Link>
                    <WfThemeToggle />
                    <Button variant="ghost" size="sm"><RefreshCw size={12} /> Health check</Button>
                    <Button variant="primary" size="sm"><Plus size={13} /> Add connector</Button>
                </>}
                stats={<>
                    <Stat n={String(CONNECTED.length).padStart(2, '0')} k="Connected" tone="ok" />
                    <Stat n={String(issues).padStart(2, '0')} k="Need attention" tone="warn" />
                    <Stat n="17" k="Available" tone="accent" />
                </>}
            />

            <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 6, alignItems: 'center' }}>
                {(['all', 'ok', 'issues'] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)} className="uk-eyebrow"
                        style={{ padding: '6px 11px', border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 3, cursor: 'pointer', background: filter === f ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: filter === f ? 'var(--accent)' : 'var(--ink-muted)' }}>
                        {f === 'ok' ? 'healthy' : f}
                    </button>
                ))}
                <span className="uk-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>{list.length} shown</span>
            </div>

            <div style={{ padding: 28, maxWidth: 1120, margin: '0 auto', width: '100%' }}>
                <Eyebrow style={{ marginBottom: 14 }}>Connected</Eyebrow>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 34 }}>
                    {list.map((c) => (
                        <div key={c.name} className="uk-panel" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start', borderLeft: `2px solid var(--${c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warn' : 'danger'})` }}>
                            <div style={{ width: 40, height: 40, border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span className="uk-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{c.mono}</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                                    <Badge tone={c.status}>{c.label}</Badge>
                                </div>
                                <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{c.auth} · {c.check}</div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                    {c.status !== 'ok'
                                        ? <Button variant="primary" size="sm"><RefreshCw size={11} /> Reconnect</Button>
                                        : <Button variant="ghost" size="sm"><Settings2 size={11} /> Configure</Button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <Eyebrow style={{ marginBottom: 14 }}>Available in marketplace</Eyebrow>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                    {AVAILABLE.map((a) => (
                        <div key={a} className="uk-panel" style={{ padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 30, height: 30, border: '1px dashed var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Plug size={13} color="var(--ink-muted)" />
                            </div>
                            <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{a}</span>
                            <Button variant="ghost" size="sm">Connect</Button>
                        </div>
                    ))}
                </div>
            </div>
        </UiKit>
    );
}
