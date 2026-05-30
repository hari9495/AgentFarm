"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
    Plus, Trash2, RefreshCw, CheckCircle2,
    AlertCircle, Radio, Cpu, ExternalLink,
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

const inp = "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-slate-400 dark:placeholder:text-slate-500";
const lbl = "block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5";

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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">

            {/* ── Page header ──────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0 mt-0.5">
                            <Cpu className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                MCP Servers
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
                                Register Model Context Protocol servers to give your agents access to
                                your internal tools — filesystems, APIs, databases, browser automation, and more.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {servers.length > 0 && (
                            <div className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 ${activeCount > 0 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                                <span className={`w-2 h-2 rounded-full ${activeCount > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                                {activeCount} of {servers.length} active
                            </div>
                        )}
                        <Link href="/dashboard/integrations" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> Standard connectors
                        </Link>
                        <button
                            onClick={() => setShowForm(v => !v)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {showForm ? "Cancel" : "Add MCP Server"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* ── What is MCP — shown only when no servers yet ── */}
                {!loading && servers.length === 0 && !showForm && (
                    <div className="rounded-2xl border border-sky-200 dark:border-sky-900/40 bg-sky-50/50 dark:bg-sky-950/10 p-6">
                        <div className="flex items-start gap-3 mb-5">
                            <Cpu className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                                    What is an MCP server?
                                </p>
                                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                                    MCP (Model Context Protocol) is a standard way to connect AI agents to your internal tools.
                                    You run a small MCP server that wraps your internal API, database, or tool — then register it here.
                                    Your agents automatically discover it and gain access to all the actions it exposes.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {USE_CASES.map(({ icon, title, desc }) => (
                                <div key={title} className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
                                    <div className="text-2xl mb-2">{icon}</div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">{title}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{desc}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-5 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">How to connect your tool in 3 steps</p>
                            <ol className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                                    Build a small MCP server that wraps your internal tool (Anthropic provides SDKs for Python, TypeScript, and Go — takes ~30 min)
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                                    Deploy it inside your infrastructure so it has a reachable URL
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                                    Register the URL here → click <strong>Ping</strong> to verify → agents start using it on their next task
                                </li>
                            </ol>
                        </div>
                        <button
                            onClick={() => setShowForm(true)}
                            className="mt-5 flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" /> Register your first MCP server
                        </button>
                    </div>
                )}

                {/* ── Add form ────────────────────────────────────────── */}
                {showForm && (
                    <div className="rounded-2xl border-2 border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-sky-50/40 dark:bg-sky-950/10">
                            <p className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-widest mb-0.5">Register MCP Server</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Point to your MCP endpoint. Agents will discover it automatically on their next task.
                            </p>
                        </div>

                        <form onSubmit={addServer} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={lbl}>Server Name <span className="text-rose-500">*</span></label>
                                    <input value={addName} onChange={e => setAddName(e.target.value)} className={inp} placeholder="e.g. Inventory API Server" required />
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">A friendly name your team will recognise</p>
                                </div>
                                <div>
                                    <label className={lbl}>Server URL <span className="text-rose-500">*</span></label>
                                    <input value={addUrl} onChange={e => setAddUrl(e.target.value)} type="url" className={inp} placeholder="https://mcp.yourcompany.com" required />
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">The MCP endpoint your agents connect to</p>
                                </div>
                            </div>

                            <div>
                                <label className={lbl}>Workspace scope <span className="font-normal text-slate-400 normal-case">(optional)</span></label>
                                <input value={addWs} onChange={e => setAddWs(e.target.value)} className={`${inp} max-w-xs`} placeholder="Leave blank — available to all agents" />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                    Blank = all agents in your account can use this server.
                                    Fill in a workspace ID to restrict to one team.
                                </p>
                            </div>

                            {/* Security note */}
                            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 px-4 py-3">
                                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                    <strong>Security note:</strong> Your MCP server should only be reachable from AgentFarm's agent runtime IPs.
                                    Do not expose it publicly. Use your firewall or a private network to restrict access.
                                </p>
                            </div>

                            {addError && (
                                <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl px-4 py-2.5">
                                    <AlertCircle className="w-4 h-4 shrink-0" /> {addError}
                                </div>
                            )}

                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit" disabled={adding} className="px-6 py-2.5 rounded-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold transition-colors">
                                    {adding ? "Registering…" : "Register Server"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* ── Error ───────────────────────────────────────────── */}
                {error && (
                    <div className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl px-4 py-3">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}

                {/* ── Loading skeletons ────────────────────────────────── */}
                {loading && (
                    <div className="space-y-3">
                        {[1, 2].map(i => (
                            <div key={i} className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
                        ))}
                    </div>
                )}

                {/* ── Server list ──────────────────────────────────────── */}
                {!loading && servers.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                                Your MCP Servers
                                <span className="font-normal text-slate-400 normal-case ml-1">({servers.length})</span>
                            </h2>
                            <button onClick={load} className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                                <RefreshCw className="w-3 h-3" /> Refresh
                            </button>
                        </div>

                        <div className="space-y-3">
                            {servers.map(server => {
                                const ps = pingStates[server.id];
                                return (
                                    <div key={server.id} className={`rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden shadow-sm transition-colors ${server.isActive ? "border-emerald-200 dark:border-emerald-900/50" : "border-slate-200 dark:border-slate-800"}`}>
                                        <div className="p-5 flex items-start gap-3">
                                            {/* Status dot */}
                                            <div className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${server.isActive ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <p className="font-bold text-slate-900 dark:text-slate-100">{server.name}</p>
                                                    <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${server.isActive ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"}`}>
                                                        {server.isActive ? "Active" : "Inactive"}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-mono text-sky-600 dark:text-sky-400">{server.url}</p>
                                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                                    {server.workspaceId ? `Workspace: ${server.workspaceId}` : "Available to all agents in your account"}
                                                </p>

                                                {/* Ping result */}
                                                {ps && !ps.loading && (
                                                    <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${ps.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        {ps.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                                        {ps.ok
                                                            ? `✓ Reachable — ${ps.latencyMs ?? 0}ms response time`
                                                            : "✗ Unreachable — confirm the server is running and the URL is correct"
                                                        }
                                                    </div>
                                                )}
                                                {ps?.loading && (
                                                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 animate-pulse">Pinging server…</p>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    onClick={() => void ping(server)}
                                                    disabled={ps?.loading}
                                                    className="flex items-center gap-1.5 text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                                                >
                                                    <Radio className="w-3 h-3" />
                                                    {ps?.loading ? "Pinging…" : "Ping"}
                                                </button>
                                                <button
                                                    onClick={() => void remove(server)}
                                                    className="flex items-center gap-1.5 text-xs font-semibold border border-rose-200 dark:border-rose-900 text-rose-500 dark:text-rose-400 rounded-lg px-3 py-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
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
    );
}
