'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
    Link2, ShoppingBag, Activity, Layers,
    Cpu, ArrowDownToLine, ArrowUpFromLine, Database,
    ExternalLink, ChevronRight,
} from 'lucide-react';
import { ConnectorConfigPanel } from '../components/connector-config-panel';
import { ConnectorMarketplacePanel } from '../components/connector-marketplace-panel';
import HealthStatusPanel from '../components/health-status-panel';
import InboundWebhooksPanel from '../components/inbound-webhooks-panel';
import OutboundWebhooksPanel from '../components/outbound-webhooks-panel';

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnectorSummary = {
    connector_id: string;
    connector_type: 'jira' | 'teams' | 'github' | 'email' | 'custom_api';
    status: string;
    scope_status: string | null;
    last_error_class: string | null;
    last_healthcheck_at: string | null;
    remediation: string;
};

type Tab = 'config' | 'marketplace' | 'health' | 'adapters' | 'mcp' | 'inbound' | 'outbound';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'config',      label: 'Connectors',         icon: Link2,            desc: 'OAuth / API-key / mTLS config per service'   },
    { key: 'marketplace', label: 'Marketplace',        icon: ShoppingBag,      desc: 'Browse and install connector integrations'    },
    { key: 'health',      label: 'Health',             icon: Activity,         desc: 'Live status and last healthcheck per service' },
    { key: 'adapters',    label: 'Adapters',           icon: Layers,           desc: 'Discover registered adapters and endpoints'  },
    { key: 'mcp',         label: 'MCP',                icon: Cpu,              desc: 'Model Context Protocol server config'         },
    { key: 'inbound',     label: 'Inbound Webhooks',   icon: ArrowDownToLine,  desc: 'Register sources, view events, test payloads' },
    { key: 'outbound',    label: 'Outbound + DLQ',     icon: ArrowUpFromLine,  desc: 'Deliveries, dead-letter queue, replay'        },
];

// ── Adapters tab — links to full page (calls API directly, better as server) ──

function AdaptersTab({ workspaceId }: { workspaceId: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', background: '#fff', border: '1px solid #d2d2d7', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Layers size={18} color="#0066cc" />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.01em', marginBottom: 4 }}>Adapter Registry</div>
                    <p style={{ fontSize: 13, color: '#6e6e73', lineHeight: 1.55, margin: 0 }}>
                        Discover registered adapters and endpoints for this workspace. Adapters are the low-level
                        bridge between the agent runtime and external services — each adapter exposes a set of
                        typed actions that agents can invoke.
                    </p>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #d2d2d7', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {[
                    { title: 'Browse adapters',      desc: 'View all registered adapters and their health status',       href: `/adapters?workspaceId=${workspaceId}` },
                    { title: 'Register new adapter', desc: 'Add a custom adapter endpoint to this workspace',            href: `/adapters?workspaceId=${workspaceId}&action=register` },
                    { title: 'Adapter capabilities', desc: 'See what actions each adapter exposes to agents',            href: `/connector-marketplace` },
                ].map(({ title, desc, href }, i) => (
                    <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', textDecoration: 'none', borderBottom: i < 2 ? '1px solid #f0f0f2' : 'none', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f7')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#1d1d1f' }}>{title}</div>
                            <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2 }}>{desc}</div>
                        </div>
                        <ExternalLink size={14} color="#aeaeb2" />
                    </Link>
                ))}
            </div>
        </div>
    );
}

// ── MCP tab — shows MCP config with link to full settings page ────────────────

function McpTab() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', background: '#fff', border: '1px solid #d2d2d7', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Cpu size={18} color="#0066cc" />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.01em', marginBottom: 4 }}>Model Context Protocol (MCP)</div>
                    <p style={{ fontSize: 13, color: '#6e6e73', lineHeight: 1.55, margin: 0 }}>
                        MCP servers give agents access to external tools and data sources through a standardised
                        protocol. Each registered server exposes capabilities that agents can call during task
                        execution — filesystem access, browser control, custom APIs, and more.
                    </p>
                </div>
            </div>

            {/* What MCP does */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                    { icon: '🌐', title: 'External APIs',    desc: 'Connect agents to REST or GraphQL APIs via MCP tool wrappers' },
                    { icon: '📁', title: 'File systems',     desc: 'Grant agents controlled read/write access to local or remote files' },
                    { icon: '🖥️', title: 'Browser control',  desc: 'MCP-powered browser automation for web research and form filling' },
                    { icon: '🔌', title: 'Custom tools',     desc: 'Register your own internal tools as MCP servers for any agent' },
                ].map(({ icon, title, desc }) => (
                    <div key={title} style={{ padding: '14px 16px', background: '#fff', border: '1px solid #d2d2d7', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', marginBottom: 3 }}>{title}</div>
                        <div style={{ fontSize: 12, color: '#6e6e73', lineHeight: 1.45 }}>{desc}</div>
                    </div>
                ))}
            </div>

            {/* Link to full MCP config */}
            <Link href="/tenant-settings" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', background: '#ffffff', border: '1px solid rgba(0,102,204,0.25)', borderRadius: 14, textDecoration: 'none', boxShadow: '0 0 0 3px rgba(0,102,204,0.06)' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Cpu size={16} color="#0066cc" />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0066cc' }}>Open MCP Server Configuration</div>
                    <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2 }}>Add, remove, and ping MCP servers registered for this tenant</div>
                </div>
                <ChevronRight size={16} color="#0066cc" />
            </Link>
        </div>
    );
}

