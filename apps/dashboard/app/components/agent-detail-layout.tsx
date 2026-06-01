'use client';

import { useState } from 'react';

type Tab = 'overview' | 'capabilities' | 'observability' | 'activity' | 'memory';

const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',      label: 'Overview',       icon: '⊞' },
    { id: 'capabilities',  label: 'Capabilities',   icon: '🔌' },
    { id: 'observability', label: 'Observability',  icon: '📊' },
    { id: 'activity',      label: 'Activity',       icon: '💬' },
    { id: 'memory',        label: 'Memory',         icon: '🧠' },
];

type Props = {
    overview:      React.ReactNode;
    capabilities:  React.ReactNode;
    observability: React.ReactNode;
    activity:      React.ReactNode;
    memory:        React.ReactNode;
    navCards:      React.ReactNode;
    identityBar:   React.ReactNode;
};

export default function AgentDetailLayout({
    overview, capabilities, observability, activity, memory, navCards, identityBar,
}: Props) {
    const [active, setActive] = useState<Tab>('overview');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Identity bar — always visible */}
            {identityBar}

            {/* Tab bar */}
            <div style={{
                display: 'flex',
                gap: '0.25rem',
                borderBottom: '1px solid var(--line)',
                paddingBottom: '0',
                overflowX: 'auto',
            }}>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActive(tab.id)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            padding: '0.55rem 1rem',
                            background: 'none',
                            border: 'none',
                            borderBottom: active === tab.id
                                ? '2px solid var(--brand)'
                                : '2px solid transparent',
                            color: active === tab.id ? 'var(--brand)' : 'var(--ink-muted)',
                            fontSize: '0.84rem',
                            fontWeight: active === tab.id ? 600 : 400,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            marginBottom: '-1px',
                            transition: 'color 0.15s ease',
                        }}
                    >
                        <span style={{ fontSize: '0.9rem' }}>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab panels */}
            <div>
                {active === 'overview'      && <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>{overview}</div>}
                {active === 'capabilities'  && <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>{capabilities}</div>}
                {active === 'observability' && <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>{observability}</div>}
                {active === 'activity'      && <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>{activity}</div>}
                {active === 'memory'        && <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>{memory}</div>}
            </div>

            {/* Quick nav cards — always visible at bottom */}
            {navCards}
        </div>
    );
}
