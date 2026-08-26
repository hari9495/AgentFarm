"use client";

import { useEffect, useState, useCallback } from "react";
import {
    ArrowDownRight,
    ArrowUpRight,
    CheckCircle2,
    GitPullRequest,
    Timer,
    TrendingUp,
    Users,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type StatPayload = {
    label: string;
    delta: string | null;
    positive: boolean;
    trend: number[];
    sub: string;
};

type StatsResponse = {
    source: "live";
    stats: {
        tasksCompleted: StatPayload;
        prsMerged: StatPayload;
        medianCycleTime: StatPayload;
        estimatedSavings: StatPayload;
    };
};

// ── Daily bar chart ──────────────────────────────────────────────────────────

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function DailyBars({ values, barBg }: { values: number[]; barBg: string }) {
    const max = Math.max(...values) || 1;
    // today = last value (index 6)
    const todayIdx = values.length - 1;

    return (
        <div className="flex items-end gap-[3px] h-10">
            {values.map((v, i) => {
                const heightPct = Math.max(12, Math.round((v / max) * 100));
                const isToday = i === todayIdx;
                return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-[3px]">
                        <div
                            className={`w-full rounded-[3px] transition-all duration-300 ${barBg} ${isToday ? "opacity-100" : "opacity-50"}`}
                            style={{ height: `${heightPct}%` }}
                            title={`${DAY_LABELS[i]}: ${v}`}
                        />
                        <span className={`text-[9px] font-semibold leading-none ${isToday ? "text-slate-600" : "text-slate-300"}`}>
                            {DAY_LABELS[i]}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4 shadow-sm overflow-hidden animate-pulse">
            <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
                <div className="h-6 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="space-y-2">
                <div className="h-7 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
            <div className="h-10 w-full rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-5 w-32 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
    );
}

// ── Card config ──────────────────────────────────────────────────────────────

const cardConfig = [
    {
        key: "tasksCompleted" as const,
        icon: CheckCircle2,
        border:       "border-blue-100",
        headerBg:     "bg-gradient-to-br from-blue-50 to-white",
        iconBg:       "bg-blue-100",
        iconColor:    "text-blue-600",
        barBg:        "bg-blue-400",
        gradientId:   "grad-tasks",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "Tasks Completed",
        contributor:  { initials: "AB", name: "AI Backend Dev", avatarBg: "bg-blue-500" },
    },
    {
        key: "prsMerged" as const,
        icon: GitPullRequest,
        border:       "border-blue-100",
        headerBg:     "bg-gradient-to-br from-blue-50 to-white",
        iconBg:       "bg-blue-100",
        iconColor:    "text-blue-600",
        barBg:        "bg-blue-400",
        gradientId:   "grad-prs",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "PRs Merged",
        contributor:  { initials: "AQ", name: "AI QA Engineer", avatarBg: "bg-blue-500" },
    },
    {
        key: "medianCycleTime" as const,
        icon: Timer,
        border:       "border-amber-100",
        headerBg:     "bg-gradient-to-br from-amber-50 to-white",
        iconBg:       "bg-amber-100",
        iconColor:    "text-amber-600",
        barBg:        "bg-amber-400",
        gradientId:   "grad-cycle",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "Median Cycle Time",
        contributor:  { initials: "AD", name: "AI DevOps Eng", avatarBg: "bg-amber-500" },
    },
    {
        key: "estimatedSavings" as const,
        icon: TrendingUp,
        border:       "border-emerald-100",
        headerBg:     "bg-gradient-to-br from-emerald-50 to-white",
        iconBg:       "bg-emerald-100",
        iconColor:    "text-emerald-600",
        barBg:        "bg-emerald-400",
        gradientId:   "grad-savings",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "Estimated Savings",
        contributor:  { initials: "AB", name: "AI Backend Dev", avatarBg: "bg-emerald-500" },
    },
] as const;

// ── Main component ───────────────────────────────────────────────────────────

export default function KpiCards() {
    const [data, setData] = useState<StatsResponse | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetch("/api/dashboard/stats", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((body: StatsResponse) => setData(body))
            .catch(() => setError(true));
    }, []);

    if (error) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {cardConfig.map((c) => (
                    <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center text-xs text-slate-400">
                        Stats unavailable
                    </div>
                ))}
            </div>
        );
    }

    if (!data) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {cardConfig.map((c) => <SkeletonCard key={c.key} />)}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cardConfig.map((cfg, idx) => {
                const stat = data.stats[cfg.key];
                const Icon = cfg.icon;
                const isDown = stat.delta?.startsWith("−") || stat.delta?.startsWith("-");
                const deltaClass = stat.positive ? cfg.deltaPos : cfg.deltaNeg;

                return (
                    <div
                        key={cfg.key}
                        style={{ animationDelay: `${idx * 60}ms` }}
                        className={`choreo-rise relative rounded-2xl border ${cfg.border} ${cfg.headerBg} p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 [transition:transform_220ms_cubic-bezier(0.22,1,0.36,1),box-shadow_220ms_cubic-bezier(0.22,1,0.36,1)]`}
                    >
                        {/* Top row — icon + delta */}
                        <div className="flex items-start justify-between gap-3">
                            <div className={`w-10 h-10 rounded-xl ${cfg.iconBg} flex items-center justify-center shrink-0`}>
                                <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                            </div>
                            {stat.delta !== null ? (
                                <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 ${deltaClass}`}>
                                    {isDown
                                        ? <ArrowDownRight className="w-3 h-3" />
                                        : <ArrowUpRight className="w-3 h-3" />}
                                    {stat.delta}
                                </span>
                            ) : (
                                <span className="inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-1 text-slate-400 bg-slate-100">
                                    —
                                </span>
                            )}
                        </div>

                        {/* Metric */}
                        <div>
                            <p className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none tracking-tight">
                                {stat.label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{cfg.label}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                        </div>

                        {/* Daily bars */}
                        <DailyBars values={stat.trend} barBg={cfg.barBg} />

                        {/* Bottom row — top contributor + live dot */}
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0 ${cfg.contributor.avatarBg}`}>
                                    {cfg.contributor.initials}
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium truncate">{cfg.contributor.name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Live</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

