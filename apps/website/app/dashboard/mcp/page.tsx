"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Plus, Trash2, RefreshCw, CheckCircle2,
    AlertCircle, Radio, Cpu, ChevronRight, ExternalLink,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type McpServer = {
    id: string;
    name: string;
    url: string;
    workspaceId: string | null;
    isActive: boolean;
};

type PingState = { loading: boolean; ok?: boolean; latencyMs?: number };

// ── Shared styles ─────────────────────────────────────────────────────────────

const inp = "w-full border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] text-[color:var(--ink)] dark:text-[color:var(--ink)] rounded-[3px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] placeholder:text-[color:var(--ink-muted)] dark:placeholder:text-[color:var(--ink-muted)]";
const lbl = "block text-xs font-bold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-1.5";

// ── What MCP does — use-case cards ────────────────────────────────────────────

const USE_CASES = [
    { icon: "🌐", title: "External APIs",    desc: "Connect agents to your internal REST or GraphQL microservices via MCP tool wrappers." },
    { icon: "📁", title: "File systems",     desc: "Give agents controlled read/write access to files on your infrastructure." },
    { icon: "🖥️", title: "Browser control",  desc: "Let agents automate browsers — form filling, web research, scraping." },
    { icon: "🔌", title: "Custom tools",     desc: "Wrap any internal tool in an MCP server and agents can use it immediately." },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerMcpPage() {
    const [servers, setServers]       = useState<McpServer[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [pingStates, setPingStates] = useState<Record<string, PingState>>({});

    // Add form
    const [showForm, setShowForm] = useState(false);
    const [addName, setAddName]   = useState("");
    const [addUrl, setAddUrl]     = useState("");
    const [addWs, setAddWs]       = useState("");
    const [adding, setAdding]     = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/mcp");
            const data = await res.json() as McpServer[] | { error?: string };
            if (!res.ok) { setError((data as { error?: string }).error ?? "Failed to load MCP servers"); return; }
            setServers(Array.isArray(data) ? data : []);
        } catch { setError("Network error. Please try again."); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const addServer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addName.trim() || !addUrl.trim()) { setAddError("Name and URL are required."); return; }
        setAdding(true); setAddError(null);
        try {
            const res = await fetch("/api/mcp", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: addName.trim(), url: addUrl.trim(), workspaceId: addWs.trim() || undefined }),
            });
            const data = await res.json() as { error?: string; message?: string };
            if (!res.ok) { setAddError(data.message ?? data.error ?? "Failed to add server."); return; }
            setAddName(""); setAddUrl(""); setAddWs(""); setShowForm(false);
            await load();
        } catch { setAddError("Network error. Please try again."); }
        finally { setAdding(false); }
    };

    const remove = async (server: McpServer) => {
        if (!confirm(`Remove "${server.name}" from your workspace? Agents will lose access to its tools.`)) return;
        try {
            await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, { method: "DELETE" });
            await load();
        } catch { /* silent */ }
    };

    const ping = async (server: McpServer) => {
        setPingStates(p => ({ ...p, [server.id]: { loading: true } }));
        try {
            const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}/ping`);
            const data = await res.json() as { ok?: boolean; latencyMs?: number };
            setPingStates(p => ({ ...p, [server.id]: { loading: false, ok: data.ok ?? false, latencyMs: data.latencyMs } }));
        } catch { setPingStates(p => ({ ...p, [server.id]: { loading: false, ok: false } })); }
    };

    const activeCount = servers.filter(s => s.isActive).length;

    return (
        <div className="min-h-screen bg-[var(--bg-deep)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <Cpu className="w-3.5 h-3.5" />
                                MCP Servers
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Model Context Protocol</span>
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">MCP Servers</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Register Model Context Protocol servers to give agents access to your internal tools.</p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <Link href="/dashboard/integrations" className="text-xs text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors flex items-center gap-1">
                                    <ExternalLink className="w-3 h-3" /> Standard connectors
                                </Link>
                                <button
                                    onClick={() => setShowForm(v => !v)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    {showForm ? "Cancel" : "+ Add MCP Server"}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Tier 2: browse the managed tool catalog ───────────── */}
                <ConnectToolCatalog onActivated={load} />

                <div className="space-y-6">

                {/* ── What is MCP — shown only when no servers yet ── */}
                {!loading && servers.length === 0 && !showForm && (
                    <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/50 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10 p-6">
                        <div className="flex items-start gap-3 mb-5">
                            <Cpu className="w-5 h-5 text-[color:var(--accent)] dark:text-[color:var(--accent)] shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-1">
                                    What is an MCP server?
                                </p>
                                <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] leading-relaxed">
                                    MCP (Model Context Protocol) is a standard way to connect AI agents to your internal tools.
                                    You run a small MCP server that wraps your internal API, database, or tool — then register it here.
                                    Your agents automatically discover it and gain access to all the actions it exposes.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {USE_CASES.map(({ icon, title, desc }) => (
                                <div key={title} className="rounded-[3px] bg-[var(--card)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)] p-4">
                                    <div className="text-2xl mb-2">{icon}</div>
                                    <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-1">{title}</p>
                                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] leading-relaxed">{desc}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-5 p-4 rounded-[3px] bg-[var(--card)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)]">
                            <p className="text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wider mb-2">How to connect your tool in 3 steps</p>
                            <ol className="space-y-1.5 text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                                    Build a small MCP server that wraps your internal tool (Anthropic provides SDKs for Python, TypeScript, and Go — takes ~30 min)
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                                    Deploy it inside your infrastructure so it has a reachable URL
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                                    Register the URL here → click <strong>Ping</strong> to verify → agents start using it on their next task
                                </li>
                            </ol>
                        </div>
                        <button
                            onClick={() => setShowForm(true)}
                            className="mt-5 flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-bold transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Register your first MCP server
                        </button>
                    </div>
                )}

                {/* ── Add form ────────────────────────────────────────── */}
                {showForm && (
                    <div className="rounded-[4px] border-2 border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/40 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10">
                            <p className="text-xs font-bold text-[color:var(--accent)] dark:text-[color:var(--accent)] uppercase tracking-widest mb-0.5">Register MCP Server</p>
                            <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                Point to your MCP endpoint. Agents will discover it automatically on their next task.
                            </p>
                        </div>

                        <form onSubmit={addServer} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={lbl}>Server Name <span className="text-[color:var(--danger)]">*</span></label>
                                    <input value={addName} onChange={e => setAddName(e.target.value)} className={inp} placeholder="e.g. Inventory API Server" required />
                                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">A friendly name your team will recognise</p>
                                </div>
                                <div>
                                    <label className={lbl}>Server URL <span className="text-[color:var(--danger)]">*</span></label>
                                    <input value={addUrl} onChange={e => setAddUrl(e.target.value)} type="url" className={inp} placeholder="https://mcp.yourcompany.com" required />
                                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">The MCP endpoint your agents connect to</p>
                                </div>
                            </div>

                            <div>
                                <label className={lbl}>Workspace scope <span className="font-normal text-[color:var(--ink-muted)] normal-case">(optional)</span></label>
                                <input value={addWs} onChange={e => setAddWs(e.target.value)} className={`${inp} max-w-xs`} placeholder="Leave blank — available to all agents" />
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">
                                    Blank = all agents in your account can use this server.
                                    Fill in a workspace ID to restrict to one team.
                                </p>
                            </div>

                            {/* Security note */}
                            <div className="rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/20 border border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]/40 px-4 py-3">
                                <p className="text-xs text-[color:var(--warn)] dark:text-[color:var(--warn)] leading-relaxed">
                                    <strong>Security note:</strong> Your MCP server should only be reachable from AgentFarm's agent runtime IPs.
                                    Do not expose it publicly. Use your firewall or a private network to restrict access.
                                </p>
                            </div>

                            {addError && (
                                <div className="flex items-center gap-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 rounded-[3px] px-4 py-2.5">
                                    <AlertCircle className="w-4 h-4 shrink-0" /> {addError}
                                </div>
                            )}

                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-full border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] text-sm font-semibold hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={adding} className="px-6 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 text-white text-sm font-bold transition-colors">
                                    {adding ? "Registering…" : "Register Server"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── Error ───────────────────────────────────────────── */}
                {error && (
                    <div className="flex items-center gap-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 rounded-[3px] px-4 py-3">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                {/* ── Loading skeletons ────────────────────────────────── */}
                {loading && (
                    <div className="space-y-3">
                        {[1, 2].map(i => (
                            <div key={i} className="h-24 rounded-[4px] bg-[var(--line)] dark:bg-[var(--card)] animate-pulse" />
                        ))}
                    </div>
                )}

                {/* ── Server list ──────────────────────────────────────── */}
                {!loading && servers.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] uppercase tracking-wide">
                                Your MCP Servers
                                <span className="font-normal text-[color:var(--ink-muted)] normal-case ml-1">({servers.length})</span>
                            </h2>
                            <button onClick={load} className="flex items-center gap-1.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] dark:hover:text-[color:var(--ink-muted)] transition-colors">
                                <RefreshCw className="w-3 h-3" /> Refresh
                            </button>
                        </div>

                        <div className="space-y-3">
                            {servers.map(server => {
                                const ps = pingStates[server.id];
                                return (
                                    <div key={server.id} className={`rounded-[4px] border bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden shadow-sm transition-colors ${server.isActive ? "border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/50" : "border-[color:var(--line)] dark:border-[color:var(--line)]"}`}>
                                        <div className="p-5 flex items-start gap-3">
                                            {/* Status dot */}
                                            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${server.isActive ? "bg-[var(--ok)]" : "bg-[var(--bg-deep)] dark:bg-[var(--bg-deep)]"}`} />

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <p className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{server.name}</p>
                                                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${server.isActive ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]"}`}>
                                                        {server.isActive ? "Active" : "Inactive"}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-mono text-[color:var(--accent)] dark:text-[color:var(--accent)]">{server.url}</p>
                                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">
                                                    {server.workspaceId ? `Workspace: ${server.workspaceId}` : "Available to all agents in your account"}
                                                </p>

                                                {/* Ping result */}
                                                {ps && !ps.loading && (
                                                    <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${ps.ok ? "text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "text-[color:var(--danger)] dark:text-[color:var(--danger)]"}`}>
                                                        {ps.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                                        {ps.ok
                                                            ? `✓ Reachable — ${ps.latencyMs ?? 0}ms response time`
                                                            : "✗ Unreachable — confirm the server is running and the URL is correct"
                                                        }
                                                    </div>
                                                )}
                                                {ps?.loading && (
                                                    <p className="mt-2 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] animate-pulse">Pinging server…</p>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => void ping(server)}
                                                    disabled={ps?.loading}
                                                    className="flex items-center gap-1.5 text-xs font-semibold border border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] rounded-[3px] px-3 py-1.5 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] disabled:opacity-50 transition-colors"
                                                >
                                                    <Radio className="w-3 h-3" />
                                                    {ps?.loading ? "Pinging…" : "Ping"}
                                                </button>
                                                <button
                                                    onClick={() => void remove(server)}
                                                    className="flex items-center gap-1.5 text-xs font-semibold border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] text-[color:var(--danger)] dark:text-[color:var(--danger)] rounded-[3px] px-3 py-1.5 hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 transition-colors"
                                                >
                                                    <Trash2 className="w-3 h-3" /> Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                </div>

            </div>
        </div>
    );
}

// ── Tier 2: managed tool catalog (browse → paste token → activate) ──────────────

type CatalogField = { name: string; label: string; type: string; placeholder?: string; helpText?: string };
type CatalogConnector = {
    id: string;
    displayName: string;
    category: string;
    description: string;
    logoSlug: string;
    tools: string[];
    supportedRoles: string[];
    requiredFields: CatalogField[];
    optionalFields?: CatalogField[];
    live?: boolean;
};

function ConnectToolCatalog({ onActivated }: { onActivated: () => void | Promise<void> }) {
    const [catalog, setCatalog] = useState<CatalogConnector[]>([]);
    const [loading, setLoading] = useState(true);
    const [configuring, setConfiguring] = useState<CatalogConnector | null>(null);
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [activated, setActivated] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/mcp/catalog");
                const data = await res.json() as { catalog?: CatalogConnector[] };
                if (!cancelled) setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
            } catch { /* leave empty */ }
            finally { if (!cancelled) setLoading(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    const openConfigure = (c: CatalogConnector) => {
        if (!c.live) return; // coming soon — not yet activatable
        setConfiguring(c);
        setValues({});
        setFormError(null);
    };

    const activate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!configuring) return;
        const missing = configuring.requiredFields.filter(f => !values[f.name]?.trim()).map(f => f.label);
        if (missing.length) { setFormError(`Required: ${missing.join(", ")}`); return; }
        setSaving(true); setFormError(null);
        try {
            const res = await fetch(`/api/mcp/catalog/${encodeURIComponent(configuring.id)}/enable`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            const data = await res.json() as { error?: string; message?: string };
            if (!res.ok) { setFormError(data.message ?? data.error ?? "Failed to activate."); return; }
            setActivated(configuring.displayName);
            setConfiguring(null);
            await onActivated();
            setTimeout(() => setActivated(null), 4000);
        } catch { setFormError("Network error. Please try again."); }
        finally { setSaving(false); }
    };

    if (loading) return null;
    if (catalog.length === 0) return null;

    return (
        <section className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
                <p className="text-xs font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)] uppercase tracking-widest mb-0.5">Connect a tool</p>
                <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                    Pick a tool your team already uses and activate it with an access token — no setup required. Your agents gain its tools on their next task.
                </p>
            </div>

            {activated && (
                <div className="mx-6 mt-4 flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] px-4 py-2.5 text-sm text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                    <CheckCircle2 className="w-4 h-4" /> <strong>{activated}</strong> connected — your agents can use it now.
                </div>
            )}

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {catalog.map((c) => (
                    <div key={c.id} className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-4 flex flex-col">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{c.displayName}</p>
                                <p className="text-xs text-[color:var(--ink-muted)] uppercase tracking-wider">{c.category}</p>
                            </div>
                            {!c.live && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--warn)] dark:text-[color:var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] rounded-full px-2 py-0.5">Coming soon</span>
                            )}
                        </div>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] leading-relaxed flex-1">{c.description}</p>
                        <p className="text-[11px] text-[color:var(--ink-muted)] mt-2">{c.tools.length} tools</p>
                        <button
                            onClick={() => openConfigure(c)}
                            disabled={!c.live}
                            className={`mt-3 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-colors ${c.live ? "bg-[var(--ok)] hover:bg-[var(--ok)] text-[color:var(--ink)]" : "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] cursor-not-allowed"}`}
                        >
                            <Plus className="w-3.5 h-3.5" /> {c.live ? "Connect" : "Coming soon"}
                        </button>
                    </div>
                ))}
            </div>

            {configuring && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfiguring(null)}>
                    <div className="w-full max-w-md rounded-[4px] bg-[var(--card)] dark:bg-[var(--card)] border border-[color:var(--line)] dark:border-[color:var(--line)] shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
                            <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Connect {configuring.displayName}</p>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Enter your {configuring.displayName} credentials. Stored encrypted — never shown again.</p>
                        </div>
                        <form onSubmit={activate} className="p-6 space-y-4">
                            {[...configuring.requiredFields, ...(configuring.optionalFields ?? [])].map((f) => {
                                const required = configuring.requiredFields.some(rf => rf.name === f.name);
                                return (
                                    <div key={f.name}>
                                        <label className={lbl}>{f.label}{required && <span className="text-[color:var(--danger)]"> *</span>}</label>
                                        <input
                                            type={f.type === "secret" ? "password" : "text"}
                                            value={values[f.name] ?? ""}
                                            onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                                            className={inp}
                                            placeholder={f.placeholder}
                                        />
                                        {f.helpText && <p className="text-[11px] text-[color:var(--ink-muted)] mt-1">{f.helpText}</p>}
                                    </div>
                                );
                            })}
                            {formError && (
                                <div className="flex items-center gap-2 text-sm text-[color:var(--danger)]"><AlertCircle className="w-4 h-4" /> {formError}</div>
                            )}
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setConfiguring(null)} className="px-4 py-2.5 rounded-full border border-[color:var(--line)] dark:border-[color:var(--line)] text-sm font-bold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Cancel</button>
                                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 rounded-full bg-[var(--ok)] hover:bg-[var(--ok)] disabled:opacity-60 text-white text-sm font-bold">
                                    {saving ? "Connecting…" : `Connect ${configuring.displayName}`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </section>
    );
}
