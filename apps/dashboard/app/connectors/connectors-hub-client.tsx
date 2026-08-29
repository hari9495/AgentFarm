'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import {
    Link2, ShoppingBag, Activity, Layers,
    Cpu, ArrowDownToLine, ArrowUpFromLine, ExternalLink,
    Plus, Trash2, Radio, CheckCircle2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { ConnectorConfigPanel } from '../components/connector-config-panel';
import { ConnectorMarketplacePanel } from '../components/connector-marketplace-panel';
import HealthStatusPanel from '../components/health-status-panel';
import InboundWebhooksPanel from '../components/inbound-webhooks-panel';
import OutboundWebhooksPanel from '../components/outbound-webhooks-panel';
import { UiKit, Masthead, Tabs, Badge } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

// ── Types ─────────────────────────────────────────────────────────────────────

type ConnectorSummary = {
    connector_id: string;
    connector_type: 'jira' | 'teams' | 'github' | 'email' | 'custom_api' | 'slack' | 'gitlab' | 'linear';
    status: string;
    scope_status: string | null;
    last_error_class: string | null;
    last_healthcheck_at: string | null;
    remediation: string;
};

type Tab = 'config' | 'marketplace' | 'health' | 'adapters' | 'mcp' | 'inbound' | 'outbound';

const TABS: { key: Tab; label: string; icon: React.ElementType; desc: string }[] = [
    { key: 'config',      label: 'Connectors',         icon: Link2,            desc: 'OAuth / API-key / mTLS config per service'   },
    { key: 'marketplace', label: 'Install Connectors',  icon: ShoppingBag,      desc: 'Browse and install external service integrations' },
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 3, boxShadow: 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Layers size={18} color="var(--accent)" />
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 4 }}>Adapter Registry</div>
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.55, margin: 0 }}>
                        Discover registered adapters and endpoints for this workspace. Adapters are the low-level
                        bridge between the agent runtime and external services — each adapter exposes a set of
                        typed actions that agents can invoke.
                    </p>
                </div>
            </div>

            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 3, overflow: 'hidden', boxShadow: 'none' }}>
                {[
                    { title: 'Browse adapters',      desc: 'View all registered adapters and their health status',       href: `/adapters?workspaceId=${workspaceId}` },
                    { title: 'Register new adapter', desc: 'Add a custom adapter endpoint to this workspace',            href: `/adapters?workspaceId=${workspaceId}&action=register` },
                ].map(({ title, desc, href }, i, arr) => (
                    <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', textDecoration: 'none', borderBottom: i < arr.length - 1 ? '1px solid #f0f0f2' : 'none', transition: 'background 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
                            <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{desc}</div>
                        </div>
                        <ExternalLink size={14} color="var(--ink-muted)" />
                    </Link>
                ))}
            </div>
        </div>
    );
}

// ── MCP tab — full working MCP server management ──────────────────────────────

type McpServer = { id: string; name: string; url: string; workspaceId: string | null; isActive: boolean };
type PingState = { loading: boolean; ok?: boolean; latencyMs?: number };

