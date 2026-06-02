"use client";

// KpiCardsV2 — daily bars + top contributor (v2, new module = new chunk hash)
import { useEffect, useState } from "react";
import {
    ArrowDownRight,
    ArrowUpRight,
    CheckCircle2,
    GitPullRequest,
    Timer,
    TrendingUp,
} from "lucide-react";

type StatPayload = { label: string; delta: string | null; positive: boolean; trend: number[]; sub: string };
type StatsResponse = { source: "live"; stats: { tasksCompleted: StatPayload; prsMerged: StatPayload; medianCycleTime: StatPayload; estimatedSavings: StatPayload } };

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

function DailyBars({ values, barBg }: { values: number[]; barBg: string }) {
    const max = Math.max(...values) || 1;
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "40px" }}>
            {values.map((v, i) => {
                const pct = Math.max(12, Math.round((v / max) * 100));
                const isToday = i === values.length - 1;
                return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                        <div
                            className={barBg + (isToday ? "" : " opacity-50")}
                            style={{ width: "100%", height: pct + "%", borderRadius: "3px", transition: "all 0.3s" }}
                        />
                        <span style={{ fontSize: "9px", fontWeight: 600, lineHeight: 1, color: isToday ? "#475569" : "#cbd5e1" }}>
                            {DAYS[i]}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="relative rounded-2xl border border-slate-200 bg-white p-5 flex flex-col gap-4 shadow-sm overflow-hidden animate-pulse">
            <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200" />
                <div className="h-6 w-16 rounded-full bg-slate-200" />
            </div>
            <div className="space-y-2">
                <div className="h-8 w-24 rounded bg-slate-200" />
                <div className="h-4 w-32 rounded bg-slate-200" />
                <div className="h-3 w-20 rounded bg-slate-200" />
            </div>
            <div className="h-10 w-full rounded bg-slate-200" />
            <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                <div className="h-5 w-28 rounded-full bg-slate-200" />
                <div className="h-3 w-8 rounded bg-slate-200" />
            </div>
        </div>
    );
}

// Single top contributor shown across all KPI cards
const TOP_CONTRIBUTOR = { ini: "AB", name: "AI Backend Dev", aBg: "bg-sky-500" };

const CARDS = [
    { key: "tasksCompleted" as const, icon: CheckCircle2, border: "border-sky-100", bg: "bg-gradient-to-br from-sky-50 to-white", iconBg: "bg-sky-100", iconColor: "text-sky-600", barBg: "bg-sky-400", dPos: "text-emerald-700 bg-emerald-50 border border-emerald-100", dNeg: "text-rose-600 bg-rose-50 border border-rose-100", label: "Tasks Completed" },
    { key: "prsMerged" as const, icon: GitPullRequest, border: "border-violet-100", bg: "bg-gradient-to-br from-violet-50 to-white", iconBg: "bg-violet-100", iconColor: "text-violet-600", barBg: "bg-violet-400", dPos: "text-emerald-700 bg-emerald-50 border border-emerald-100", dNeg: "text-rose-600 bg-rose-50 border border-rose-100", label: "PRs Merged" },
    { key: "medianCycleTime" as const, icon: Timer, border: "border-amber-100", bg: "bg-gradient-to-br from-amber-50 to-white", iconBg: "bg-amber-100", iconColor: "text-amber-600", barBg: "bg-amber-400", dPos: "text-emerald-700 bg-emerald-50 border border-emerald-100", dNeg: "text-rose-600 bg-rose-50 border border-rose-100", label: "Median Cycle Time" },
    { key: "estimatedSavings" as const, icon: TrendingUp, border: "border-emerald-100", bg: "bg-gradient-to-br from-emerald-50 to-white", iconBg: "bg-emerald-100", iconColor: "text-emerald-600", barBg: "bg-emerald-400", dPos: "text-emerald-700 bg-emerald-50 border border-emerald-100", dNeg: "text-rose-600 bg-rose-50 border border-rose-100", label: "Estimated Savings" },
] as const;

export default function KpiCardsV2() {
    const [data, setData] = useState<StatsResponse | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetch("/api/dashboard/stats", { credentials: "include" })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then((b: StatsResponse) => setData(b))
            .catch(() => setError(true));
    }, []);

    if (error) return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {CARDS.map(c => <div key={c.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-center text-xs text-slate-400">Stats unavailable</div>)}
        </div>
    );

    if (!data) return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {CARDS.map(c => <SkeletonCard key={c.key} />)}
        </div>
    );

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {CARDS.map((cfg, idx) => {
                const stat = data.stats[cfg.key];
                const Icon = cfg.icon;
                const isDown = stat.delta?.startsWith("−") || stat.delta?.startsWith("-");
                const dClass = stat.positive ? cfg.dPos : cfg.dNeg;
                return (
                    <div key={cfg.key} style={{ animationDelay: idx * 60 + "ms" }}
                        className={"choreo-rise relative rounded-2xl border " + cfg.border + " " + cfg.bg + " p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 [transition:transform_220ms_cubic-bezier(0.22,1,0.36,1),box-shadow_220ms_cubic-bezier(0.22,1,0.36,1)]"}>
                        <div className="flex items-start justify-between gap-3">
                            <div className={"w-10 h-10 rounded-xl " + cfg.iconBg + " flex items-center justify-center shrink-0"}>
                                <Icon className={"w-5 h-5 " + cfg.iconColor} />
                            </div>
                            {stat.delta !== null
                                ? <span className={"inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 " + dClass}>{isDown ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}{stat.delta}</span>
                                : <span className="inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-1 text-slate-400 bg-slate-100">—</span>
                            }
                        </div>
                        <div>
                            <p className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none tracking-tight">{stat.label}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{cfg.label}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{stat.sub}</p>
                        </div>
                        <DailyBars values={stat.trend} barBg={cfg.barBg} />
                        <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                                <span className={"inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0 " + TOP_CONTRIBUTOR.aBg}>{TOP_CONTRIBUTOR.ini}</span>
                                <span className="text-[11px] text-slate-500 font-medium truncate">{TOP_CONTRIBUTOR.name}</span>
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