// ── Tab shell ─────────────────────────────────────────────────────────────────

function TabShell({ title, icon: Icon, description, children }: {
    title: string; icon: React.ElementType; description: string; children: React.ReactNode;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={16} color="#0066cc" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>{title}</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#6e6e73', lineHeight: 1.45 }}>{description}</p>
                </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #d2d2d7', borderRadius: 18, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {children}
            </div>
        </div>
    );
}

// ── Main hub ──────────────────────────────────────────────────────────────────

export default function ConnectorsHubClient({
    workspaceId,
    tenantId,
    apiBase,
    initialConnectors,
}: {
    workspaceId: string;
    tenantId: string;
    apiBase: string;
    initialConnectors: ConnectorSummary[];
}) {
    const [activeTab, setActiveTab] = useState<Tab>('config');

    return (
        <div style={{
            minHeight: '100vh', background: '#f5f5f7',
            fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            display: 'flex', flexDirection: 'column',
        }}>
            {/* ── Top bar ──────────────────────────────────────────────── */}
            <header style={{
                height: 56, background: '#fff', borderBottom: '1px solid #d2d2d7',
                display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
                flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
            }}>
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#6e6e73', fontSize: 13, textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}>
                    ← Dashboard
                </Link>
                <span style={{ color: '#d2d2d7', flexShrink: 0 }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Link2 size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>Connectors & Integrations</span>
                </div>
                {/* Quick status summary */}
                <div style={{ display: 'flex', gap: 8, marginLeft: 8 }}>
                    {(() => {
                        const connected = initialConnectors.filter(c => c.status === 'connected').length;
                        const total     = initialConnectors.length;
                        const color     = connected === total ? '#1a7a4a' : connected > 0 ? '#b45309' : '#c4161c';
                        const bg        = connected === total ? 'rgba(26,122,74,0.07)' : connected > 0 ? 'rgba(180,83,9,0.07)' : 'rgba(196,22,28,0.07)';
                        const border    = connected === total ? 'rgba(26,122,74,0.2)' : connected > 0 ? 'rgba(180,83,9,0.2)' : 'rgba(196,22,28,0.2)';
                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999, background: bg, border: `1px solid ${border}` }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color }}>{connected}/{total} connected</span>
                            </div>
                        );
                    })()}
                </div>
            </header>

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderBottom: '1px solid #d2d2d7', padding: '0 20px', display: 'flex', gap: 0, overflowX: 'auto' }}>
                {TABS.map(({ key, label, icon: Icon }) => {
                    const active = activeTab === key;
                    return (
                        <button key={key} type="button" onClick={() => setActiveTab(key)} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '13px 14px', background: 'transparent', border: 'none',
                            borderBottom: `2px solid ${active ? '#0066cc' : 'transparent'}`,
                            cursor: 'pointer', color: active ? '#0066cc' : '#6e6e73',
                            fontSize: 13, fontWeight: active ? 600 : 500,
                            transition: 'all 0.15s', marginBottom: -1, whiteSpace: 'nowrap',
                        }}>
                            <Icon size={13} />
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* ── Content ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 20, overflow: 'auto' }}>

                {activeTab === 'config' && (
                    <TabShell icon={Link2} title="Connector Configuration"
                        description="Manage authentication (OAuth 2.0, API key, mTLS) for each integration. Connected services appear green. Click any connector to reconfigure or re-authenticate.">
                        <ConnectorConfigPanel
                            workspaceId={workspaceId}
                            apiBase={apiBase}
                            initialConnectors={initialConnectors}
                        />
                    </TabShell>
                )}

                {activeTab === 'marketplace' && (
                    <TabShell icon={ShoppingBag} title="Connector Marketplace"
                        description="Browse the full catalogue of available connectors. Each connector lists what actions agents can perform and what permissions are required.">
                        <ConnectorMarketplacePanel agentRoles={[]} />
                    </TabShell>
                )}

                {activeTab === 'health' && (
                    <TabShell icon={Activity} title="Connector Health"
                        description="Live healthcheck status for every connected service. Shows last check time, failure counts, and circuit breaker state.">
                        <HealthStatusPanel />
                    </TabShell>
                )}

                {activeTab === 'adapters' && (
                    <AdaptersTab workspaceId={workspaceId} />
                )}

                {activeTab === 'mcp' && (
                    <McpTab />
                )}

                {activeTab === 'inbound' && (
                    <TabShell icon={ArrowDownToLine} title="Inbound Webhooks"
                        description="Register external sources (GitHub, Jira, Slack, etc.) to push events into AgentFarm. Each source gets a unique URL, secret, and event filter.">
                        <InboundWebhooksPanel />
                    </TabShell>
                )}

                {activeTab === 'outbound' && (
                    <TabShell icon={ArrowUpFromLine} title="Outbound Webhooks, DLQ & Operations"
                        description="Configure outbound event delivery, inspect the dead-letter queue, replay failed deliveries, and browse the full event catalogue.">
                        <OutboundWebhooksPanel tenantId={tenantId} />
                    </TabShell>
                )}
            </div>
        </div>
    );
}
