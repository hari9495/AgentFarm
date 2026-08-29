'use client';

import { useState } from 'react';
import { RefreshCw, Plus, Check } from 'lucide-react';
import {
    UiKit, Masthead, Panel, Button, Badge, Input, Select, Tabs, Stat, Eyebrow, Display,
} from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

export default function UiKitGallery() {
    const [tab, setTab] = useState<'live' | 'history' | 'queue'>('live');
    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)' }}>
            <Masthead
                eyebrow="Design System — Editorial Primitives"
                title="UI Kit"
                actions={<><WfThemeToggle /><Button variant="ghost" size="sm"><RefreshCw size={12} /></Button><Button variant="primary" size="sm"><Plus size={13} /> New</Button></>}
                stats={<>
                    <Stat n="09" k="Primitives" tone="accent" />
                    <Stat n="02" k="Themes" tone="muted" />
                </>}
            />

            <div style={{ padding: 28, display: 'grid', gap: 20, maxWidth: 960 }}>
                <Panel title="Buttons">
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Button variant="primary"><Check size={13} /> Approve</Button>
                        <Button variant="ghost">Reject</Button>
                        <Button variant="danger">Delete</Button>
                        <Button variant="primary" size="sm">Small</Button>
                        <Button variant="ghost" disabled>Disabled</Button>
                    </div>
                </Panel>

                <Panel title="Badges — semantic status">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Badge tone="ok">done</Badge>
                        <Badge tone="warn">pending</Badge>
                        <Badge tone="err">failed</Badge>
                        <Badge tone="accent">live</Badge>
                        <Badge tone="neutral">draft</Badge>
                    </div>
                </Panel>

                <Panel title="Inputs">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Input placeholder="Search approvals…" />
                        <Select defaultValue=""><option value="">All workspaces</option><option>Primary Dev</option></Select>
                    </div>
                </Panel>

                <Panel title="Tabs">
                    <Tabs
                        tabs={[{ key: 'live', label: 'Live Feed' }, { key: 'history', label: 'History' }, { key: 'queue', label: 'Queue' }]}
                        active={tab}
                        onChange={setTab}
                    />
                    <p style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-muted)' }}>Active tab: <span className="uk-mono" style={{ color: 'var(--accent)' }}>{tab}</span></p>
                </Panel>

                <Panel title="Ledger — print-table">
                    <table className="uk-ledger">
                        <thead><tr><th>Timestamp</th><th>Action</th><th>Requested by</th><th>Status</th></tr></thead>
                        <tbody>
                            <tr><td className="uk-num">18:04:12</td><td>connector_execute · jira</td><td>maya.r</td><td><Badge tone="ok">done</Badge></td></tr>
                            <tr><td className="uk-num">18:03:47</td><td>approval_decision</td><td>system</td><td><Badge tone="warn">pending</Badge></td></tr>
                            <tr><td className="uk-num">18:02:09</td><td>task_dispatch</td><td>ci.bot</td><td><Badge tone="err">failed</Badge></td></tr>
                        </tbody>
                    </table>
                </Panel>

                <Panel title="Typography">
                    <Eyebrow>Eyebrow — mono uppercase label</Eyebrow>
                    <Display size={30} style={{ margin: '8px 0 4px' }}>Fraunces Display</Display>
                    <p style={{ fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: '60ch' }}>
                        Inter body copy for data and prose. Figures use IBM Plex Mono: <span className="uk-mono">1,204 tasks · 99.2% uptime</span>.
                    </p>
                </Panel>
            </div>
        </UiKit>
    );
}
