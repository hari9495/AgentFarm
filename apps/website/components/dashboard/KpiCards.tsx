"use client";

import { useEffect, useState } from "react";
import {
    ArrowDownRight,
    ArrowUpRight,
    CheckCircle2,
    GitPullRequest,
    Timer,
    TrendingUp,
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

// ── Smooth gradient sparkline ────────────────────────────────────────────────

function Sparkline({ values, color, gradientId }: { values: number[]; color: string; gradientId: string }) {
    const W = 100;
    const H = 32;
    const PAD = 3;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const pts = values.map((v, i) => ({
        x: PAD + (i / (values.length - 1)) * (W - PAD * 2),
        y: H - PAD - ((v - min) / range) * (H - PAD * 2),
    }));

    // Smooth bezier path
    const path = pts.reduce((d, pt, i) => {
        if (i === 0) return `M ${pt.x},${pt.y}`;
        const prev = pts[i - 1]!;
        const cx = (prev.x + pt.x) / 2;
        return `${d} C ${cx},${prev.y} ${cx},${pt.y} ${pt.x},${pt.y}`;
    }, "");

    // Area fill path (close to bottom)
    const area = `${path} L ${pts[pts.length - 1]!.x},${H} L ${pts[0]!.x},${H} Z`;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-8" aria-hidden preserveAspectRatio="none">
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
            </defs>
            {/* Gradient fill */}
            <path d={area} fill={`url(#${gradientId})`} className={color} />
            {/* Line */}
            <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={color} />
            {/* End dot */}
            <circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r="2.5" fill="currentColor" className={color} />
        </svg>
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
            <div className="h-7 w-full rounded bg-slate-200 dark:bg-slate-700" />
        </div>
    );
}

// ── Card config ──────────────────────────────────────────────────────────────

const cardConfig = [
    {
        key: "tasksCompleted" as const,
        icon: CheckCircle2,
        border:       "border-sky-100",
        headerBg:     "bg-gradient-to-br from-sky-50 to-white",
        iconBg:       "bg-sky-100",
        iconColor:    "text-sky-600",
        sparkColor:   "text-sky-500",
        gradientId:   "grad-tasks",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "Tasks Completed",
    },
    {
        key: "prsMerged" as const,
        icon: GitPullRequest,
        border:       "border-violet-100",
        headerBg:     "bg-gradient-to-br from-violet-50 to-white",
        iconBg:       "bg-violet-100",
        iconColor:    "text-violet-600",
        sparkColor:   "text-violet-500",
        gradientId:   "grad-prs",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "PRs Merged",
    },
    {
        key: "medianCycleTime" as const,
        icon: Timer,
        border:       "border-amber-100",
        headerBg:     "bg-gradient-to-br from-amber-50 to-white",
        iconBg:       "bg-amber-100",
        iconColor:    "text-amber-600",
        sparkColor:   "text-amber-500",
        gradientId:   "grad-cycle",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "Median Cycle Time",
    },
    {
        key: "estimatedSavings" as const,
        icon: TrendingUp,
        border:       "border-emerald-100",
        headerBg:     "bg-gradient-to-br from-emerald-50 to-white",
        iconBg:       "bg-emerald-100",
        iconColor:    "text-emerald-600",
        sparkColor:   "text-emerald-500",
        gradientId:   "grad-savings",
        deltaPos:     "text-emerald-700 bg-emerald-50 border border-emerald-100",
        deltaNeg:     "text-rose-600 bg-rose-50 border border-rose-100",
        label:        "Estimated Savings",
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

                        <div>
                            <p className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none tracking-tight">
                                {stat.label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{cfg.label}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                        </div>

                        <Sparkline values={stat.trend} color={cfg.sparkColor} gradientId={cfg.gradientId} />

                        {/* Live indicator */}
                        <div className="absolute bottom-3 right-3 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Live</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
