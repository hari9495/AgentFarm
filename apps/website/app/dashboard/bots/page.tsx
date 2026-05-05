"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Activity,
    AlertTriangle,
    Bot,
    CheckCircle2,
    Clock,
    RefreshCw,
    ShieldCheck,
    XCircle,
    Zap,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type BotStatus = "active" | "paused" | "error" | "maintenance";

type BotRecord = {
    slug: string;
    name: string;
    role: string;
    tone: string;
    status: BotStatus;
    autonomyLevel: "low" | "medium" | "high";
    approvalPolicy: "all" | "medium-high" | "high-only";
    tasksCompleted: number;
    reliabilityPct: number;
    shiftStart: string;
    shiftEnd: string;
    activeDays: string;
    notes: string;
    lastActivityAt: number;
};

const statusMeta: Record<BotStatus, { label: string; dot: string; badge: string; icon: React.ReactNode }> = {
    active: {
        label: "Active",
        dot: "bg-emerald-500 animate-pulse",
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
        icon: <PremiumIcon icon={CheckCircle2} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-4 h-4" />,
    },
    paused: {
        label: "Paused",
        dot: "bg-amber-400",
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
        icon: <PremiumIcon icon={Clock} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-4 h-4" />,
    },
    error: {
        label: "Error — needs attention",
        dot: "bg-rose-500",
        badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
        icon: <PremiumIcon icon={XCircle} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-4 h-4" />,
    },
    maintenance: {
        label: "Maintenance",
        dot: "bg-slate-400",
        badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        icon: <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-4 h-4" />,
    },
};

