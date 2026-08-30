"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Activity,
    AlertTriangle,
    Bot,
    CheckCircle2,
    ChevronRight,
    Clock,
    RefreshCw,
    ShieldCheck,
    XCircle,
    Zap,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type BotStatus = "active" | "provisioning" | "paused" | "error" | "maintenance";

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
        dot: "bg-[var(--ok)] animate-pulse",
        badge: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]",
        icon: <PremiumIcon icon={CheckCircle2} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-4 h-4" />,
    },
    provisioning: {
        label: "Provisioning",
        dot: "bg-[var(--accent)] animate-pulse",
        badge: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
        icon: <PremiumIcon icon={Clock} tone="sky" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-4 h-4" />,
    },
    paused: {
        label: "Paused",
        dot: "bg-[var(--warn)]",
        badge: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
        icon: <PremiumIcon icon={Clock} tone="amber" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 text-[color:var(--warn)] dark:text-[color:var(--warn)]" iconClassName="w-4 h-4" />,
    },
    error: {
        label: "Error — needs attention",
        dot: "bg-[var(--danger)]",
        badge: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
        icon: <PremiumIcon icon={XCircle} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="w-4 h-4" />,
    },
    maintenance: {
        label: "Maintenance",
        dot: "bg-[var(--bg-deep)]",
        badge: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]",
        icon: <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-4 h-4" />,
    },
};

const toneClass: Record<string, string> = {
    sky: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    violet: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    amber: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    rose: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
    emerald: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]",
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
            const res = await fetch("/api/dashboard/bot-status");
            const data = await res.json() as any;
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
                                <Bot className="w-3.5 h-3.5" />
                                Bot Status
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Live Monitor</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Bot Status Monitor</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Live status, reliability, and configuration of all AI workers. Auto-refreshes every 30s.</p>
                            </div>
                            <div className="flex flex-col items-end gap-2 shrink-0">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-[color:var(--ink-muted)]">
                                        Updated {lastRefresh.toLocaleTimeString()}
                                    </span>
                                    <button
                                        onClick={fetchBots}
                                        disabled={loading}
                                        className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] transition-colors disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                                        Refresh
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Mini stats bar */}
                        {!loading && !error && (
                            <div className="mt-5 flex flex-wrap gap-4">
                                <div className="inline-flex items-center gap-2 text-sm">
                                    <span className="w-2.5 h-2.5 rounded-full bg-[var(--ok)] animate-pulse" />
                                    <span className="font-semibold text-[color:var(--ink-muted)]">{activeCount} active</span>
                                </div>
                                {errorCount > 0 && (
                                    <div className="inline-flex items-center gap-2 text-sm">
                                        <AlertTriangle className="w-3.5 h-3.5 text-[color:var(--danger)]" />
                                        <span className="font-semibold text-[color:var(--danger)]">{errorCount} bot{errorCount > 1 ? "s" : ""} {errorCount > 1 ? "need" : "needs"} attention</span>
                                    </div>
                                )}
                                <div className="inline-flex items-center gap-2 text-sm text-[color:var(--ink-muted)]">
                                    <Bot className="w-3.5 h-3.5" />
                                    {bots.length} total workers
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {loading && bots.length === 0 ? (
                    <p className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] text-sm py-12 text-center">Loading bot status…</p>
                ) : error ? (
                    <p className="text-[color:var(--danger)] text-sm py-12 text-center">{error}</p>
                ) : (
                    <>
                        {/* Error alerts */}
                        {errorCount > 0 && (
                            <div className="rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 px-4 py-3.5 flex items-start gap-3">
                                <PremiumIcon icon={AlertTriangle} tone="rose" containerClassName="w-6 h-6 mt-0.5 shrink-0 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="w-3.5 h-3.5" />
                                <div>
                                    <p className="text-sm font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                                        {errorCount} bot{errorCount > 1 ? "s require" : " requires"} admin attention
                                    </p>
                                    <p className="text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)] mt-0.5">
                                        {bots.filter((b) => b.status === "error").map((b) => b.name).join(", ")}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Bot cards */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {bots.map((bot) => {
                                const meta = statusMeta[bot.status];
                                return (
                                    <article key={bot.slug} className={`rounded-[4px] border bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden transition-shadow hover:shadow-md ${bot.status === "error" ? "border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]" : "border-[color:var(--line)] dark:border-[color:var(--line)]"}`}>

                                        {/* Status bar */}
                                        <div className={`h-1 w-full ${bot.status === "active" ? "bg-[var(--ok)]" : bot.status === "paused" ? "bg-[var(--warn)]" : bot.status === "error" ? "bg-[var(--danger)]" : "bg-[var(--bg-deep)]"}`} />

                                        <div className="p-5">
                                            {/* Top row */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />
                                                        <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] truncate">{bot.name}</h2>
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
                                                <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
                                                    <span className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wide text-[10px] font-semibold truncate">Tasks</span>
                                                    <span className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-1 min-w-0">
                                                        <PremiumIcon icon={Activity} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--line)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3" /><span className="truncate">{bot.tasksCompleted}</span>
                                                    </span>
                                                </div>
                                                <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
                                                    <span className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wide text-[10px] font-semibold truncate">Reliability</span>
                                                    <span className={`font-bold flex items-center gap-1 min-w-0 ${bot.tasksCompleted === 0 ? "text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]" : bot.reliabilityPct >= 99 ? "text-[color:var(--ok)] dark:text-[color:var(--ok)]" : bot.reliabilityPct >= 97 ? "text-[color:var(--warn)] dark:text-[color:var(--warn)]" : "text-[color:var(--danger)] dark:text-[color:var(--danger)]"}`}>
                                                        <PremiumIcon icon={Zap} tone="amber" containerClassName="w-5 h-5 rounded-[2px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 text-[color:var(--warn)] dark:text-[color:var(--warn)]" iconClassName="w-3 h-3" /><span className="truncate">{bot.tasksCompleted === 0 ? "—" : `${bot.reliabilityPct}%`}</span>
                                                    </span>
                                                </div>
                                                <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
                                                    <span className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] uppercase tracking-wide text-[10px] font-semibold truncate">Last Active</span>
                                                    <span className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-1 min-w-0">
                                                        <PremiumIcon icon={Clock} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--line)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3" /><span className="truncate">{formatTime(bot.lastActivityAt)}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Config summary */}
                                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                                                <span className="inline-flex items-center gap-1 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-2 py-1 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                                    <PremiumIcon icon={ShieldCheck} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--line)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3" />{autonomyLabel[bot.autonomyLevel]}
                                                </span>
                                                <span className="inline-flex items-center gap-1 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-2 py-1 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                                    {policyLabel[bot.approvalPolicy]}
                                                </span>
                                            </div>

                                            {/* Shift */}
                                            <div className="mt-3 flex items-center gap-2 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                <PremiumIcon icon={Clock} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3" />
                                                <span>Works {bot.shiftStart}–{bot.shiftEnd} on {bot.activeDays.toUpperCase()}</span>
                                            </div>

                                            {/* Admin notes */}
                                            {bot.notes && (
                                                <div className="mt-3 rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/20 border border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]/30 px-3 py-2 text-xs text-[color:var(--warn)] dark:text-[color:var(--warn)]">
                                                    <span className="font-semibold">Note:</span> {bot.notes}
                                                </div>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-4">
                            <p className="text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-3 uppercase tracking-wide">Status legend</p>
                            <div className="flex flex-wrap gap-4">
                                {(Object.entries(statusMeta) as [BotStatus, typeof statusMeta[BotStatus]][]).map(([key, val]) => (
                                    <div key={key} className="flex items-center gap-2 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
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