function McpTab() {
    const [servers, setServers]       = useState<McpServer[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [pingStates, setPingStates] = useState<Record<string, PingState>>({});
    const [showForm, setShowForm]     = useState(false);
    const [addName, setAddName]       = useState('');
    const [addUrl, setAddUrl]         = useState('');
    const [addWs, setAddWs]           = useState('');
    const [adding, setAdding]         = useState(false);
    const [addError, setAddError]     = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/tenant/mcp', { cache: 'no-store' });
            const data = (await res.json().catch(() => [])) as McpServer[] | { error?: string };
            if (!res.ok) { setError((data as { error?: string }).error ?? 'Failed to load MCP servers'); return; }
            setServers(Array.isArray(data) ? data : []);
        } catch { setError('Network error loading MCP servers'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const addServer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addName.trim() || !addUrl.trim()) { setAddError('Name and URL are required.'); return; }
        setAdding(true); setAddError(null);
        try {
            const res = await fetch('/api/tenant/mcp', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: addName.trim(), url: addUrl.trim(), workspaceId: addWs.trim() || undefined }),
            });
            const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
            if (!res.ok) { setAddError(data.message ?? data.error ?? 'Failed to add server.'); return; }
            setAddName(''); setAddUrl(''); setAddWs(''); setShowForm(false);
            await load();
        } catch { setAddError('Network error.'); }
        finally { setAdding(false); }
    };

    const remove = async (server: McpServer) => {
        if (!confirm(`Remove "${server.name}"?`)) return;
        try {
            const res = await fetch(`/api/tenant/mcp/${encodeURIComponent(server.id)}`, { method: 'DELETE' });
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { error?: string };
                setError(d.error ?? `Failed to remove "${server.name}".`);
            } else {
                await load();
            }
        } catch { setError('Network error removing server.'); }
    };

    const ping = async (server: McpServer) => {
        setPingStates(p => ({ ...p, [server.id]: { loading: true } }));
        try {
            const res = await fetch(`/api/tenant/mcp/${encodeURIComponent(server.id)}/ping`, { cache: 'no-store' });
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean; latencyMs?: number };
            setPingStates(p => ({ ...p, [server.id]: { loading: false, ok: data.ok ?? false, latencyMs: data.latencyMs } }));
        } catch { setPingStates(p => ({ ...p, [server.id]: { loading: false, ok: false } })); }
    };

    const inp: React.CSSProperties = { width: '100%', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
    const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Compact explainer */}
            <div style={{ padding: '12px 16px', background: 'rgba(45, 138, 138,0.04)', border: '1px solid rgba(45, 138, 138,0.15)', borderRadius: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Cpu size={15} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
                        <strong style={{ color: 'var(--accent)' }}>Model Context Protocol</strong> — register MCP servers to give agents
                        access to filesystems, browser automation, REST APIs, and custom tools.
                        Agents discover these servers automatically on their next task.
                    </p>
                </div>
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Registered MCP Servers</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                        {loading ? 'Loading…' : `${servers.length} server${servers.length !== 1 ? 's' : ''} registered for this tenant`}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={11} /> Refresh
                    </button>
                    <button onClick={() => setShowForm(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 9999, border: 'none', background: showForm ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {showForm ? '✕ Cancel' : <><Plus size={12} /> Add MCP Server</>}
                    </button>
                </div>
            </div>

            {/* Add form */}
            {showForm && (
                <div style={{ border: '1px solid rgba(45, 138, 138,0.25)', borderRadius: 3, background: 'var(--card)', padding: '18px 20px', boxShadow: 'none' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Add MCP Server</div>
                    <form onSubmit={addServer} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                            <div>
                                <label style={lbl}>Server Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input value={addName} onChange={e => setAddName(e.target.value)} style={inp} placeholder="My Filesystem Server" required />
                            </div>
                            <div>
                                <label style={lbl}>Server URL <span style={{ color: 'var(--danger)' }}>*</span></label>
                                <input value={addUrl} onChange={e => setAddUrl(e.target.value)} type="url" style={inp} placeholder="http://localhost:3100" required />
                                <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>The MCP endpoint agents connect to</p>
                            </div>
                        </div>
                        <div>
                            <label style={lbl}>Workspace ID <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(optional — leave blank for all workspaces)</span></label>
                            <input value={addWs} onChange={e => setAddWs(e.target.value)} style={{ ...inp, maxWidth: 300 }} placeholder="ws_… or leave blank" />
                        </div>
                        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                            💡 After adding: agents in the scoped workspace will discover this server on their next task and gain access to all tools it exposes. Use <strong>Ping</strong> to verify it is reachable first.
                        </div>
                        {addError && <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}><AlertCircle size={13} /> {addError}</div>}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button type="button" onClick={() => setShowForm(false)} style={{ padding: '8px 18px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                            <button type="submit" disabled={adding} style={{ padding: '8px 24px', borderRadius: 9999, border: 'none', background: adding ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 13, fontWeight: 700, cursor: adding ? 'not-allowed' : 'pointer' }}>{adding ? 'Adding…' : 'Add Server'}</button>
                        </div>
                    </form>
                </div>
            )}

            {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
            {loading && !showForm && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[1,2].map(i => <div key={i} style={{ height: 70, borderRadius: 14, background: 'var(--bg)' }} />)}</div>}

            {/* Empty state */}
            {!loading && servers.length === 0 && !showForm && !error && (
                <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed #d2d2d7', borderRadius: 3, background: 'var(--bg)' }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>⚙️</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>No MCP servers registered</div>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.5, maxWidth: 340, marginLeft: 'auto', marginRight: 'auto' }}>
                        Register an MCP server to give agents access to filesystems, browser automation, custom APIs, and database tools.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, textAlign: 'left', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
                        {[['🌐','External APIs','Your REST/GraphQL microservices'],['📁','File systems','Read configs, write reports'],['🖥️','Browser control','Form filling, web research'],['🔌','Custom tools','Anything that speaks MCP']].map(([icon, title, desc]) => (
                            <div key={title} style={{ padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10 }}>
                                <div style={{ fontSize: 16, marginBottom: 4 }}>{icon}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{desc}</div>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => setShowForm(true)} style={{ padding: '8px 20px', borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add your first MCP server</button>
                </div>
            )}

            {/* Server list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {servers.map(server => {
                    const ps = pingStates[server.id];
                    return (
                        <div key={server.id} style={{ background: 'var(--card)', border: `1px solid ${server.isActive ? 'rgba(26,122,74,0.25)' : 'var(--line)'}`, borderRadius: 14, padding: '14px 16px', boxShadow: 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ width: 9, height: 9, borderRadius: '50%', background: server.isActive ? 'var(--ok)' : 'var(--ink-muted)', flexShrink: 0, marginTop: 5 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 3 }}>{server.name}</div>
                                    <div style={{ fontSize: 12, fontFamily: 'ui-monospace, monospace', color: 'var(--accent)' }}>{server.url}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{server.workspaceId ? `Workspace: ${server.workspaceId}` : 'Scope: All workspaces'}</div>
                                    {ps && !ps.loading && (
                                        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: ps.ok ? 'var(--ok)' : 'var(--danger)' }}>
                                            {ps.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                            {ps.ok ? `Reachable · ${ps.latencyMs ?? 0}ms` : 'Unreachable — check URL and confirm server is running'}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                    <button onClick={() => void ping(server)} disabled={ps?.loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600, cursor: ps?.loading ? 'wait' : 'pointer' }}>
                                        <Radio size={11} />{ps?.loading ? 'Pinging…' : 'Ping'}
                                    </button>
                                    <button onClick={() => void remove(server)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 9999, border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                        <Trash2 size={11} /> Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
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
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                    <Icon size={16} color="var(--accent)" />
                </div>
                <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{title}</h2>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.45 }}>{description}</p>
                </div>
            </div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 3, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
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

    const connected = initialConnectors.filter(c => c.status === 'connected').length;
    const total = initialConnectors.length;
    const connTone = connected === total ? 'ok' : connected > 0 ? 'warn' : 'err';

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Integrations — Connector Registry"
                title="Connectors"
                actions={<>
                    <Link href="/" className="uk-eyebrow" style={{ textDecoration: 'none', alignSelf: 'center' }}>← Dashboard</Link>
                    <WfThemeToggle />
                    <Badge tone={connTone}>{connected}/{total} connected</Badge>
                </>}
            />

            {/* ── Tab bar ──────────────────────────────────────────────── */}
            <div style={{ padding: '0 28px' }}>
                <Tabs
                    tabs={TABS.map(t => ({ key: t.key, label: t.label, icon: <t.icon size={13} /> }))}
                    active={activeTab}
                    onChange={setActiveTab}
                />
            </div>

            {/* ── Content ──────────────────────────────────────────────── */}
            <div style={{ flex: 1, padding: 28, overflow: 'auto' }}>

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Clear identity banner */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '16px 18px', background: 'var(--card)', border: '2px solid rgba(45, 138, 138,0.2)', borderRadius: 3, boxShadow: 'none' }}>
                            <div style={{ width: 42, height: 42, borderRadius: 3, background: 'rgba(45, 138, 138,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>🔌</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Connector Marketplace</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' }}>External Services</span>
                                </div>
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', fontWeight: 600, marginBottom: 3 }}>
                                    Install Slack, GitHub, Jira, PagerDuty and other external tools
                                </p>
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                                    Connectors = <strong>what tools agents can use</strong>. Click <strong>+ Install</strong> on any card below, enter your API key or OAuth token, and agents gain access to that service.
                                </p>
                            </div>
                        </div>

                        {/* Skill Marketplace distinction callout */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12 }}>
                            <span style={{ fontSize: 15 }}>🧠</span>
                            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                                <strong style={{ color: 'var(--ink-soft)' }}>Different from Skill Marketplace</strong> — Skills (found in the main dashboard → Skill Marketplace tab) define agent <em>behaviors</em>.
                                Connectors here give agents access to <em>external tools</em>. They work together: skills use connectors to act on your tools.
                            </p>
                        </div>

                        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 3, padding: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                            <ConnectorMarketplacePanel agentRoles={[]} />
                        </div>
                    </div>
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
        </UiKit>
    );
}