const toneClass: Record<string, string> = {
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const autonomyLabel: Record<string, string> = {
    low: "Low autonomy",
    medium: "Medium autonomy",
    high: "High autonomy",
};

const policyLabel: Record<string, string> = {
    all: "All actions need approval",
    "medium-high": "Medium + high risk need approval",
    "high-only": "High risk needs approval",
};

const formatTime = (ts: number) => {
    if (!ts) return "Never";
    const diff = Date.now() - ts;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(ts).toLocaleDateString();
};

export default function DashboardBotsPage() {
    const [bots, setBots] = useState<BotRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const fetchBots = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/bots");
            const data = await res.json();
            if (res.ok) { setBots(data.bots ?? []); setLastRefresh(new Date()); }
            else setError(data.error ?? "Failed to load");
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBots();
        const timer = setInterval(fetchBots, 30000);
        return () => clearInterval(timer);
    }, [fetchBots]);

    const activeCount = bots.filter((b) => b.status === "active").length;
    const errorCount = bots.filter((b) => b.status === "error").length;

    return (
        <div className="site-shell min-h-screen">

            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <PremiumIcon icon={Bot} tone="violet" containerClassName="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-4 h-4" />
                            Bot Status Monitor
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Live status, reliability, and configuration of all AI workers. Auto-refreshes every 30 s.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            Updated {lastRefresh.toLocaleTimeString()}
                        </span>
                        <button
                            onClick={fetchBots}
                            disabled={loading}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                        >
                            <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Summary bar */}
                {!loading && !error && (
                    <div className="mt-4 flex flex-wrap gap-4">
                        <div className="inline-flex items-center gap-2 text-sm">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{activeCount} active</span>
                        </div>
                        {errorCount > 0 && (
                            <div className="inline-flex items-center gap-2 text-sm">
                                <PremiumIcon icon={AlertTriangle} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3.5 h-3.5" />
                                <span className="font-semibold text-rose-600 dark:text-rose-400">{errorCount} bot{errorCount > 1 ? "s" : ""} need attention</span>
                            </div>
                        )}
                        <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <PremiumIcon icon={Bot} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />
                            {bots.length} total workers
                        </div>
                    </div>
                )}
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {loading && bots.length === 0 ? (
                    <p className="text-slate-400 dark:text-slate-500 text-sm py-12 text-center">Loading bot status…</p>
                ) : error ? (
                    <p className="text-rose-500 text-sm py-12 text-center">{error}</p>
                ) : (
                    <>
                        {/* Error alerts */}
                        {errorCount > 0 && (
                            <div className="mb-6 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3.5 flex items-start gap-3">
                                <PremiumIcon icon={AlertTriangle} tone="rose" containerClassName="w-6 h-6 mt-0.5 shrink-0 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3.5 h-3.5" />
                                <div>
                                    <p className="text-sm font-semibold text-rose-800 dark:text-rose-300">
                                        {errorCount} bot{errorCount > 1 ? "s require" : " requires"} admin attention
                                    </p>
                                    <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                                        {bots.filter((b) => b.status === "error").map((b) => b.name).join(", ")}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Bot cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {bots.map((bot) => {
                                const meta = statusMeta[bot.status];
                                return (
                                    <article key={bot.slug} className={`rounded-2xl border bg-white dark:bg-slate-900 overflow-hidden transition-shadow hover:shadow-md ${bot.status === "error" ? "border-rose-300 dark:border-rose-700" : "border-slate-200 dark:border-slate-800"}`}>

                                        {/* Status bar */}
                                        <div className={`h-1 w-full ${bot.status === "active" ? "bg-emerald-500" : bot.status === "paused" ? "bg-amber-400" : bot.status === "error" ? "bg-rose-500" : "bg-slate-400"}`} />

                                        <div className="p-5">
                                            {/* Top row */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                                                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">{bot.name}</h2>
                                                    </div>
                                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[bot.tone] ?? toneClass.sky}`}>
                                                        {bot.role}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {meta.icon}
                                                    <span className={`inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-1 ${meta.badge}`}>
                                                        {meta.label}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Metrics */}
                                            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 flex flex-col gap-0.5">
                                                    <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Tasks</span>
                                                    <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                                        <PremiumIcon icon={Activity} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName="w-3 h-3" />{bot.tasksCompleted}
                                                    </span>
                                                </div>
                                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 flex flex-col gap-0.5">
                                                    <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Reliability</span>
                                                    <span className={`font-bold flex items-center gap-1 ${bot.reliabilityPct >= 99 ? "text-emerald-600 dark:text-emerald-400" : bot.reliabilityPct >= 97 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                                                        <PremiumIcon icon={Zap} tone="amber" containerClassName="w-5 h-5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3 h-3" />{bot.reliabilityPct}%
                                                    </span>
                                                </div>
                                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2.5 flex flex-col gap-0.5">
                                                    <span className="text-slate-400 dark:text-slate-500 uppercase tracking-wide text-[10px] font-semibold">Last Active</span>
                                                    <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                                                        <PremiumIcon icon={Clock} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName="w-3 h-3" />{formatTime(bot.lastActivityAt)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Config summary */}
                                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">
                                                    <PremiumIcon icon={ShieldCheck} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName="w-3 h-3" />{autonomyLabel[bot.autonomyLevel]}
                                                </span>
                                                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-slate-600 dark:text-slate-300">
                                                    {policyLabel[bot.approvalPolicy]}
                                                </span>
                                            </div>

                                            {/* Shift */}
                                            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                                                <PremiumIcon icon={Clock} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3 h-3" />
                                                <span>Works {bot.shiftStart}–{bot.shiftEnd} on {bot.activeDays.toUpperCase()}</span>
                                            </div>

                                            {/* Admin notes */}
                                            {bot.notes && (
                                                <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                                                    <span className="font-semibold">Note:</span> {bot.notes}
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="mt-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wide">Status legend</p>
                            <div className="flex flex-wrap gap-4">
                                {(Object.entries(statusMeta) as [BotStatus, typeof statusMeta[BotStatus]][]).map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                        <span className={`w-2 h-2 rounded-full ${val.dot.replace("animate-pulse", "")}`} />
                                        {val.label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
