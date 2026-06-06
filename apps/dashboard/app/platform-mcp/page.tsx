'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw, Copy, Check, ChevronDown, ChevronUp, Settings2, X, CheckCircle2, AlertCircle, Plus } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type McpConnector = {
    id: string;
    envVar: string;
    label: string;
    agents: string[];
    configured: boolean;
};

type McpGroup = {
    group: string;
    connectors: McpConnector[];
};

type PlatformMcpData = {
    groups: McpGroup[];
    total: number;
    configured: number;
};

// ── Agent badge colours ────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
    developer: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    fsd:       'rgba(124,45,146,0.08)',
    devops:    'color-mix(in srgb, var(--warn) 8%, transparent)',
    tester:    'color-mix(in srgb, var(--ok) 8%, transparent)',
    pm:        'var(--bg)',
    ba:        'var(--bg)',
    tw:        'var(--bg)',
    sales:     'color-mix(in srgb, var(--danger) 8%, transparent)',
    marketing: 'color-mix(in srgb, var(--danger) 8%, transparent)',
    cs:        'color-mix(in srgb, var(--accent) 8%, transparent)',
    ca:        'color-mix(in srgb, var(--accent) 8%, transparent)',
    recruiter: 'color-mix(in srgb, var(--ok) 8%, transparent)',
    mobile:    'rgba(124,45,146,0.08)',
};

const AGENT_LABELS: Record<string, string> = {
    developer: 'Developer', fsd: 'Full-Stack Dev', devops: 'DevOps',
    tester: 'Tester', pm: 'Project Manager', ba: 'Business Analyst',
    tw: 'Technical Writer', sales: 'Sales', marketing: 'Marketing',
    cs: 'Customer Support', ca: 'Corporate Asst.', recruiter: 'Recruiter', mobile: 'Mobile Dev',
};

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: copied ? 'var(--ok)' : 'var(--ink-soft)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
        </button>
    );
}

// ── Add Custom MCP Modal ──────────────────────────────────────────────────────

const ALL_AGENT_ROLES = [
    { id: 'developer',   label: 'Developer'           },
    { id: 'fsd',         label: 'Full-Stack Dev'       },
    { id: 'devops',      label: 'DevOps'              },
    { id: 'tester',      label: 'Tester'              },
    { id: 'pm',          label: 'Project Manager'     },
    { id: 'ba',          label: 'Business Analyst'    },
    { id: 'tw',          label: 'Technical Writer'    },
    { id: 'sales',       label: 'Sales'               },
    { id: 'marketing',   label: 'Marketing'           },
    { id: 'cs',          label: 'Customer Support'    },
    { id: 'ca',          label: 'Corporate Asst.'     },
    { id: 'recruiter',   label: 'Recruiter'           },
    { id: 'mobile',      label: 'Mobile Dev'          },
];

function AddCustomMcpModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
    const [name, setName]         = useState('');
    const [connectorId, setId]    = useState('');
    const [url, setUrl]           = useState('');
    const [selectedRoles, setRoles] = useState<string[]>(['developer']);
    const [saving, setSaving]     = useState(false);
    const [error, setError]       = useState<string | null>(null);
    const [saved, setSaved]       = useState(false);

    // Auto-generate connector ID from name
    const handleNameChange = (val: string) => {
        setName(val);
        setId(val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
    };

    const toggleRole = (role: string) => {
        setRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    };

    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim() || !url.trim()) { setError('Name and URL are required.'); return; }
        if (selectedRoles.length === 0) { setError('Select at least one agent role.'); return; }
        setSaving(true); setError(null);
        try {
            const res = await fetch('/api/platform-mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    connectorId: connectorId || name.toLowerCase().replace(/\s+/g, '_'),
                    url: url.trim(),
                    label: name.trim(),
                    agents: selectedRoles,
                }),
            });
            const body = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) { setError(body.message ?? body.error ?? 'Failed to save.'); return; }
            setSaved(true);
            setTimeout(() => { onSaved(); onClose(); }, 1200);
        } catch { setError('Network error. Try again.'); }
        finally { setSaving(false); }
    }

    const inp: React.CSSProperties = {
        width: '100%', padding: '9px 12px', borderRadius: 10,
        border: '1px solid var(--line)', background: 'var(--card)',
        color: 'var(--ink)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
    };
    const lbl: React.CSSProperties = {
        fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5,
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 520, border: '1px solid var(--line)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Add Custom Platform MCP</div>
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Register any MCP server</h2>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-muted)' }}>No code changes needed — works immediately across all tenants.</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={14} /></button>
                </div>

                <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                    {/* Name + auto ID */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                            <label style={lbl}>Display Name <span style={{ color: 'var(--danger)' }}>*</span></label>
                            <input value={name} onChange={e => handleNameChange(e.target.value)} style={inp} placeholder="e.g. Stripe Payments" required />
                            <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>Human-readable label shown in the UI</p>
                        </div>
                        <div>
                            <label style={lbl}>Connector ID</label>
                            <input value={connectorId} onChange={e => setId(e.target.value)} style={{ ...inp, fontFamily: 'ui-monospace, monospace', background: 'var(--bg)', color: 'var(--ink-muted)' }} placeholder="auto-generated" readOnly />
                            <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>Auto-generated from name</p>
                        </div>
                    </div>

                    {/* URL */}
                    <div>
                        <label style={lbl}>MCP Server URL <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input value={url} onChange={e => setUrl(e.target.value)} type="url" style={{ ...inp, fontFamily: 'ui-monospace, monospace' }} placeholder="http://mcp-stripe:3100" required />
                        <p style={{ fontSize: 11, color: 'var(--ink-muted)', margin: '4px 0 0' }}>
                            The URL of your MCP server. Must be reachable from the agent-runtime network.
                        </p>
                    </div>

                    {/* Agent roles */}
                    <div>
                        <label style={lbl}>Which agents get access? <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
                            Select the agent roles that should automatically receive this MCP server. All agents of these types, across all tenants, will have access.
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {ALL_AGENT_ROLES.map(({ id, label }) => {
                                const selected = selectedRoles.includes(id);
                                return (
                                    <button key={id} type="button" onClick={() => toggleRole(id)}
                                        style={{
                                            padding: '5px 12px', borderRadius: 9999, cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                                            border: `1px solid ${selected ? 'var(--accent)' : 'var(--line)'}`,
                                            background: selected ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--card)',
                                            color: selected ? 'var(--accent)' : 'var(--ink-soft)',
                                        }}>
                                        {selected && '✓ '}{label}
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" onClick={() => setRoles(selectedRoles.length === ALL_AGENT_ROLES.length ? [] : ALL_AGENT_ROLES.map(r => r.id))}
                            style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            {selectedRoles.length === ALL_AGENT_ROLES.length ? 'Deselect all' : 'Select all roles'}
                        </button>
                    </div>

                    {/* Preview */}
                    {name && url && selectedRoles.length > 0 && (
                        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'color-mix(in srgb, var(--accent) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                            <strong style={{ color: 'var(--accent)' }}>Preview:</strong> <strong>{name}</strong> will be available
                            to every <strong>{selectedRoles.map(r => ALL_AGENT_ROLES.find(a => a.id === r)?.label ?? r).join(', ')}</strong> agent
                            across all tenants at <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 4 }}>{url}</code>
                        </div>
                    )}

                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                            <AlertCircle size={13} /> {error}
                        </div>
                    )}
                    {saved && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', color: 'var(--ok)', fontSize: 12 }}>
                            <CheckCircle2 size={13} /> Saved! {name} is now available to all selected agents across all tenants.
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={saving || saved} style={{ flex: 1, padding: '10px 0', borderRadius: 9999, border: 'none', background: saving || saved ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                            {saving ? 'Adding…' : saved ? '✓ Added' : 'Add MCP Server'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Configure Modal ───────────────────────────────────────────────────────────

function ConfigureModal({
    connector,
    onClose,
    onSaved,
}: {
    connector: McpConnector;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [url, setUrl]       = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState<string | null>(null);
    const [saved, setSaved]   = useState(false);

    async function save(e: React.FormEvent) {
        e.preventDefault();
        if (!url.trim()) { setError('URL is required.'); return; }
        setSaving(true); setError(null);
        try {
            const res = await fetch('/api/platform-mcp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connectorId: connector.id, url: url.trim(), label: connector.label }),
            });
            const body = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) { setError(body.message ?? body.error ?? 'Failed to save.'); return; }
            setSaved(true);
            setTimeout(() => { onSaved(); onClose(); }, 1200);
        } catch { setError('Network error. Try again.'); }
        finally { setSaving(false); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 480, border: '1px solid var(--line)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Configure Platform MCP</div>
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{connector.label}</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
                </div>

                {/* What this does */}
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'color-mix(in srgb, var(--accent) 5%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', marginBottom: 18, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.55 }}>
                    <strong style={{ color: 'var(--accent)' }}>Platform-wide:</strong> Setting this URL makes <strong>{connector.label}</strong> available to
                    every <strong>{connector.agents.map(a => AGENT_LABELS[a] ?? a).join(', ')}</strong> agent across all tenants automatically.
                    No per-tenant registration needed.
                </div>

                <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>
                            MCP Server URL <span style={{ color: 'var(--danger)' }}>*</span>
                        </label>
                        <input
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            type="url"
                            placeholder={`http://mcp-${connector.id.replace(/_/g, '-')}:3100`}
                            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'ui-monospace, monospace' }}
                            required
                        />
                        <p style={{ margin: '5px 0 0', fontSize: 11, color: 'var(--ink-muted)' }}>
                            The URL of your {connector.label} MCP server. Stored securely and used by the agent-runtime.
                        </p>
                    </div>

                    {/* Env var reference */}
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 12 }}>
                        <div style={{ fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 3 }}>Or set via environment variable:</div>
                        <code style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--accent)' }}>{connector.envVar}=http://your-mcp-server:3100</code>
                        <div style={{ color: 'var(--ink-muted)', marginTop: 3 }}>Both methods work. The database entry (set here) takes precedence over the env var.</div>
                    </div>

                    {error && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                            <AlertCircle size={13} /> {error}
                        </div>
                    )}
                    {saved && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', borderRadius: 9, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', color: 'var(--ok)', fontSize: 12 }}>
                            <CheckCircle2 size={13} /> Saved! {connector.label} is now configured for all agents.
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={saving || saved} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: 'none', background: saving || saved ? 'var(--ink-muted)' : 'var(--accent)', color: 'var(--card)', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save URL'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlatformMcpPage() {
    const [data, setData]           = useState<PlatformMcpData | null>(null);
    const [loading, setLoading]     = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [expanded, setExpanded]   = useState<Record<string, boolean>>({});
    const [filterUnconfigured, setFilterUnconfigured] = useState(false);
    const [search, setSearch]       = useState('');
    const [configuring, setConfiguring]   = useState<McpConnector | null>(null);
    const [showAddCustom, setShowAddCustom] = useState(false);

    const load = useCallback(async () => {
        setLoading(true); setLoadError(null);
        try {
            const res = await fetch('/api/health/platform-mcp', { cache: 'no-store' });
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { error?: string };
                setLoadError(d.error ?? 'Failed to load MCP configuration.');
                return;
            }
            const body = (await res.json()) as PlatformMcpData;
            setData(body);
            // Expand all by default
            const expanded: Record<string, boolean> = {};
            body.groups.forEach(g => { expanded[g.group] = true; });
            setExpanded(expanded);
        } catch { setLoadError('Network error loading MCP configuration.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    // Generate .env template for all configured + unconfigured
    const envTemplate = data?.groups.flatMap(g =>
        g.connectors.map(c => `# ${c.label} (used by: ${c.agents.map(a => AGENT_LABELS[a] ?? a).join(', ')})\n${c.envVar}=`)
    ).join('\n') ?? '';

    // Filter
    const filtered = data?.groups.map(g => ({
        ...g,
        connectors: g.connectors.filter(c => {
            const matchSearch = !search || c.label.toLowerCase().includes(search.toLowerCase()) || c.envVar.toLowerCase().includes(search.toLowerCase());
            const matchFilter = !filterUnconfigured || !c.configured;
            return matchSearch && matchFilter;
        }),
    })).filter(g => g.connectors.length > 0);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: "var(--font-inter), -apple-system, sans-serif" }}>
            {/* Add custom MCP modal */}
            {showAddCustom && (
                <AddCustomMcpModal
                    onClose={() => setShowAddCustom(false)}
                    onSaved={() => { setShowAddCustom(false); void load(); }}
                />
            )}
            {/* Configure existing modal */}
            {configuring && (
                <ConfigureModal
                    connector={configuring}
                    onClose={() => setConfiguring(null)}
                    onSaved={() => { setConfiguring(null); void load(); }}
                />
            )}

            {/* Header */}
            <header style={{ height: 56, background: 'var(--card)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
                <Link href="/" style={{ color: 'var(--ink-muted)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Dashboard</Link>
                <span style={{ color: 'var(--line-strong)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Cpu size={14} color="var(--accent)" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Platform MCP Configuration</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={11} /> Refresh
                    </button>
                    <CopyBtn text={envTemplate} />
                    <button onClick={() => setShowAddCustom(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 9999, border: 'none', background: 'var(--accent)', color: 'var(--card)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <Plus size={12} /> Add Custom MCP
                    </button>
                </div>
            </header>

            <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Load error */}
                {loadError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 12, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
                        <span style={{ fontWeight: 600 }}>⚠</span> {loadError}
                        <button onClick={() => void load()} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Retry</button>
                    </div>
                )}
                {/* Explainer */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Cpu size={18} color="var(--accent)" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Platform-wide MCP Servers</div>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6, maxWidth: 640 }}>
                                These are <strong>generic MCP connections that work across the entire product</strong> — every agent,
                                every tenant, every workspace. Set the environment variable once in your deployment config
                                and all agents automatically get access. No per-tenant registration needed.
                            </p>
                            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: 'var(--ink)' }}>How it works: </span>
                                    <code style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--accent)' }}>MCP_GITHUB_URL=http://mcp-github:3100</code>
                                    <span style={{ color: 'var(--ink-muted)' }}> → every developer agent across all tenants gets GitHub MCP</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    {data && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                            {[
                                { label: 'Total MCP connectors', value: data.total, color: 'var(--ink)' },
                                { label: 'Configured (env var set)', value: data.configured, color: 'var(--ok)' },
                                { label: 'Not configured', value: data.total - data.configured, color: data.configured < data.total ? 'var(--warn)' : 'var(--ink-muted)' },
                            ].map(({ label, value, color }) => (
                                <div key={label} style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--line)' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
                                    <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* How to configure callout */}
                <div style={{ padding: '14px 18px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)', marginBottom: 6 }}>⚙️ How to configure</div>
                    <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
                        Add env vars to your <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>.env</code> file
                        or deployment config (Docker Compose / Kubernetes secrets / Azure App Settings), then restart the
                        <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>agent-runtime</code> service.
                        Agents pick up the new MCP servers on their next task — no code changes needed.
                        Click <strong>Copy</strong> in the header to get a full <code>.env</code> template with all connector env vars.
                    </div>
                </div>

                {/* Search + filter */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search connectors…"
                        style={{ flex: 1, maxWidth: 320, padding: '8px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, outline: 'none' }} />
                    <button onClick={() => setFilterUnconfigured(v => !v)}
                        style={{ padding: '7px 14px', borderRadius: 9999, border: `1px solid ${filterUnconfigured ? 'var(--warn-border)' : 'var(--line)'}`, background: filterUnconfigured ? 'var(--warn-bg)' : 'var(--card)', color: filterUnconfigured ? 'var(--warn)' : 'var(--ink-soft)', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {filterUnconfigured ? '✓ Showing unconfigured only' : 'Show unconfigured only'}
                    </button>
                </div>

                {/* Groups */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[1,2,3,4].map(i => <div key={i} style={{ height: 120, borderRadius: 16, background: 'var(--bg)' }} />)}
                    </div>
                ) : (
                    filtered?.map(group => {
                        const isExpanded = expanded[group.group] !== false;
                        const configuredCount = group.connectors.filter(c => c.configured).length;
                        return (
                            <div key={group.group} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                {/* Group header */}
                                <button type="button"
                                    onClick={() => setExpanded(p => ({ ...p, [group.group]: !isExpanded }))}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{group.group}</span>
                                        <span style={{ fontSize: 12, color: 'var(--ink-muted)', marginLeft: 10 }}>
                                            {configuredCount}/{group.connectors.length} configured
                                        </span>
                                    </div>
                                    {/* Mini progress */}
                                    <div style={{ width: 80, height: 4, borderRadius: 9999, background: 'var(--bg)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: 9999, background: configuredCount === group.connectors.length ? 'var(--ok)' : configuredCount > 0 ? 'var(--warn)' : 'var(--ink-muted)', width: `${group.connectors.length > 0 ? (configuredCount / group.connectors.length) * 100 : 0}%`, transition: 'width 0.5s ease' }} />
                                    </div>
                                    {isExpanded ? <ChevronUp size={15} color="var(--ink-muted)" /> : <ChevronDown size={15} color="var(--ink-muted)" />}
                                </button>

                                {/* Connectors grid */}
                                {isExpanded && (
                                    <div style={{ borderTop: '1px solid var(--line)', padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                                        {group.connectors.map(c => (
                                            <div key={c.id} style={{
                                                padding: '12px 14px', borderRadius: 12,
                                                border: `1px solid ${c.configured ? 'var(--ok-border)' : 'var(--line)'}`,
                                                background: c.configured ? 'var(--ok-bg)' : 'var(--bg)',
                                            }}>
                                                {/* Name + status */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.configured ? 'var(--ok)' : 'var(--ink-muted)', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{c.label}</span>
                                                    {/* SET URL / CONFIGURED button */}
                                                    {c.configured ? (
                                                        <button onClick={() => setConfiguring(c)}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 9999, border: '1px solid var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                                            <CheckCircle2 size={10} /> Configured
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => setConfiguring(c)}
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 9999, border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', background: 'color-mix(in srgb, var(--accent) 7%, transparent)', color: 'var(--accent)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                                            <Settings2 size={10} /> Set URL
                                                        </button>
                                                    )}
                                                </div>
                                                <code style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: 'var(--ink-muted)', display: 'block', marginBottom: 7 }}>
                                                    {c.envVar}
                                                </code>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                    {c.agents.map(a => (
                                                        <span key={a} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999, background: AGENT_COLORS[a] ?? 'rgba(0,0,0,0.05)', color: 'var(--ink-soft)' }}>
                                                            {AGENT_LABELS[a] ?? a}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
