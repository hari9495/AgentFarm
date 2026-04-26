"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Activity, LifeBuoy, Bot } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface TenantRecord {
    id: string;
    name: string;
    plan: string;
    status: string;
    region: string;
    mrrCents: number;
    openInvoices: number;
    lastHeartbeatAt: number;
    createdAt: number;
}

interface FleetBotRecord {
    id: string;
    tenantId: string;
    tenantName: string;
    botSlug: string;
    displayName: string;
    status: string;
    reliabilityPct: number;
    tasksCompleted: number;
    lastActivityAt: number;
}

interface IncidentRecord {
    id: string;
    tenantId: string;
    tenantName: string;
    title: string;
    severity: string;
    status: string;
    source: string;
    assigneeEmail: string;
    createdAt: number;
    resolvedAt: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function money(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(cents / 100);
}

function formatAgo(ts: number | null | undefined) {
    if (!ts) return "—";
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

const severityBadge: Record<string, string> = {
    low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    critical: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

const statusBadge: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    maintenance: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    error: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    open: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    investigating: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

// ── Component ──────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();

    const [authorized, setAuthorized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [tenant, setTenant] = useState<TenantRecord | null>(null);
    const [fleet, setFleet] = useState<FleetBotRecord[]>([]);
    const [incidents, setIncidents] = useState<IncidentRecord[]>([]);

    // ── Auth check ────────────────────────────────────────────────────────

    useEffect(() => {
        const checkAccess = async () => {
            try {
                const res = await fetch("/api/auth/session", { cache: "no-store" });
                if (!res.ok) {
                    router.replace("/login");
                    return;
                }
                const data = await res.json().catch(() => null);
                if (!data?.isCompanyOperator) {
                    router.replace("/");
                    return;
                }
                setAuthorized(true);
            } catch {
                router.replace("/login");
            }
        };
        void checkAccess();
    }, [router]);

    // ── Load tenant detail ────────────────────────────────────────────────

    useEffect(() => {
        if (!authorized || !params.id) return;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/superadmin/tenants/${params.id}`, { cache: "no-store" });
                const data = await res.json();
                if (!res.ok) { setError(data.error ?? "Failed to load tenant"); return; }
                setTenant(data.tenant ?? null);
                setFleet(data.fleet ?? []);
                setIncidents(data.incidents ?? []);
            } catch {
                setError("Network error loading tenant.");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [authorized, params.id]);

    // ── Render ────────────────────────────────────────────────────────────

    if (!authorized || loading) {
        return (
            <div className="site-shell min-h-screen flex items-center justify-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">{loading ? "Loading…" : "Checking access…"}</p>
            </div>
        );
    }

    if (error || !tenant) {
        return (
            <div className="site-shell min-h-screen flex flex-col items-center justify-center gap-4">
                <p className="text-sm text-rose-600 dark:text-rose-400">{error ?? "Tenant not found."}</p>
                <Link href="/company" className="text-xs text-violet-600 dark:text-violet-400 underline">← Back to portal</Link>
            </div>
        );
    }

    const openIncidents = incidents.filter((i) => i.status !== "resolved");

    return (
        <div className="site-shell min-h-screen px-4 py-8">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Back link */}
                <Link href="/company"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Company Portal
                </Link>

                {/* Tenant header */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{tenant.name}</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                                {tenant.region} · {tenant.plan} plan
                            </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadge[tenant.status] ?? "bg-slate-100 text-slate-700"}`}>
                            {tenant.status}
                        </span>
                    </div>
                    <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">MRR</p>
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{money(tenant.mrrCents)}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Open Invoices</p>
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{tenant.openInvoices}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Fleet Bots</p>
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{fleet.length}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Open Incidents</p>
                            <p className={`text-xl font-bold mt-1 ${openIncidents.length > 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"}`}>
                                {openIncidents.length}
                            </p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                        Last heartbeat: {formatAgo(tenant.lastHeartbeatAt)} · Tenant since {formatAgo(tenant.createdAt)}
                    </p>
                </div>

                {/* Fleet Bots */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                        <Bot className="w-4 h-4 text-violet-500" />
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Fleet Bots</h2>
                        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{fleet.length} bot(s)</span>
                    </div>
                    {fleet.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">No bots provisioned for this tenant.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Bot</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Reliability</th>
                                        <th className="text-left px-4 py-3">Tasks</th>
                                        <th className="text-left px-4 py-3">Last Activity</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {fleet.map((bot) => (
                                        <tr key={bot.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                            <td className="px-5 py-3.5">
                                                <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{bot.displayName}</p>
                                                <p className="text-xs text-slate-500 dark:text-slate-400">{bot.botSlug}</p>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge[bot.status] ?? "bg-slate-100 text-slate-700"}`}>
                                                    <Activity className="w-3 h-3" />
                                                    {bot.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200">{bot.reliabilityPct}%</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{bot.tasksCompleted}</td>
                                            <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatAgo(bot.lastActivityAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Open Incidents */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                        <LifeBuoy className="w-4 h-4 text-rose-500" />
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Incidents</h2>
                        {openIncidents.length > 0 && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                                {openIncidents.length} open
                            </span>
                        )}
                        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">{incidents.length} total</span>
                    </div>
                    {incidents.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-400 dark:text-slate-500">No incidents for this tenant.</div>
                    ) : (
                        <div className="p-4 space-y-2">
                            {incidents.map((incident) => (
                                <div key={incident.id}
                                    className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{incident.title}</p>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${severityBadge[incident.severity] ?? "bg-slate-100 text-slate-700"}`}>
                                                {incident.severity}
                                            </span>
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge[incident.status] ?? "bg-slate-100 text-slate-700"}`}>
                                                {incident.status}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        {incident.source} · Opened {formatAgo(incident.createdAt)}
                                        {incident.assigneeEmail ? <span className="ml-2 text-violet-600 dark:text-violet-400">→ {incident.assigneeEmail}</span> : null}
                                        {incident.resolvedAt ? <span className="ml-2 text-emerald-600 dark:text-emerald-400">Resolved {formatAgo(incident.resolvedAt)}</span> : null}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
