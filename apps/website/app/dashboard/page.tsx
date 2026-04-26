import type { Metadata } from "next";
import {
    ArrowUpRight,
    CheckCircle2,
    Clock3,
    GitPullRequest,
    Rocket,
    ShieldCheck,
    Timer,
    TrendingUp,
    Zap,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import DeploymentStatusPanel from "@/components/dashboard/DeploymentStatusPanel";

export const metadata: Metadata = {
    title: "Customer Dashboard - AgentFarm",
    description: "Track AI worker output, task execution, and team outcomes in one dashboard.",
};

const stats = [
    { label: "Tasks Completed", sub: "Last 7 days", value: "184", delta: "+19%", icon: CheckCircle2, iconBg: "bg-sky-100 dark:bg-sky-900/50", iconColor: "text-sky-600 dark:text-sky-400" },
    { label: "PRs Merged", sub: "Last 7 days", value: "46", delta: "+12%", icon: GitPullRequest, iconBg: "bg-violet-100 dark:bg-violet-900/50", iconColor: "text-violet-600 dark:text-violet-400" },
    { label: "Median Cycle Time", sub: "vs last week", value: "2h 18m", delta: "−28%", icon: Timer, iconBg: "bg-amber-100 dark:bg-amber-900/50", iconColor: "text-amber-600 dark:text-amber-400" },
    { label: "Estimated Savings", sub: "Month to date", value: "$18,400", delta: "+$3,200", icon: TrendingUp, iconBg: "bg-emerald-100 dark:bg-emerald-900/50", iconColor: "text-emerald-600 dark:text-emerald-400" },
];

const workers = [
    { name: "AI Backend Developer", initials: "AB", status: "Active", tasks: 34, prs: 11, reliability: 99.2 },
    { name: "AI QA Engineer", initials: "AQ", status: "Active", tasks: 52, prs: 0, reliability: 99.6 },
    { name: "AI DevOps Engineer", initials: "AD", status: "Active", tasks: 18, prs: 7, reliability: 98.9 },
    { name: "AI Security Engineer", initials: "AS", status: "Needs review", tasks: 7, prs: 2, reliability: 99.7 },
];

const approvals = [
    { title: "Deploy production hotfix for auth timeout", risk: "high", by: "AI Backend Developer" },
    { title: "Merge migration changing customer schema", risk: "high", by: "AI DevOps Engineer" },
    { title: "Rotate cloud token for build worker", risk: "medium", by: "AI Security Engineer" },
];

const timeline = [
    { time: "10:42", event: "AI Backend Developer opened PR #482 for billing webhook retries", risk: "low" },
    { time: "09:31", event: "AI QA Engineer ran full regression suite and posted report", risk: "low" },
    { time: "08:57", event: "AI DevOps Engineer rolled out canary deploy to staging", risk: "medium" },
    { time: "08:12", event: "AI Security Engineer flagged outdated auth dependency", risk: "high" },
];

const riskBadge: Record<string, string> = {
    low: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
    medium: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
    high: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
};

const riskDot: Record<string, string> = {
    low: "bg-emerald-500",
    medium: "bg-amber-500",
    high: "bg-rose-500",
};

export default function DashboardPage() {
    return (
        <div className="site-shell min-h-screen\">
            {/* Hero */}
            <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
                <img
                    src="https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1800&q=80"
                    alt="Engineering dashboard"
                    className="w-full h-[260px] sm:h-[300px] object-cover object-center"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-slate-900/10" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
                        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-sky-300 mb-3">
                            <Zap className="w-3.5 h-3.5" />
                            Customer Dashboard
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight max-w-xl leading-tight">
                            Your AI workforce,<br className="hidden sm:block" /> fully visible
                        </h1>
                        <p className="mt-2 text-slate-300 text-base max-w-lg">
                            Monitor tasks, approvals, and delivery outcomes across every AI teammate in real time.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <ButtonLink href="/marketplace" size="sm">Add AI Worker</ButtonLink>
                            <ButtonLink href="/checkout" size="sm" variant="outline" className="!bg-white/10 !text-white !border-white/30 hover:!bg-white/20">
                                Manage Plan
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {stats.map(({ label, sub, value, delta, icon: Icon, iconBg, iconColor }) => (
                        <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${iconBg}`}>
                                    <Icon className={`w-5 h-5 ${iconColor}`} />
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 rounded-full px-2.5 py-1">
                                    <ArrowUpRight className="w-3 h-3" />
                                    {delta}
                                </span>
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{value}</p>
                                <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <DeploymentStatusPanel />

                {/* Workers table + Approval queue */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Workers table */}
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Active AI Workers</h2>
                            <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Live
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[600px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Worker</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Tasks</th>
                                        <th className="text-left px-4 py-3">PRs</th>
                                        <th className="text-left px-4 py-3">Reliability</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {workers.map((w) => (
                                        <tr key={w.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 text-xs font-bold shrink-0">
                                                        {w.initials}
                                                    </span>
                                                    <span className="font-semibold text-slate-900 dark:text-slate-100">{w.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${w.status === "Active" ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40" : "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40"}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${w.status === "Active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                                    {w.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{w.tasks}</td>
                                            <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{w.prs}</td>
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                                                        <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${w.reliability}%` }} />
                                                    </div>
                                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{w.reliability}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Approval Queue */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Approval Queue</h2>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold">
                                {approvals.length}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            {approvals.map((item) => (
                                <div key={item.title} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${riskBadge[item.risk]}`}>{item.risk}</span>
                                        <span className="text-xs text-slate-400 dark:text-slate-500 truncate text-right">{item.by}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{item.title}</p>
                                    <div className="mt-3 flex gap-2">
                                        <button className="flex-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 transition-colors">
                                            Approve
                                        </button>
                                        <button className="flex-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 py-1.5 transition-colors">
                                            Review
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <ButtonLink href="/dashboard/approvals" size="sm" variant="ghost" className="w-full justify-center">
                                Open full approval inbox
                            </ButtonLink>
                        </div>
                    </div>
                </div>

                {/* Timeline + Ops Health */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Execution Timeline */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Execution Timeline</h2>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Today — Apr 22, 2026</p>
                        </div>
                        <div className="p-5">
                            <div className="relative pl-6 space-y-0">
                                <div className="absolute left-2 top-2 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />
                                {timeline.map((item, i) => (
                                    <div key={i} className="relative pb-5 last:pb-0">
                                        <span className={`absolute -left-4 top-1 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${riskDot[item.risk]}`} />
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{item.time}</span>
                                            <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${riskBadge[item.risk]}`}>{item.risk}</span>
                                        </div>
                                        <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{item.event}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Ops Health */}
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-950/30 dark:to-sky-950/20 overflow-hidden">
                        <div className="px-5 py-4 border-b border-emerald-100 dark:border-emerald-900/40">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                Ops Health
                            </h2>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-medium">All systems normal</p>
                        </div>
                        <div className="p-5 space-y-2.5">
                            {[
                                { label: "Security policy compliance", value: "Pass", highlight: true },
                                { label: "SLA adherence this week", value: "97.4%" },
                                { label: "Median first response", value: "11m" },
                                { label: "Active worker uptime", value: "100%" },
                            ].map(({ label, value, highlight }) => (
                                <div key={label} className="flex items-center justify-between rounded-xl bg-white/70 dark:bg-slate-900/50 border border-white dark:border-slate-800 px-4 py-3">
                                    <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
                                    <span className={`font-bold text-sm ${highlight ? "text-emerald-600 dark:text-emerald-400 flex items-center gap-1" : "text-slate-900 dark:text-slate-100"}`}>
                                        {highlight && <ShieldCheck className="w-4 h-4" />}
                                        {value}
                                    </span>
                                </div>
                            ))}
                            <div className="pt-2 flex flex-wrap gap-3">
                                <ButtonLink href="/dashboard/activity" variant="outline" size="sm">Live Activity</ButtonLink>
                                <ButtonLink href="/docs" variant="outline" size="sm">View Runbook</ButtonLink>
                                <ButtonLink href="/how-it-works" size="sm">
                                    Scale Workforce <Rocket className="w-4 h-4 ml-1" />
                                </ButtonLink>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
