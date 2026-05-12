"use client";
import { useState, useEffect, useCallback } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Download,
    RefreshCw,
    KeyRound,
    Settings2,
    Shield,
    UserCheck,
    type LucideIcon,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type AuditEventRecord = {
    id: string;
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    tenantId: string;
    beforeState: string;
    afterState: string;
    reason: string;
    createdAt: number;
};

const ACTION_CONFIG: Record<string, { icon: LucideIcon; badge: string; category: string }> = {
    "user.role_change": { icon: UserCheck, badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", category: "User Change" },
    "user.signup": { icon: UserCheck, badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", category: "User Change" },
    "user.login": { icon: UserCheck, badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300", category: "User Change" },
    "user.logout": { icon: UserCheck, badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", category: "User Change" },
    "session.revoked": { icon: KeyRound, badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", category: "Security" },
    "bot.status_change": { icon: Settings2, badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", category: "Agent Action" },
    "bot.config_change": { icon: Settings2, badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", category: "Agent Action" },
    "incident.resolved": { icon: CheckCircle2, badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", category: "System" },
    "incident.assigned": { icon: AlertTriangle, badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300", category: "System" },
    "tenant.created": { icon: Shield, badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300", category: "System" },
};

const DEFAULT_CONFIG = { icon: Settings2, badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", category: "System" };

const CATEGORIES = ["All", "User Change", "Agent Action", "Security", "System"] as const;
type Category = (typeof CATEGORIES)[number];

function formatTs(ts: number): string {
    return new Date(ts).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    });
}

function relativeTime(ts: number): string {
    const delta = Date.now() - ts;
    if (delta < 60_000) return "just now";
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return `${Math.floor(delta / 86_400_000)}d ago`;
}

function clientDownloadCsv(events: AuditEventRecord[]) {
    const header = "id,actor_email,action,target_type,target_id,tenant_id,reason,before_state,after_state,created_at";
    const esc = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = events.map((e) =>
        [e.id, esc(e.actorEmail), esc(e.action), esc(e.targetType), esc(e.targetId), esc(e.tenantId), esc(e.reason), esc(e.beforeState), esc(e.afterState), String(e.createdAt)].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function AuditPage() {
    const [events, setEvents] = useState<AuditEventRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState<Category>("All");
    const [search, setSearch] = useState("");

    const loadEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/audit-log?limit=200", { cache: "no-store" });
            if (!res.ok) {
                const body = (await res.json()) as { error?: string };
                throw new Error(body.error ?? "Failed to load audit log");
            }
            const data = (await res.json()) as { events: AuditEventRecord[] };
            setEvents(data.events ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadEvents();
    }, [loadEvents]);

    const filtered = events.filter((evt) => {
        const cfg = ACTION_CONFIG[evt.action] ?? DEFAULT_CONFIG;
        const catMatch = category === "All" || cfg.category === category;
        const q = search.trim().toLowerCase();
        const textMatch =
            !q ||
            evt.actorEmail.toLowerCase().includes(q) ||
            evt.action.toLowerCase().includes(q) ||
            evt.targetId.toLowerCase().includes(q) ||
            evt.reason.toLowerCase().includes(q);
        return catMatch && textMatch;
    });

    return (
        <div className="site-shell min-h-screen">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <PremiumIcon
                            icon={ClipboardList}
                            tone="violet"
                            containerClassName="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 shrink-0 text-violet-600 dark:text-violet-400"
                            iconClassName="w-5 h-5"
                        />
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Admin Audit Log</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Every admin action — who changed what, and when
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!loading && (
                            <span className="text-xs text-slate-400 dark:text-slate-500">{filtered.length} events</span>
                        )}
                        <button
                            onClick={() => void loadEvents()}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                        </button>
                        <button
                            onClick={() => clientDownloadCsv(filtered)}
                            disabled={loading || filtered.length === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            <Download className="w-3.5 h-3.5" /> Export CSV
                        </button>
                    </div>
                </div>

                <div className="mt-3">
                    <input
                        type="search"
                        placeholder="Search by actor, action, target, or reason…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                </div>

                <div className="flex gap-1 mt-3 flex-wrap">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setCategory(cat)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${category === cat
                                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {loading ? (
                    <div className="space-y-3 animate-pulse">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="h-16 rounded-xl bg-slate-200 dark:bg-slate-800" />
                        ))}
                    </div>
                ) : error ? (
                    <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-4 text-sm text-rose-700 dark:text-rose-300">
                        <strong>Error:</strong> {error}
                        <button onClick={() => void loadEvents()} className="ml-3 underline text-rose-600 dark:text-rose-400">
                            Retry
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-12 text-center">
                        <PremiumIcon
                            icon={ClipboardList}
                            tone="slate"
                            containerClassName="mx-auto mb-3 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                            iconClassName="w-5 h-5"
                        />
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No audit events found</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {search ? "Try adjusting your search." : "Admin actions will appear here as they happen."}
                        </p>
                    </div>
                ) : (
                    <div className="relative">
                        <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-800" />
                        <div className="space-y-1">
                            {filtered.map((evt) => {
                                const cfg = ACTION_CONFIG[evt.action] ?? DEFAULT_CONFIG;
                                const Icon = cfg.icon;
                                let beforeObj: Record<string, unknown> = {};
                                let afterObj: Record<string, unknown> = {};
                                try { beforeObj = JSON.parse(evt.beforeState) as Record<string, unknown>; } catch { /* ignore */ }
                                try { afterObj = JSON.parse(evt.afterState) as Record<string, unknown>; } catch { /* ignore */ }
                                const hasDiff = Object.keys(beforeObj).length > 0 || Object.keys(afterObj).length > 0;

                                return (
                                    <div
                                        key={evt.id}
                                        className="relative flex gap-4 pl-14 pr-4 py-4 rounded-xl hover:bg-white dark:hover:bg-slate-900/60 transition-colors"
                                    >
                                        <div className="absolute left-2 top-3.5">
                                            <PremiumIcon
                                                icon={Icon}
                                                tone="slate"
                                                containerClassName={`h-6 w-6 rounded-full ${cfg.badge} ring-2 ring-slate-50 dark:ring-slate-950`}
                                                iconClassName="w-3 h-3"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                                                    {evt.actorEmail}
                                                </span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
                                                    {evt.action}
                                                </span>
                                                {evt.targetType && (
                                                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                                        {evt.targetType}:{evt.targetId}
                                                    </span>
                                                )}
                                            </div>
                                            {evt.reason && (
                                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-snug">
                                                    {evt.reason}
                                                </p>
                                            )}
                                            {hasDiff && (
                                                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-mono">
                                                    {Object.keys(beforeObj).length > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400">
                                                            before: {JSON.stringify(beforeObj)}
                                                        </span>
                                                    )}
                                                    {Object.keys(afterObj).length > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                                                            after: {JSON.stringify(afterObj)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                                                {formatTs(evt.createdAt)} · {relativeTime(evt.createdAt)}
                                            </p>
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
