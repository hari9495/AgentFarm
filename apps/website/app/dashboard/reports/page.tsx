import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BarChart3, CheckCircle2, ChevronRight, Clock, ShieldAlert, TrendingUp, Users } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import {
    getSessionUser,
    listApprovals,
    listBots,
    type ApprovalRecord,
    type ApprovalRisk,
    type BotRecord,
} from "@/lib/auth-store";

export const metadata: Metadata = {
    title: "Reports & Analytics - AgentFarms Dashboard",
    description: "Agent output, reliability, and risk distribution derived from live approval and deployment activity.",
};

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

const tones = ["sky", "violet", "amber", "rose"] as const;

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
    "—": "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const riskColor: Record<ApprovalRisk, string> = {
    low: "bg-emerald-500",
    medium: "bg-amber-500",
    high: "bg-rose-500",
};

const riskLabel: Record<ApprovalRisk, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
};

const DAY_MS = 86_400_000;
const dayInitials = ["S", "M", "T", "W", "T", "F", "S"];

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "??";
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function dominantRisk(approvals: ApprovalRecord[]): string {
    if (approvals.length === 0) return "—";
    const counts: Record<ApprovalRisk, number> = { low: 0, medium: 0, high: 0 };
    approvals.forEach((a) => { counts[a.risk] += 1; });
    if (counts.high > 0 && counts.high >= counts.medium && counts.high >= counts.low) return "High";
    if (counts.medium > 0 && counts.medium >= counts.low) return "Medium";
    if (counts.low > 0) return "Low";
    return "—";
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)}h`;
    return `${(seconds / 86_400).toFixed(1)}d`;
}

function SparkBars({ values, labels }: { values: number[]; labels: string[] }) {
    const max = Math.max(1, ...values);
    return (
        <div className="flex items-end gap-1.5 h-14">
            {values.map((v, i) => {
                const pct = Math.round((v / max) * 100);
                return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full h-10 flex items-end">
                            <div
                                className="w-full rounded-t-sm bg-emerald-400 dark:bg-emerald-500 transition-all"
                                style={{ height: `${v === 0 ? 4 : Math.max(8, pct)}%` }}
                            />
                        </div>
                        <span className="text-[8px] text-slate-400">{labels[i]}</span>
                    </div>
                );
            })}
        </div>
    );
}

export default async function DashboardReportsPage() {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    if (!token) redirect("/login");

    const user = await getSessionUser(token!);
    if (!user) redirect("/login");

    const tenantId = user.tenantId ?? undefined;

    const [bots, pending, approved, rejected] = await Promise.all([
        listBots(),
        listApprovals({ status: "pending", tenantId, limit: 200 }),
        listApprovals({ status: "approved", tenantId, limit: 200 }),
        listApprovals({ status: "rejected", tenantId, limit: 200 }),
    ]);

    const allApprovals: ApprovalRecord[] = [...pending, ...approved, ...rejected];
    const decided = [...approved, ...rejected];

    const now = Date.now();
    const sevenDaysAgo = now - 7 * DAY_MS;
    const recentApprovals = allApprovals.filter((a) => a.createdAt >= sevenDaysAgo);
    const recentHighRisk = recentApprovals.filter((a) => a.risk === "high");

    const totalTasks = bots.reduce((sum, b) => sum + b.tasksCompleted, 0);
    const avgReliability = bots.length > 0
        ? `${(bots.reduce((sum, b) => sum + b.reliabilityPct, 0) / bots.length).toFixed(1)}%`
        : "—";
    const activeAgents = bots.filter((b) => b.status === "active").length;

    const latencies = decided
        .map((a) => a.decisionLatencySeconds)
        .filter((s): s is number => typeof s === "number" && s > 0);
    const avgLatency = latencies.length > 0
        ? formatDuration(latencies.reduce((sum, s) => sum + s, 0) / latencies.length)
        : "—";

    const summaryCards = [
        { label: "Total Tasks Completed", value: totalTasks.toLocaleString(), icon: CheckCircle2, tone: "sky" as const },
        { label: "Approval Requests (7d)", value: String(recentApprovals.length), icon: BarChart3, tone: "violet" as const },
        { label: "Avg Reliability", value: avgReliability, icon: TrendingUp, tone: "emerald" as const },
        { label: "High-Risk Actions (7d)", value: String(recentHighRisk.length), icon: ShieldAlert, tone: "rose" as const },
    ];

    const agentRows = bots.map((bot: BotRecord, index: number) => {
        const agentApprovals = allApprovals.filter((a) => a.agentSlug === bot.slug);
        const agentPending = agentApprovals.filter((a) => a.status === "pending").length;
        const agentDecided7d = agentApprovals.filter((a) => a.status !== "pending" && (a.decidedAt ?? 0) >= sevenDaysAgo).length;
        return {
            agent: bot.name,
            slug: bot.slug,
            initials: initialsFromName(bot.name),
            tasks: bot.tasksCompleted,
            pending: agentPending,
            decided7d: agentDecided7d,
            reliability: bot.reliabilityPct,
            riskScore: dominantRisk(agentApprovals),
            tone: tones[index % tones.length],
        };
    });

    const riskCounts: Record<ApprovalRisk, number> = { low: 0, medium: 0, high: 0 };
    allApprovals.forEach((a) => { riskCounts[a.risk] += 1; });
    const riskTotal = allApprovals.length;
    const riskDist = (["low", "medium", "high"] as ApprovalRisk[]).map((risk) => ({
        label: `${riskLabel[risk]} Risk`,
        count: riskCounts[risk],
        pct: riskTotal > 0 ? Math.round((riskCounts[risk] / riskTotal) * 100) : 0,
        color: riskColor[risk],
    }));

    const dailyVolume: number[] = [];
    const dailyLabels: string[] = [];
    for (let i = 6; i >= 0; i -= 1) {
        const dayStart = now - i * DAY_MS;
        const date = new Date(dayStart);
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        const endOfDay = startOfDay + DAY_MS;
        dailyVolume.push(allApprovals.filter((a) => a.createdAt >= startOfDay && a.createdAt < endOfDay).length);
        dailyLabels.push(dayInitials[date.getDay()] ?? "?");
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-400">
                                <BarChart3 className="w-3.5 h-3.5" />
                                Reports
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Analytics</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">Reports & Analytics</h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">Agent output, reliability, and risk distribution derived from live approval activity.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Summary KPIs */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {summaryCards.map(({ label, value, icon, tone }) => (
                        <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <div className="flex items-center justify-between mb-3">
                                <PremiumIcon icon={icon} tone={tone} containerClassName="w-9 h-9 rounded-xl" iconClassName="w-4.5 h-4.5" />
                            </div>
                            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Agent output table */}
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                <PremiumIcon icon={Users} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                                Agent Output
                            </h2>
                            <span className="text-[10px] text-slate-400 font-mono">Lifetime totals · approvals last 7d</span>
                        </div>
                        {agentRows.length === 0 ? (
                            <div className="px-5 py-12 text-center">
                                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No agents deployed yet</p>
                                <p className="text-xs text-slate-400 mt-1">Deploy an agent to start collecting output and reliability data.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[580px] text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            <th className="text-left px-5 py-3">Agent</th>
                                            <th className="text-left px-4 py-3">Tasks</th>
                                            <th className="text-left px-4 py-3">Pending</th>
                                            <th className="text-left px-4 py-3">Decided (7d)</th>
                                            <th className="text-left px-4 py-3">Reliability</th>
                                            <th className="text-left px-4 py-3">Risk</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                        {agentRows.map((row) => (
                                            <tr key={row.slug} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold ${toneClass[row.tone]}`}>{row.initials}</span>
                                                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{row.agent}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">{row.tasks}</td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{row.pending}</td>
                                                <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">{row.decided7d}</td>
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
                        )}
                    </div>

                    {/* Risk distribution + approval volume */}
                    <div className="space-y-4">
                        {/* Risk distribution */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                                <PremiumIcon icon={ShieldAlert} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3.5 h-3.5" />
                                Risk Distribution
                            </h3>
                            {riskTotal === 0 ? (
                                <p className="text-xs text-slate-400">No approval requests recorded yet.</p>
                            ) : (
                                <>
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
                                </>
                            )}
                        </div>

                        {/* Approval volume trend */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                                <PremiumIcon icon={TrendingUp} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" />
                                Approval Volume
                            </h3>
                            <p className="text-[10px] text-slate-400 mb-4">Requests per day, last 7 days</p>
                            <SparkBars values={dailyVolume} labels={dailyLabels} />
                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className="text-slate-500 dark:text-slate-400">7-day total</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{recentApprovals.length}</span>
                            </div>
                        </div>

                        {/* Decision latency */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <PremiumIcon icon={Clock} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Avg. Decision Latency</h3>
                            </div>
                            <p className="text-3xl font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">{avgLatency}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {latencies.length > 0
                                    ? `Across ${latencies.length} decided approval${latencies.length === 1 ? "" : "s"}`
                                    : "No decided approvals recorded yet"}
                            </p>
                            <div className="mt-3 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                <Users className="w-3.5 h-3.5" /> {activeAgents} of {bots.length} agent{bots.length === 1 ? "" : "s"} active
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
