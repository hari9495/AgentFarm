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
import { portalFetch } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Customer Dashboard · AgentFarms",
    description: "Track AI teammate output, task execution, and team outcomes in one dashboard.",
};

// ── Types ────────────────────────────────────────────────────────────────────

interface BotRecord {
    id: string;
    role: string;
    status: string;
    workspaceId: string;
    workspace: { name: string };
}

interface AgentUsageStat {
    botId: string;
    botRole: string;
    taskCount: number;
    successRate: number;
    totalCostUsd: number;
}

interface UsageData {
    totalTasks: number;
    successRate: number;
    totalCostUsd: number;
    tasksByDay: Array<{ date: string; count: number }>;
}

interface MessageRecord {
    id: string;
    messageType: string;
    subject: string | null;
    body: string | null;
    status: string;
    createdAt: string;
    fromBot: { id: string; role: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_NAMES: Record<string, string> = {
    developer:                  "AI Developer",
    full_stack_developer:       "AI Full-Stack Developer",
    business_analyst:           "AI Business Analyst",
    sales_agent:                "AI Sales Agent",
    recruiter:                  "AI Recruiter",
    content_writer:             "AI Content Writer",
    technical_writer:           "AI Technical Writer",
    project_manager:            "AI Project Manager",
    marketing_specialist:       "AI Marketing Specialist",
    devops:                     "AI DevOps Engineer",
    customer_support_executive: "AI Customer Support",
    corporate_assistant:        "AI Corporate Assistant",
    mobile:                     "AI Mobile Developer",
    tester:                     "AI Tester",
    meeting_agent:              "AI Meeting Agent",
};

const ROLE_STYLES = [
    { color: "text-sky-600",    ring: "ring-sky-200 bg-sky-50"    },
    { color: "text-violet-600", ring: "ring-violet-200 bg-violet-50" },
    { color: "text-amber-600",  ring: "ring-amber-200 bg-amber-50"  },
    { color: "text-rose-600",   ring: "ring-rose-200 bg-rose-50"    },
    { color: "text-emerald-600",ring: "ring-emerald-200 bg-emerald-50" },
    { color: "text-indigo-600", ring: "ring-indigo-200 bg-indigo-50" },
];

function botDisplayName(role: string): string {
    return ROLE_NAMES[role] ?? role.split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
}

function botInitials(role: string): string {
    return botDisplayName(role).replace(/^AI /, "").split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function botStyle(idx: number) {
    return ROLE_STYLES[idx % ROLE_STYLES.length]!;
}

function buildWeeklyActivity(tasksByDay: Array<{ date: string; count: number }>) {
    const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const byDate = new Map(tasksByDay.map((d) => [d.date, d.count]));
    const days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0]!;
        days.push({ day: DAY_NAMES[d.getDay()]!, tasks: byDate.get(dateStr) ?? 0, prs: 0 });
    }
    return days;
}

function messageToTimelineEvent(msg: MessageRecord): { time: string; event: string; risk: "low" | "medium" | "high" } {
    const time = new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const agentName = msg.fromBot ? botDisplayName(msg.fromBot.role) : "System";
    const event = msg.subject ?? msg.body?.slice(0, 120) ?? `${agentName} sent a ${msg.messageType} message`;
    const risk: "low" | "medium" | "high" =
        msg.messageType === "alert" || msg.messageType === "error" ? "high"
        : msg.messageType === "warning" ? "medium"
        : "low";
    return { time, event, risk };
}

const riskStyles = {
    low:    { badge: "text-emerald-700 bg-emerald-100", dot: "bg-emerald-500" },
    medium: { badge: "text-amber-700 bg-amber-100",     dot: "bg-amber-500"   },
    high:   { badge: "text-rose-700 bg-rose-100",       dot: "bg-rose-500"    },
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
    const [usage, agentsData, agentUsage, messagesData] = await Promise.all([
        portalFetch<UsageData>("/portal/data/usage"),
        portalFetch<{ agents: BotRecord[]; total: number }>("/portal/data/agents?limit=20"),
        portalFetch<{ agents: AgentUsageStat[] }>("/portal/data/usage/agents"),
        portalFetch<{ messages: MessageRecord[]; total: number }>("/portal/data/messages?limit=8"),
    ]);

    const bots = agentsData?.agents ?? [];
    const usageByBot = new Map((agentUsage?.agents ?? []).map((a) => [a.botId, a]));

    // Merge bots with usage stats
    const workers = bots.map((bot, idx) => {
        const stats = usageByBot.get(bot.id);
        const style = botStyle(idx);
        return {
            name: botDisplayName(bot.role),
            slug: bot.id,
            initials: botInitials(bot.role),
            role: bot.role.split("_").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" "),
            status: bot.status === "active" ? "Active" : bot.status === "needs_review" ? "Needs review" : bot.status,
            tasks: stats?.taskCount ?? 0,
            reliability: stats ? Math.round(stats.successRate * 10) / 10 : 0,
            color: style.color,
            ring: style.ring,
        };
    });

    // Weekly activity from real task data
    const weeklyActivity = buildWeeklyActivity(usage?.tasksByDay ?? []);
    const maxTasks = Math.max(...weeklyActivity.map((d) => d.tasks), 1);

    // Timeline from real messages
    const timeline = (messagesData?.messages ?? []).map(messageToTimelineEvent);

