"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, RefreshCw, Plug } from "lucide-react";

type CatalogConnector = {
    id: string;
    displayName: string;
    category: string;
    description: string;
    tools: string[];
    supportedRoles: string[];
    live?: boolean;
};

export default function ConnectorStatusPage() {
    const [connectors, setConnectors] = useState<CatalogConnector[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch("/api/mcp/catalog", { cache: "no-store" });
            const data = await res.json() as { catalog?: CatalogConnector[]; error?: string };
            if (!res.ok) { setError(data.error ?? "Failed to load catalog"); return; }
            setConnectors(Array.isArray(data.catalog) ? data.catalog : []);
        } catch { setError("Network error"); }
        finally { setLoading(false); }
    };

    useEffect(() => { void load(); }, []);

    const liveCount = connectors.filter(c => c.live).length;
    const total = connectors.length;

    const byCategory = useMemo(() => {
        const groups: Record<string, CatalogConnector[]> = {};
        for (const c of connectors) (groups[c.category] ??= []).push(c);
        return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
    }, [connectors]);

    return (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Plug className="w-5 h-5 text-emerald-600" /> Connector provisioning status
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Managed Tier-2 connectors. <strong>Live</strong> means its hosted MCP proxy is provisioned and customers can activate it.
                        Flip a connector to live by setting <code className="text-xs">live: true</code> in the catalog after following the
                        MCP connector proxy provisioning runbook.
                    </p>
                </div>
                <button onClick={() => void load()} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                </button>
            </header>

            {/* Summary */}
            {!loading && !error && (
                <div className="grid grid-cols-3 gap-4">
                    <Stat label="Total connectors" value={total} tone="slate" />
                    <Stat label="Live" value={liveCount} tone="emerald" />
                    <Stat label="Coming soon" value={total - liveCount} tone="amber" />
                </div>
            )}

            {error && <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 text-sm">{error}</div>}
            {loading && <div className="text-sm text-slate-400">Loading catalog…</div>}

            {!loading && !error && byCategory.map(([category, list]) => (
                <section key={category}>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{category}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {list.map(c => (
                            <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{c.displayName}</p>
                                        <p className="text-[11px] text-slate-400">{c.tools.length} tools · {c.supportedRoles.length} roles</p>
                                    </div>
                                    {c.live ? (
                                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full px-2 py-0.5">
                                            <CheckCircle2 className="w-3 h-3" /> Live
                                        </span>
                                    ) : (
                                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-full px-2 py-0.5">
                                            <Clock className="w-3 h-3" /> Coming soon
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "slate" | "emerald" | "amber" }) {
    const tones: Record<string, string> = {
        slate: "text-slate-900 dark:text-slate-100",
        emerald: "text-emerald-600 dark:text-emerald-400",
        amber: "text-amber-600 dark:text-amber-400",
    };
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${tones[tone]}`}>{value}</p>
        </div>
    );
}
