import type { Metadata } from "next";
import { BarChart3, CheckCircle2, Clock, GitPullRequest, ShieldAlert, TrendingDown, TrendingUp, Zap } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

export const metadata: Metadata = {
    title: "Reports & Analytics - AgentFarm Dashboard",
    description: "Weekly output reports, reliability trends, and risk distribution across all AI workers.",
};

const weeklyRows = [
    { agent: "AI Backend Developer", initials: "AB", tasks: 34, prs: 11, reviews: 8, reliability: 99.2, riskScore: "Low", tone: "sky" },
    { agent: "AI QA Engineer", initials: "AQ", tasks: 52, prs: 0, reviews: 0, reliability: 99.6, riskScore: "Low", tone: "violet" },
    { agent: "AI DevOps Engineer", initials: "AD", tasks: 18, prs: 7, reviews: 4, reliability: 98.9, riskScore: "Medium", tone: "amber" },
    { agent: "AI Security Engineer", initials: "AS", tasks: 7, prs: 2, reviews: 6, reliability: 99.7, riskScore: "High", tone: "rose" },
];

const reliabilityTrend = [97.2, 98.1, 98.4, 99.0, 98.8, 99.2, 99.4];

const riskDist = [
    { label: "Low Risk", count: 124, pct: 67, color: "bg-emerald-500" },
    { label: "Medium Risk", count: 43, pct: 23, color: "bg-amber-500" },
    { label: "High Risk", count: 17, pct: 10, color: "bg-rose-500" },
];

const toneClass: Record<string, string> = {
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const riskBadge: Record<string, string> = {
    Low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    Medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    High: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

function SparkLine({ values }: { values: number[] }) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 80;
    const h = 28;
    const pts = values
        .map((v, i) => {
            const x = (i / (values.length - 1)) * w;
            const y = h - ((v - min) / range) * h;
            return `${x},${y}`;
        })
        .join(" ");
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-7" aria-hidden>
            <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500" />
        </svg>
    );
}

export default function DashboardReportsPage() {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex items-center gap-3">
                    <PremiumIcon icon={BarChart3} tone="sky" containerClassName="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Reports & Analytics</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Weekly output, reliability trends, and risk distribution</p>
                    </div>
                </div>
            </div>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Summary KPIs */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {[
                        { label: "Total Tasks (7d)", value: "111", icon: CheckCircle2, tone: "sky" as const, delta: "+18%" },
                        { label: "PRs Merged (7d)", value: "20", icon: GitPullRequest, tone: "violet" as const, delta: "+11%" },
                        { label: "Avg Reliability", value: "99.4%", icon: Zap, tone: "emerald" as const, delta: "+0.6pp" },
                        { label: "High-Risk Actions", value: "17", icon: ShieldAlert, tone: "rose" as const, delta: "−3" },
                    ].map(({ label, value, icon, tone, delta }) => (
                        <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <PremiumIcon icon={icon} tone={tone} containerClassName="w-9 h-9 rounded-xl" iconClassName="w-4.5 h-4.5" />
                                <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${tone === "rose" ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"}`}>{delta}</span>
                            </div>
                            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Weekly agent output table */}
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <PremiumIcon icon={BarChart3} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                                Weekly Agent Output
                            </h2>
                            <span className="text-[10px] text-slate-400 font-mono">Last 7 days</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[580px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Agent</th>
                                        <th className="text-left px-4 py-3">Tasks</th>
                                        <th className="text-left px-4 py-3">PRs</th>
                                        <th className="text-left px-4 py-3">Reviews</th>
                                        <th className="text-left px-4 py-3">Reliability</th>
                                        <th className="text-left px-4 py-3">Risk</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {weeklyRows.map((row) => (
                                        <tr key={row.agent} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-2.5">
                                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold ${toneClass[row.tone]}`}>{row.initials}</span>
                                                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{row.agent}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">{row.tasks}</td>
                                            <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{row.prs}</td>
                                            <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{row.reviews}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                                                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${row.reliability}%` }} />
                                                    </div>
                                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{row.reliability}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${riskBadge[row.riskScore]}`}>{row.riskScore}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Risk distribution + reliability trend */}
                    <div className="space-y-4">
                        {/* Risk distribution */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                <PremiumIcon icon={ShieldAlert} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3.5 h-3.5" />
                                Risk Distribution
                            </h3>
                            <div className="flex rounded-full overflow-hidden h-3 mb-4">
                                {riskDist.map((r) => (
                                    <div key={r.label} className={`${r.color} h-full transition-all`} style={{ width: `${r.pct}%` }} />
                                ))}
                            </div>
                            <div className="space-y-2">
                                {riskDist.map((r) => (
                                    <div key={r.label} className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                            <span className={`w-2 h-2 rounded-full ${r.color}`} />
                                            {r.label}
                                        </span>
                                        <span className="font-bold text-slate-900 dark:text-slate-100">{r.count} <span className="font-normal text-slate-400">({r.pct}%)</span></span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Reliability trend */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                                <PremiumIcon icon={TrendingUp} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" />
                                Reliability Trend
                            </h3>
                            <p className="text-[10px] text-slate-400 mb-4">7-day avg across all agents</p>
                            <div className="flex items-end gap-1.5 h-14">
                                {reliabilityTrend.map((v, i) => {
                                    const min = 96;
                                    const max = 100;
                                    const pct = Math.round(((v - min) / (max - min)) * 100);
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                            <div
                                                className="w-full rounded-t-sm bg-emerald-400 dark:bg-emerald-500 transition-all"
                                                style={{ height: `${Math.max(8, pct)}%` }}
                                            />
                                            <span className="text-[8px] text-slate-400">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className="text-slate-500 dark:text-slate-400">7-day avg</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">99.4%</span>
                            </div>
                        </div>

                        {/* Hours saved */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <PremiumIcon icon={Clock} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Est. Hours Saved</h3>
                            </div>
                            <p className="text-3xl font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">312h</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">This month across all AI workers</p>
                            <div className="mt-3 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                <TrendingDown className="w-3.5 h-3.5" /> −28% cycle time vs last month
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