    // Health items — mix of real and computed
    const successRatePct = usage ? Math.round(usage.successRate * 10) / 10 : null;
    const healthItems = [
        { label: "Task success rate",       value: successRatePct !== null ? `${successRatePct}%` : "—", good: successRatePct === null || successRatePct >= 95 },
        { label: "Active AI teammates",     value: bots.length > 0 ? String(bots.filter(b => b.status === "active").length) : "—", good: true },
        { label: "Total tasks (30 days)",   value: usage ? String(usage.totalTasks) : "—", good: true },
        { label: "Total cost (30 days)",    value: usage?.totalCostUsd != null ? `$${usage.totalCostUsd.toFixed(2)}` : "—", good: true },
    ];

    // Hero mini stats
    const thisWeekTasks = weeklyActivity.reduce((sum, d) => sum + d.tasks, 0);
    const activeCount = bots.filter(b => b.status === "active").length;

    return (
        <div className="site-shell min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

            {/* ── Hero ──────────────────────────────────────────────────────── */}
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
                            <ButtonLink href="/dashboard/billing" size="sm" variant="outline" className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 hover:!border-white/30">
                                Manage Plan
                            </ButtonLink>
                        </div>
                    </div>

                    {/* Mini stats bar */}
                    <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-white/10 pt-4">
                        {[
                            { icon: <Users className="w-3.5 h-3.5 text-sky-400" />,            label: `${activeCount > 0 ? activeCount : bots.length || "—"} active teammate${activeCount !== 1 ? "s" : ""}` },
                            { icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,  label: `${thisWeekTasks > 0 ? thisWeekTasks : "—"} tasks this week` },
                            { icon: <Clock3 className="w-3.5 h-3.5 text-amber-400" />,          label: successRatePct !== null ? `${successRatePct}% success rate` : "No task data yet" },
                            { icon: <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />,    label: "Task isolation enforced" },
                            { icon: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />,    label: usage?.totalCostUsd != null ? `$${usage.totalCostUsd.toFixed(0)} AI cost this month` : "No billing data" },
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

                        {workers.length === 0 ? (
                            <div className="px-6 py-10 text-center">
                                <p className="text-sm text-slate-500">No AI teammates yet.</p>
                                <ButtonLink href="/marketplace" size="sm" className="mt-3">Browse Marketplace</ButtonLink>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[520px]" role="grid">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            {["Teammate", "Status", "Tasks", "Reliability"].map((h) => (
                                                <th key={h} className="text-left px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {workers.map((w) => (
                                            <tr key={w.slug} className="hover:bg-slate-50 transition-colors group cursor-pointer">
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
                                                    {w.reliability > 0 ? (
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-20 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500" style={{ width: `${w.reliability}%` }} />
                                                            </div>
                                                            <span className="text-xs font-bold text-slate-700 tabular-nums">{w.reliability}%</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-slate-400">No data</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
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

                    {/* Weekly task activity */}
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-900">Weekly Task Activity</h2>
                            <p className="text-xs text-slate-400 mt-0.5">Tasks completed per day — last 7 days</p>
                        </div>
                        <div className="p-5">
                            <div className="flex items-end gap-[6px]" style={{ height: "96px" }}>
                                {weeklyActivity.map((d, idx) => {
                                    const heightPct = Math.max(8, Math.round((d.tasks / maxTasks) * 100));
                                    const isToday = idx === weeklyActivity.length - 1;
                                    return (
                                        <div key={`${d.day}-${idx}`} className="flex-1 flex flex-col items-center gap-1" style={{ height: "100%" }}>
                                            <span className="text-[10px] font-bold tabular-nums" style={{ color: isToday ? "#0ea5e9" : "#94a3b8" }}>
                                                {d.tasks > 0 ? d.tasks : ""}
                                            </span>
                                            <div className="flex-1 w-full flex flex-col justify-end">
                                                <div
                                                    className="w-full rounded-t-[4px] transition-all duration-500"
                                                    style={{ height: `${heightPct}%`, background: isToday ? "#0ea5e9" : "#bae6fd" }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-semibold" style={{ color: isToday ? "#0f172a" : "#94a3b8" }}>
                                                {d.day}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3">
                                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                                    <p className="text-lg font-extrabold text-slate-900 tabular-nums">{thisWeekTasks > 0 ? thisWeekTasks : "—"}</p>
                                    <p className="text-[11px] text-slate-400 font-medium">Tasks this week</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-center">
                                    <p className="text-lg font-extrabold text-slate-900 tabular-nums">{usage?.totalTasks ?? "—"}</p>
                                    <p className="text-[11px] text-slate-400 font-medium">Total (30 days)</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Execution timeline */}
                    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h2 className="text-sm font-bold text-slate-900">Agent Messages</h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                        </div>
                        <div className="p-5 overflow-y-auto max-h-[340px]">
                            {timeline.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-6">No agent messages yet.</p>
                            ) : (
                                <div className="space-y-0">
                                    {timeline.map((item, i) => (
                                        <div key={i} className="flex items-start gap-3 pb-5 last:pb-0">
                                            <div className="flex flex-col items-center shrink-0 pt-0.5">
                                                <span className={`w-2.5 h-2.5 rounded-full ring-2 ring-white shadow-sm shrink-0 ${riskStyles[item.risk].dot}`} />
                                                {i < timeline.length - 1 && (
                                                    <div className="w-px flex-1 mt-1 bg-gradient-to-b from-slate-200 to-transparent" style={{ minHeight: "36px" }} />
                                                )}
                                            </div>
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
                            )}
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
                                    <p className="text-xs text-emerald-600 font-semibold">
                                        {bots.length === 0 ? "No agents yet" : "Live metrics"}
                                    </p>
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
            </div>
            </div>
        </div>
    );
}
