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
                        <span className={`text-[9px] font-semibold leading-none ${isToday ? "text-[color:var(--ink-soft)]" : "text-[color:var(--ink-muted)]"}`}>
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
        <div className="relative rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5 flex flex-col gap-4 shadow-sm overflow-hidden animate-pulse">
            <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-[3px] bg-[var(--line)] dark:bg-[var(--card)]" />
                <div className="h-6 w-16 rounded-full bg-[var(--line)] dark:bg-[var(--card)]" />
            </div>
            <div className="space-y-2">
                <div className="h-7 w-24 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                <div className="h-4 w-32 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                <div className="h-3 w-20 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
            </div>
            <div className="h-10 w-full rounded bg-[var(--line)] dark:bg-[var(--card)]" />
            <div className="h-5 w-32 rounded-full bg-[var(--line)] dark:bg-[var(--card)]" />
        </div>
    );
}

// ── Card config ──────────────────────────────────────────────────────────────

const cardConfig = [
    {
        key: "tasksCompleted" as const,
        icon: CheckCircle2,
        border:       "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
        headerBg:     "bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] to-[var(--card)]",
        iconBg:       "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",
        iconColor:    "text-[color:var(--accent)]",
        barBg:        "bg-[var(--accent)]",
        gradientId:   "grad-tasks",
        deltaPos:     "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]",
        deltaNeg:     "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]",
        label:        "Tasks Completed",
        contributor:  { initials: "AB", name: "AI Backend Dev", avatarBg: "bg-[var(--accent)]" },
    },
    {
        key: "prsMerged" as const,
        icon: GitPullRequest,
        border:       "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
        headerBg:     "bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] to-[var(--card)]",
        iconBg:       "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",
        iconColor:    "text-[color:var(--accent)]",
        barBg:        "bg-[var(--accent)]",
        gradientId:   "grad-prs",
        deltaPos:     "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]",
        deltaNeg:     "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]",
        label:        "PRs Merged",
        contributor:  { initials: "AQ", name: "AI QA Engineer", avatarBg: "bg-[var(--accent)]" },
    },
    {
        key: "medianCycleTime" as const,
        icon: Timer,
        border:       "border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]",
        headerBg:     "bg-gradient-to-br from-[color-mix(in_srgb,var(--warn)_8%,transparent)] to-[var(--card)]",
        iconBg:       "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]",
        iconColor:    "text-[color:var(--warn)]",
        barBg:        "bg-[var(--warn)]",
        gradientId:   "grad-cycle",
        deltaPos:     "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]",
        deltaNeg:     "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]",
        label:        "Median Cycle Time",
        contributor:  { initials: "AD", name: "AI DevOps Eng", avatarBg: "bg-[var(--warn)]" },
    },
    {
        key: "estimatedSavings" as const,
        icon: TrendingUp,
        border:       "border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]",
        headerBg:     "bg-gradient-to-br from-[color-mix(in_srgb,var(--ok)_8%,transparent)] to-[var(--card)]",
        iconBg:       "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]",
        iconColor:    "text-[color:var(--ok)]",
        barBg:        "bg-[var(--ok)]",
        gradientId:   "grad-savings",
        deltaPos:     "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]",
        deltaNeg:     "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]",
        label:        "Estimated Savings",
        contributor:  { initials: "AB", name: "AI Backend Dev", avatarBg: "bg-[var(--ok)]" },
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
                    <div key={c.key} className="rounded-[4px] border border-[color:var(--line)] bg-[var(--card)] p-5 shadow-sm text-center text-xs text-[color:var(--ink-muted)]">
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
                        className={`choreo-rise relative rounded-[4px] border ${cfg.border} ${cfg.headerBg} p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 [transition:transform_220ms_cubic-bezier(0.22,1,0.36,1),box-shadow_220ms_cubic-bezier(0.22,1,0.36,1)]`}
                    >
                        {/* Top row — icon + delta */}
                        <div className="flex items-start justify-between gap-3">
                            <div className={`w-10 h-10 rounded-[3px] ${cfg.iconBg} flex items-center justify-center shrink-0`}>
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
                                <span className="inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-1 text-[color:var(--ink-muted)] bg-[var(--bg-deep)]">
                                    —
                                </span>
                            )}
                        </div>

                        {/* Metric */}
                        <div>
                            <p className="text-3xl font-extrabold text-[color:var(--ink)] tabular-nums leading-none tracking-tight">
                                {stat.label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-[color:var(--ink-soft)]">{cfg.label}</p>
                            <p className="text-xs text-[color:var(--ink-muted)] mt-0.5">{stat.sub}</p>
                        </div>

                        {/* Daily bars */}
                        <DailyBars values={stat.trend} barBg={cfg.barBg} />

                        {/* Bottom row — top contributor + live dot */}
                        <div className="flex items-center justify-between pt-1 border-t border-[color:var(--line)]">
                            <div className="flex items-center gap-1.5">
                                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-[color:var(--ink)] shrink-0 ${cfg.contributor.avatarBg}`}>
                                    {cfg.contributor.initials}
                                </span>
                                <span className="text-[11px] text-[color:var(--ink-muted)] font-medium truncate">{cfg.contributor.name}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] animate-pulse" />
                                <span className="text-[9px] font-semibold text-[color:var(--ink-muted)] uppercase tracking-wider">Live</span>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

