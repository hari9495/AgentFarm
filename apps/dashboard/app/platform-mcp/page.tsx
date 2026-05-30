'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';

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
    developer: 'rgba(0,102,204,0.08)',
    fsd:       'rgba(124,45,146,0.08)',
    devops:    'rgba(180,83,9,0.08)',
    tester:    'rgba(26,122,74,0.08)',
    pm:        'rgba(100,100,100,0.08)',
    ba:        'rgba(100,100,100,0.08)',
    tw:        'rgba(100,100,100,0.08)',
    sales:     'rgba(196,22,28,0.08)',
    marketing: 'rgba(196,22,28,0.08)',
    cs:        'rgba(0,102,204,0.08)',
    ca:        'rgba(0,102,204,0.08)',
    recruiter: 'rgba(26,122,74,0.08)',
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: copied ? '#1a7a4a' : '#424245', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
        </button>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlatformMcpPage() {
    const [data, setData]           = useState<PlatformMcpData | null>(null);
    const [loading, setLoading]     = useState(true);
    const [expanded, setExpanded]   = useState<Record<string, boolean>>({});
    const [filterUnconfigured, setFilterUnconfigured] = useState(false);
    const [search, setSearch]       = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/health/platform-mcp', { cache: 'no-store' });
            const body = (await res.json()) as PlatformMcpData;
            setData(body);
            // Expand all by default
            const expanded: Record<string, boolean> = {};
            body.groups.forEach(g => { expanded[g.group] = true; });
            setExpanded(expanded);
        } catch { /* silent */ }
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
        <div style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: "var(--font-inter), -apple-system, sans-serif" }}>

            {/* Header */}
            <header style={{ height: 56, background: '#fff', borderBottom: '1px solid #d2d2d7', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
                <Link href="/" style={{ color: '#6e6e73', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>← Dashboard</Link>
                <span style={{ color: '#d2d2d7' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Cpu size={14} color="#0066cc" />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.02em' }}>Platform MCP Configuration</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: '#424245', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={11} /> Refresh
                    </button>
                    <CopyBtn text={envTemplate} />
                </div>
            </header>

            <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Explainer */}
                <div style={{ background: '#fff', border: '1px solid #d2d2d7', borderRadius: 18, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,102,204,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Cpu size={18} color="#0066cc" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1d1d1f', marginBottom: 6 }}>Platform-wide MCP Servers</div>
                            <p style={{ margin: 0, fontSize: 13, color: '#424245', lineHeight: 1.6, maxWidth: 640 }}>
                                These are <strong>generic MCP connections that work across the entire product</strong> — every agent,
                                every tenant, every workspace. Set the environment variable once in your deployment config
                                and all agents automatically get access. No per-tenant registration needed.
                            </p>
                            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ padding: '8px 14px', borderRadius: 10, background: '#f5f5f7', border: '1px solid #e5e5ea', fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: '#1d1d1f' }}>How it works: </span>
                                    <code style={{ fontFamily: 'ui-monospace, monospace', color: '#0066cc' }}>MCP_GITHUB_URL=http://mcp-github:3100</code>
                                    <span style={{ color: '#6e6e73' }}> → every developer agent across all tenants gets GitHub MCP</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats */}
                    {data && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
                            {[
                                { label: 'Total MCP connectors', value: data.total, color: '#1d1d1f' },
                                { label: 'Configured (env var set)', value: data.configured, color: '#1a7a4a' },
                                { label: 'Not configured', value: data.total - data.configured, color: data.configured < data.total ? '#b45309' : '#aeaeb2' },
                            ].map(({ label, value, color }) => (
                                <div key={label} style={{ padding: '12px 16px', background: '#f5f5f7', borderRadius: 12, border: '1px solid #e5e5ea' }}>
                                    <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
                                    <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 4 }}>{label}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* How to configure callout */}
                <div style={{ padding: '14px 18px', background: 'rgba(180,83,9,0.05)', border: '1px solid rgba(180,83,9,0.2)', borderRadius: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 6 }}>⚙️ How to configure</div>
                    <div style={{ fontSize: 13, color: '#424245', lineHeight: 1.6 }}>
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
                        style={{ flex: 1, maxWidth: 320, padding: '8px 12px', borderRadius: 9999, border: '1px solid #d2d2d7', background: '#fff', color: '#1d1d1f', fontSize: 13, outline: 'none' }} />
                    <button onClick={() => setFilterUnconfigured(v => !v)}
                        style={{ padding: '7px 14px', borderRadius: 9999, border: `1px solid ${filterUnconfigured ? 'rgba(180,83,9,0.4)' : '#d2d2d7'}`, background: filterUnconfigured ? 'rgba(180,83,9,0.08)' : '#fff', color: filterUnconfigured ? '#b45309' : '#424245', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                        {filterUnconfigured ? '✓ Showing unconfigured only' : 'Show unconfigured only'}
                    </button>
                </div>

                {/* Groups */}
                {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[1,2,3,4].map(i => <div key={i} style={{ height: 120, borderRadius: 16, background: '#f5f5f7' }} />)}
                    </div>
                ) : (
                    filtered?.map(group => {
                        const isExpanded = expanded[group.group] !== false;
                        const configuredCount = group.connectors.filter(c => c.configured).length;
                        return (
                            <div key={group.group} style={{ background: '#fff', border: '1px solid #d2d2d7', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                {/* Group header */}
                                <button type="button"
                                    onClick={() => setExpanded(p => ({ ...p, [group.group]: !isExpanded }))}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#1d1d1f' }}>{group.group}</span>
                                        <span style={{ fontSize: 12, color: '#6e6e73', marginLeft: 10 }}>
                                            {configuredCount}/{group.connectors.length} configured
                                        </span>
                                    </div>
                                    {/* Mini progress */}
                                    <div style={{ width: 80, height: 4, borderRadius: 9999, background: '#f0f0f2', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', borderRadius: 9999, background: configuredCount === group.connectors.length ? '#1a7a4a' : configuredCount > 0 ? '#b45309' : '#aeaeb2', width: `${group.connectors.length > 0 ? (configuredCount / group.connectors.length) * 100 : 0}%`, transition: 'width 0.5s ease' }} />
                                    </div>
                                    {isExpanded ? <ChevronUp size={15} color="#6e6e73" /> : <ChevronDown size={15} color="#6e6e73" />}
                                </button>

                                {/* Connectors grid */}
                                {isExpanded && (
                                    <div style={{ borderTop: '1px solid #f0f0f2', padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10 }}>
                                        {group.connectors.map(c => (
                                            <div key={c.id} style={{
                                                padding: '12px 14px', borderRadius: 12,
                                                border: `1px solid ${c.configured ? 'rgba(26,122,74,0.25)' : '#e5e5ea'}`,
                                                background: c.configured ? 'rgba(26,122,74,0.04)' : '#f9f9f9',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.configured ? '#1a7a4a' : '#aeaeb2', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f' }}>{c.label}</span>
                                                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: c.configured ? '#1a7a4a' : '#aeaeb2' }}>
                                                        {c.configured ? '✓ SET' : 'NOT SET'}
                                                    </span>
                                                </div>
                                                <code style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#6e6e73', display: 'block', marginBottom: 6 }}>
                                                    {c.envVar}
                                                </code>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                    {c.agents.map(a => (
                                                        <span key={a} style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 9999, background: AGENT_COLORS[a] ?? 'rgba(0,0,0,0.05)', color: '#424245' }}>
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
