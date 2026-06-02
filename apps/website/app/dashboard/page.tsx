import type { Metadata } from "next";
import Link from "next/link";
import {
    CheckCircle2,
    ChevronRight,
    Clock3,
    LayoutGrid,
    Rocket,
    ShieldCheck,
    Users,
    Zap,
    TrendingUp,
    AlertTriangle,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import DeploymentStatusPanel from "@/components/dashboard/DeploymentStatusPanel";
import KpiCards from "@/components/dashboard/KpiCardsV2";
import OverviewApprovalQueue from "@/components/dashboard/OverviewApprovalQueue";
import ProvisioningProgressCard from "@/components/dashboard/ProvisioningProgressCard";
import PremiumIcon from "@/components/shared/PremiumIcon";

export const metadata: Metadata = {
    title: "Customer Dashboard · AgentFarms",
    description: "Track AI teammate output, task execution, and team outcomes in one dashboard.",
};

// ── Data ────────────────────────────────────────────────────────────────────

const workers = [
    { name: "AI Backend Developer", slug: "ai-backend-developer", initials: "AB", role: "Backend", status: "Active", tasks: 284, prs: 47, reliability: 99.2, color: "text-sky-600", ring: "ring-sky-200 bg-sky-50" },
    { name: "AI QA Engineer",       slug: "ai-qa-engineer",       initials: "AQ", role: "Quality",  status: "Active", tasks: 391, prs: 0,  reliability: 99.6, color: "text-violet-600", ring: "ring-violet-200 bg-violet-50" },
    { name: "AI DevOps Engineer",   slug: "ai-devops-engineer",   initials: "AD", role: "DevOps",   status: "Active", tasks: 153, prs: 31, reliability: 98.9, color: "text-amber-600", ring: "ring-amber-200 bg-amber-50" },
    { name: "AI Security Engineer", slug: "ai-security-engineer", initials: "AS", role: "Security", status: "Needs review", tasks: 67, prs: 14, reliability: 99.7, color: "text-rose-600", ring: "ring-rose-200 bg-rose-50" },
];

const timeline = [
    { time: "11:24", event: "AI Backend Developer merged PR #519 — payment retry logic v2", risk: "low" as const },
    { time: "10:42", event: "AI DevOps Engineer scaled staging cluster to 14 nodes", risk: "medium" as const },
    { time: "09:58", event: "AI QA Engineer completed regression suite — 847 tests, 0 failures", risk: "low" as const },
    { time: "09:31", event: "AI Security Engineer flagged outdated auth dependency (CVE-2024-39908)", risk: "high" as const },
    { time: "08:45", event: "AI Backend Developer opened PR #517 for billing webhook retries", risk: "low" as const },
    { time: "08:12", event: "AI DevOps Engineer rolled out canary to 10% of production traffic", risk: "medium" as const },
];

const healthItems = [
    { label: "Security policy compliance", value: "Pass",  good: true },
    { label: "SLA adherence this week",    value: "98.7%", good: true },
    { label: "Median first response",      value: "11m",   good: true },
    { label: "Active teammate uptime",     value: "100%",  good: true },
    { label: "Approval decision latency",  value: "16m avg", good: true },
    { label: "Open risk items",            value: "2",     good: false },
];

// Weekly task distribution (Mon–Sun) for activity bar chart
const weeklyActivity = [
    { day: "Mon", tasks: 38, prs: 8 },
    { day: "Tue", tasks: 44, prs: 11 },
    { day: "Wed", tasks: 51, prs: 9 },
    { day: "Thu", tasks: 47, prs: 13 },
    { day: "Fri", tasks: 62, prs: 10 },
    { day: "Sat", tasks: 24, prs: 4 },
    { day: "Sun", tasks: 18, prs: 2 },
];
const maxTasks = Math.max(...weeklyActivity.map((d) => d.tasks));

const riskStyles = {
    low:    { badge: "text-emerald-700 bg-emerald-100",  dot: "bg-emerald-500" },
    medium: { badge: "text-amber-700 bg-amber-100",      dot: "bg-amber-500" },
    high:   { badge: "text-rose-700 bg-rose-100",        dot: "bg-rose-500" },
};

// ── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    return (
        <div className="site-shell min-h-screen bg-slate-50">

            {/* ── Single shared container — hero + all widgets aligned ────── */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

            {/* ── Hero header ─────────────────────────────────────────────── */}
            <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                </div>

                <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-400">
                            <PremiumIcon icon={LayoutGrid} tone="sky" containerClassName="w-4 h-4 rounded bg-sky-400/20 text-sky-300" iconClassName="w-2.5 h-2.5" />
                            Customer Dashboard
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                        <span className="text-xs text-slate-500">Overview</span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                        <div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                                AI Teammate Operations
                            </h1>
                            <p className="mt-2 text-slate-400 text-base max-w-lg">
                                Monitor tasks, approvals, and delivery outcomes across every AI teammate in real time.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 shrink-0">
                            <ButtonLink href="/marketplace" size="sm">
                                <Zap className="w-3.5 h-3.5" />
                                Add AI Teammate
                            </ButtonLink>
                            <ButtonLink href="/checkout" size="sm" variant="outline" className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 hover:!border-white/30">
                                Manage Plan
                            </ButtonLink>
                        </div>
                    </div>

                    {/* Mini stats bar */}
                    <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-white/10 pt-4">
                        {[
                            { icon: <Users className="w-3.5 h-3.5 text-sky-400" />,       label: "4 active teammates" },
                            { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />, label: "284 tasks this week" },
                            { icon: <Clock3 className="w-3.5 h-3.5 text-amber-400" />,    label: "16m avg cycle time" },
                            { icon: <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />, label: "100% teammate uptime" },
                            { icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />, label: "$24,375 saved this month" },
                        ].map(({ icon, label }) => (
                            <div key={label} className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                {icon}
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Widgets ──────────────────────────────────────────────────── */}
            <div className="space-y-6">

                {/* KPI cards */}
                <KpiCards />

                {/* Provisioning + Deployment */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <ProvisioningProgressCard />
                    <DeploymentStatusPanel />
                </div>

                {/* Workers table + Approval queue */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* Workers table */}
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
                                    <Users className="w-3.5 h-3.5 text-sky-600" />
                                </div>
                                <h2 className="text-sm font-bold text-slate-900">Active AI Teammates</h2>
                            </div>
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                Live
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[580px]" role="grid">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        {["Teammate", "Status", "Tasks", "PRs", "Reliability"].map((h) => (
                                            <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {workers.map((w) => (
                                        <tr key={w.name} className="hover:bg-slate-50 transition-colors group cursor-pointer">
                                            <td className="px-5 py-3.5">
                                                <Link href={`/dashboard/agents/${w.slug}`} className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-xl ring-1 ${w.ring} flex items-center justify-center text-xs font-bold shrink-0 ${w.color}`}>
                                                        {w.initials}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-900 text-sm group-hover:text-sky-600 transition-colors">{w.name}</p>
                                                        <p className="text-xs text-slate-400">{w.role}</p>
                                                    </div>
                                                </Link>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${w.status === "Active" ? "text-emerald-700 bg-emerald-100" : "text-amber-700 bg-amber-100"}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${w.status === "Active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                                    {w.status}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="font-bold text-slate-800 tabular-nums">{w.tasks}</span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="font-bold text-slate-800 tabular-nums">{w.prs}</span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" style={{ width: `${w.reliability}%` }} />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-700 tabular-nums">{w.reliability}%</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                            <ButtonLink href="/dashboard/agents" size="sm" variant="ghost" className="w-full justify-center">
                                View all agents <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                            </ButtonLink>
                        </div>
                    </div>

                    {/* Approval queue */}
                    <OverviewApprovalQueue />
                </div>

                {/* Weekly Activity + Timeline + Ops Health */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Weekly task activity bar chart */}
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-900">Weekly Task Activity</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Tasks completed per day this week</p>
                        </div>
                        <div className="p-5">
                            {/* Bar chart */}
                            <div className="flex items-end gap-[6px]" style={{ height: "96px" }}>
                                {weeklyActivity.map((d) => {
                                    const heightPct = Math.max(8, Math.round((d.tasks / maxTasks) * 100));
                                    const isToday = d.day === "Mon";
                                    return (
                                        <div key={d.day} className="flex-1 flex flex-col items-center gap-1" style={{ height: "100%" }}>
                                            {/* Value label — always visible */}
                                            <span className="text-[10px] font-bold tabular-nums" style={{ color: isToday ? "#0ea5e9" : "#94a3b8" }}>
                                                {d.tasks}
                                            </span>
                                            {/* Bar grows from bottom */}
                                            <div className="flex-1 w-full flex flex-col justify-end">
                                                <div
                                                    className="w-full rounded-t-[4px] transition-all duration-500"
                                                    style={{
                                                        height: `${heightPct}%`,
                                                        background: isToday ? "#0ea5e9" : "#bae6fd",
                                                    }}
                                                />
                                            </div>
                                            {/* Day label */}
                                            <span className="text-[10px] font-semibold" style={{ color: isToday ? "#0f172a" : "#94a3b8" }}>
                                                {d.day}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Totals row */}
                            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                                    <p className="text-lg font-extrabold text-slate-900 tabular-nums">284</p>
                                    <p className="text-[11px] text-slate-400 font-medium">Tasks this week</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                                    <p className="text-lg font-extrabold text-sky-600 tabular-nums">+18%</p>
                                    <p className="text-[11px] text-slate-400 font-medium">vs last week</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Execution timeline */}
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-900">Execution Timeline</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Today · {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                        </div>
                        <div className="p-5 overflow-y-auto max-h-[340px]">
                            <div className="space-y-0">
                                {timeline.map((item, i) => (
                                    <div key={i} className="flex items-start gap-3 pb-5 last:pb-0 group">
                                        {/* Dot + connector line */}
                                        <div className="flex flex-col items-center shrink-0 pt-0.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm shrink-0 ${riskStyles[item.risk].dot}`} />
                                            {i < timeline.length - 1 && (
                                                <div className="w-px flex-1 mt-1 bg-gradient-to-b from-slate-200 to-transparent" style={{ minHeight: "36px" }} />
                                            )}
                                        </div>
                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[11px] font-mono font-semibold text-slate-500 tabular-nums">{item.time}</span>
                                                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide ${riskStyles[item.risk].badge}`}>
                                                    {item.risk}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-700 leading-snug">{item.event}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Ops Health */}
                    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-emerald-100 bg-emerald-50/50">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-900">Ops Health</h2>
                                    <p className="text-xs text-emerald-600 font-semibold">All systems normal</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 space-y-2">
                            {healthItems.map(({ label, value, good }) => (
                                <div key={label} className="flex items-center justify-between rounded-xl bg-white/80 border border-white px-4 py-2.5 shadow-sm">
                                    <p className="text-xs text-slate-600">{label}</p>
                                    <span className={`font-bold text-xs flex items-center gap-1.5 ${good ? "text-emerald-600" : "text-amber-600"}`}>
                                        {good
                                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                            : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                        {value}
                                    </span>
                                </div>
                            ))}

                            <div className="pt-2 flex flex-wrap gap-2">
                                <ButtonLink href="/dashboard/activity" variant="outline" size="sm">Live Activity</ButtonLink>
                                <ButtonLink href="/docs" variant="outline" size="sm">View Runbook</ButtonLink>
                                <ButtonLink href="/how-it-works" size="sm">
                                    Scale Teammates <Rocket className="w-3.5 h-3.5 ml-1" />
                                </ButtonLink>
                            </div>
                        </div>
                    </div>

                </div>
            </div>{/* end widgets */}
            </div>{/* end shared container */}
        </div>
    );
}
