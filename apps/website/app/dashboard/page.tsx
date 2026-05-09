import type { Metadata } from "next";
import Link from "next/link";
import {
    ArrowUpRight,
    CheckCircle2,
    ChevronRight,
    Clock3,
    GitPullRequest,
    LayoutGrid,
    Rocket,
    ShieldCheck,
    Timer,
    TrendingUp,
    Users,
    Zap,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import DeploymentStatusPanel from "@/components/dashboard/DeploymentStatusPanel";
import ProvisioningProgressCard from "@/components/dashboard/ProvisioningProgressCard";
import PremiumIcon from "@/components/shared/PremiumIcon";

export const metadata: Metadata = {
    title: "Customer Dashboard · AgentFarm",
    description: "Track AI teammate output, task execution, and team outcomes in one dashboard.",
};

// ── Mini sparkline ──────────────────────────────────────────────────────────
function Sparkline({ values, color }: { values: number[]; color: string }) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const w = 100;
    const h = 28;
    const pts = values
        .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`)
        .join(" ");
    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            className={`w-full h-7 ${color}`}
            aria-hidden
            preserveAspectRatio="none"
        >
            <polyline
                points={pts}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
            />
        </svg>
    );
}

// ── Data ────────────────────────────────────────────────────────────────────
const stats = [
    {
        label: "Tasks Completed",
        sub: "Last 7 days",
        value: "184",
        delta: "+19%",
        positive: true,
        icon: CheckCircle2,
        accent: "sky",
        gradient: "from-sky-500/10 to-sky-500/5",
        border: "border-sky-500/20",
        glow: "shadow-sky-500/10",
        iconBg: "bg-sky-500/10",
        iconColor: "text-sky-500 dark:text-sky-400",
        deltaColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
        sparkColor: "text-sky-500",
        trend: [140, 152, 165, 158, 172, 181, 184],
    },
    {
        label: "PRs Merged",
        sub: "Last 7 days",
        value: "46",
        delta: "+12%",
        positive: true,
        icon: GitPullRequest,
        accent: "violet",
        gradient: "from-violet-500/10 to-violet-500/5",
        border: "border-violet-500/20",
        glow: "shadow-violet-500/10",
        iconBg: "bg-violet-500/10",
        iconColor: "text-violet-500 dark:text-violet-400",
        deltaColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
        sparkColor: "text-violet-500",
        trend: [32, 38, 41, 43, 40, 44, 46],
    },
    {
        label: "Median Cycle Time",
        sub: "vs last week",
        value: "2h 18m",
        delta: "−28%",
        positive: true,
        icon: Timer,
        accent: "amber",
        gradient: "from-amber-500/10 to-amber-500/5",
        border: "border-amber-500/20",
        glow: "shadow-amber-500/10",
        iconBg: "bg-amber-500/10",
        iconColor: "text-amber-500 dark:text-amber-400",
        deltaColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
        sparkColor: "text-amber-500",
        trend: [220, 208, 195, 182, 170, 160, 138],
    },
    {
        label: "Estimated Savings",
        sub: "Month to date",
        value: "$18,400",
        delta: "+$3,200",
        positive: true,
        icon: TrendingUp,
        accent: "emerald",
        gradient: "from-emerald-500/10 to-emerald-500/5",
        border: "border-emerald-500/20",
        glow: "shadow-emerald-500/10",
        iconBg: "bg-emerald-500/10",
        iconColor: "text-emerald-500 dark:text-emerald-400",
        deltaColor: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
        sparkColor: "text-emerald-500",
        trend: [12000, 13200, 14500, 15100, 16800, 17200, 18400],
    },
];

const workers = [
    { name: "AI Backend Developer", initials: "AB", role: "Backend", status: "Active", tasks: 34, prs: 11, reliability: 99.2, color: "text-sky-400", ring: "ring-sky-500/20 bg-sky-500/10" },
    { name: "AI QA Engineer", initials: "AQ", role: "Quality", status: "Active", tasks: 52, prs: 0, reliability: 99.6, color: "text-violet-400", ring: "ring-violet-500/20 bg-violet-500/10" },
    { name: "AI DevOps Engineer", initials: "AD", role: "DevOps", status: "Active", tasks: 18, prs: 7, reliability: 98.9, color: "text-amber-400", ring: "ring-amber-500/20 bg-amber-500/10" },
    { name: "AI Security Engineer", initials: "AS", role: "Security", status: "Needs review", tasks: 7, prs: 2, reliability: 99.7, color: "text-rose-400", ring: "ring-rose-500/20 bg-rose-500/10" },
];

const approvals = [
    { title: "Deploy production hotfix for auth timeout", risk: "high" as const, by: "AI Backend Developer", age: "12m ago" },
    { title: "Merge migration changing customer schema", risk: "high" as const, by: "AI DevOps Engineer", age: "28m ago" },
    { title: "Rotate cloud token for build worker", risk: "medium" as const, by: "AI Security Engineer", age: "1h ago" },
];

const timeline = [
    { time: "10:42", event: "AI Backend Developer opened PR #482 for billing webhook retries", risk: "low" as const },
    { time: "09:31", event: "AI QA Engineer ran full regression suite and posted report", risk: "low" as const },
    { time: "08:57", event: "AI DevOps Engineer rolled out canary deploy to staging", risk: "medium" as const },
    { time: "08:12", event: "AI Security Engineer flagged outdated auth dependency", risk: "high" as const },
];

const healthItems = [
    { label: "Security policy compliance", value: "Pass", good: true },
    { label: "SLA adherence this week", value: "97.4%", good: false },
    { label: "Median first response", value: "11m", good: false },
    { label: "Active teammate uptime", value: "100%", good: false },
];

const riskStyles = {
    low: {
        badge: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
        dot: "bg-emerald-500",
        glow: "shadow-emerald-500/20",
    },
    medium: {
        badge: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
        dot: "bg-amber-500",
        glow: "shadow-amber-500/20",
    },
    high: {
        badge: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
        dot: "bg-rose-500",
        glow: "shadow-rose-500/20",
    },
};

// ── Page ────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
    return (
        <div className="site-shell min-h-screen bg-slate-50 dark:bg-slate-950">

            {/* ── Hero header ─────────────────────────────────────────────── */}
            <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800 bg-slate-950">
                {/* Gradient mesh */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                    <div
                        className="absolute inset-0 opacity-[0.04]"
                        style={{
                            backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)",
                            backgroundSize: "24px 24px",
                        }}
                    />
                </div>

                <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
                    {/* Breadcrumb label */}
                    <div className="flex items-center gap-2 mb-5">
                        <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-400">
                            <PremiumIcon
                                icon={LayoutGrid}
                                tone="sky"
                                containerClassName="w-4 h-4 rounded bg-sky-400/20 text-sky-300"
                                iconClassName="w-2.5 h-2.5"
                            />
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
                            <ButtonLink
                                href="/checkout"
                                size="sm"
                                variant="outline"
                                className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 hover:!border-white/30"
                            >
                                Manage Plan
                            </ButtonLink>
                        </div>
                    </div>

                    {/* Inline mini stats bar */}
                    <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-white/10 pt-6">
                        {[
                            { icon: <Users className="w-3.5 h-3.5 text-sky-400" />, label: "4 active teammates" },
                            { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />, label: "184 tasks this week" },
                            { icon: <Clock3 className="w-3.5 h-3.5 text-amber-400" />, label: "2h 18m avg cycle time" },
                            { icon: <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />, label: "100% teammate uptime" },
                        ].map(({ icon, label }) => (
                            <div key={label} className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                {icon}
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Main content ─────────────────────────────────────────────── */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">

                {/* Pending approvals alert */}
                {approvals.length > 0 && (
                    <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-5 py-3 flex items-center justify-between gap-3 shadow-lg shadow-amber-500/5 backdrop-blur-sm">
                            <div className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-500 text-white text-xs font-bold mr-1.5">
                                        {approvals.length}
                                    </span>
                                    approvals need your attention
                                </p>
                            </div>
                            <Link
                                href="/dashboard/approvals"
                                className="flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors whitespace-nowrap"
                            >
                                Review now
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </div>
                )}

                {/* ── KPI cards ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {stats.map(({ label, sub, value, delta, icon: Icon, gradient, border, glow, iconBg, iconColor, deltaColor, sparkColor, trend }) => (
                        <div
                            key={label}
                            className={`relative rounded-2xl border ${border} bg-gradient-to-br ${gradient} bg-white dark:bg-slate-900 p-5 flex flex-col gap-4 shadow-lg ${glow} overflow-hidden group hover:shadow-xl transition-shadow duration-300`}
                        >
                            {/* Subtle top glow line */}
                            <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent ${iconColor} opacity-30`} />

                            <div className="flex items-start justify-between gap-3">
                                <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                                    <Icon className={`w-5 h-5 ${iconColor}`} />
                                </div>
                                <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 ${deltaColor}`}>
                                    <ArrowUpRight className="w-3 h-3" />
                                    {delta}
                                </span>
                            </div>

                            <div>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums leading-none tracking-tight">
                                    {value}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
                            </div>

                            <Sparkline values={trend} color={sparkColor} />
                        </div>
                    ))}
                </div>

                {/* ── Provisioning + Deployment ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <ProvisioningProgressCard />
                    <DeploymentStatusPanel />
                </div>

                {/* ── Workers table + Approval queue ── */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                    {/* Workers table */}
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
                            <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center">
                                    <Users className="w-3.5 h-3.5 text-sky-500" />
                                </div>
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Active AI Teammates</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Live
                                </span>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[580px]">
                                <thead>
                                    <tr className="border-b border-slate-100 dark:border-slate-800">
                                        <th className="text-left px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Teammate
                                        </th>
                                        <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Status
                                        </th>
                                        <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Tasks
                                        </th>
                                        <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            PRs
                                        </th>
                                        <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            Reliability
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {workers.map((w) => (
                                        <tr
                                            key={w.name}
                                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-xl ring-1 ${w.ring} flex items-center justify-center text-xs font-bold shrink-0 ${w.color}`}>
                                                        {w.initials}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{w.name}</p>
                                                        <p className="text-xs text-slate-400 dark:text-slate-500">{w.role}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span
                                                    className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${
                                                        w.status === "Active"
                                                            ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40"
                                                            : "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40"
                                                    }`}
                                                >
                                                    <span
                                                        className={`w-1.5 h-1.5 rounded-full ${
                                                            w.status === "Active" ? "bg-emerald-500" : "bg-amber-500"
                                                        }`}
                                                    />
                                                    {w.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{w.tasks}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">{w.prs}</span>
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-20 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                                        <div
                                                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500"
                                                            style={{ width: `${w.reliability}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                                                        {w.reliability}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Approval queue */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Approval Queue</h2>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-extrabold shadow-sm shadow-rose-500/30">
                                {approvals.length}
                            </span>
                        </div>

                        <div className="p-4 space-y-3">
                            {approvals.map((item) => (
                                <div
                                    key={item.title}
                                    className="rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span
                                            className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 uppercase tracking-wide ${riskStyles[item.risk].badge}`}
                                        >
                                            {item.risk}
                                        </span>
                                        <span className="text-[11px] text-slate-400 dark:text-slate-500">{item.age}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug font-medium">{item.title}</p>
                                    <p className="text-[11px] text-slate-400 dark:text-slate-500">by {item.by}</p>
                                    <div className="flex gap-2 pt-0.5">
                                        <button className="flex-1 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.97] text-white py-2 transition-all shadow-sm shadow-emerald-500/20">
                                            Approve
                                        </button>
                                        <button className="flex-1 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/70 py-2 transition-all">
                                            Review
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <ButtonLink href="/dashboard/approvals" size="sm" variant="ghost" className="w-full justify-center mt-1">
                                Open full inbox
                                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                            </ButtonLink>
                        </div>
                    </div>
                </div>

                {/* ── Timeline + Ops Health ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Execution timeline */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Execution Timeline</h2>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Today · Apr 22, 2026</p>
                        </div>
                        <div className="p-6">
                            <div className="relative pl-8 space-y-0">
                                <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-slate-300 via-slate-200 to-transparent dark:from-slate-700 dark:via-slate-800" />
                                {timeline.map((item, i) => (
                                    <div key={i} className="relative pb-6 last:pb-0 group">
                                        <span
                                            className={`absolute -left-5 top-1 w-3.5 h-3.5 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-sm ${riskStyles[item.risk].dot} ${riskStyles[item.risk].glow} shadow-md`}
                                        />
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">{item.time}</span>
                                            <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 uppercase tracking-wide ${riskStyles[item.risk].badge}`}>
                                                {item.risk}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{item.event}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Ops Health */}
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-emerald-950/20 dark:via-slate-900 dark:to-sky-950/10 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-950/20">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Ops Health</h2>
                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">All systems normal</p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 space-y-2.5">
                            {healthItems.map(({ label, value, good }) => (
                                <div
                                    key={label}
                                    className="flex items-center justify-between rounded-xl bg-white/80 dark:bg-slate-900/60 border border-white dark:border-slate-800/60 px-4 py-3 shadow-sm"
                                >
                                    <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
                                    <span
                                        className={`font-bold text-sm flex items-center gap-1.5 ${
                                            good
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : "text-slate-900 dark:text-slate-100"
                                        }`}
                                    >
                                        {good && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                        {value}
                                    </span>
                                </div>
                            ))}

                            <div className="pt-3 flex flex-wrap gap-2.5">
                                <ButtonLink href="/dashboard/activity" variant="outline" size="sm">
                                    Live Activity
                                </ButtonLink>
                                <ButtonLink href="/docs" variant="outline" size="sm">
                                    View Runbook
                                </ButtonLink>
                                <ButtonLink href="/how-it-works" size="sm">
                                    Scale Teammates
                                    <Rocket className="w-3.5 h-3.5 ml-1" />
                                </ButtonLink>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
