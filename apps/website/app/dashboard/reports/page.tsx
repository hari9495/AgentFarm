import type { Metadata } from "next";
import { BarChart3, CheckCircle2, ChevronRight, Clock, ShieldAlert, TrendingUp, Users } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import { portalFetch } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Reports & Analytics - AgentFarms Dashboard",
    description: "Agent output, reliability, and risk distribution derived from live approval and deployment activity.",
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

type ApprovalRisk = "low" | "medium" | "high";

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

type AgentUsage = { botId: string; botRole: string; taskCount: number; successRate: number };
type PortalApproval = {
    agentSlug: string;
    risk: ApprovalRisk;
    status: string;
    createdAt: number;
    decidedAt: number | null;
    decisionLatencySeconds: number | null;
};

export default async function DashboardReportsPage() {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * DAY_MS;

    // Live data: per-agent task usage + approval activity from the portal API.
    const [agentUsageData, approvalsData] = await Promise.all([
        portalFetch<{ agents: AgentUsage[] }>("/portal/data/usage/agents"),
        portalFetch<{ approvals: PortalApproval[] }>("/portal/data/approvals?status=all&limit=200"),
    ]);
    const agentUsage = agentUsageData?.agents ?? [];
    const approvals = approvalsData?.approvals ?? [];
    const approvals7d = approvals.filter((a) => a.createdAt >= sevenDaysAgo);

    const agentRows = agentUsage.map((agent, index) => {
        const name = agent.botRole.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const agentApprovals = approvals.filter((a) => a.agentSlug === agent.botId);
        const highRisk = agentApprovals.some((a) => a.risk === "high");
        const mediumRisk = agentApprovals.some((a) => a.risk === "medium");
        return {
            agent: name,
            slug: agent.botId,
            initials: name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "AG",
            tasks: agent.taskCount,
            pending: agentApprovals.filter((a) => a.status === "pending").length,
            decided7d: agentApprovals.filter((a) => a.decidedAt !== null && a.decidedAt >= sevenDaysAgo).length,
            reliability: agent.taskCount > 0 ? Math.round(agent.successRate * 1000) / 10 : 0,
            riskScore: highRisk ? "High" : mediumRisk ? "Medium" : agentApprovals.length > 0 ? "Low" : "—",
            tone: tones[index % tones.length]!,
        };
    });

    const totalTasks = agentUsage.reduce((sum, a) => sum + a.taskCount, 0);
    const agentsWithTasks = agentUsage.filter((a) => a.taskCount > 0);
    const avgReliability = agentsWithTasks.length > 0
        ? `${(agentsWithTasks.reduce((sum, a) => sum + a.successRate, 0) / agentsWithTasks.length * 100).toFixed(1)}%`
        : "—";

    const summaryCards = [
        { label: "Total Tasks Completed", value: String(totalTasks), icon: CheckCircle2, tone: "sky" as const },
        { label: "Approval Requests (7d)", value: String(approvals7d.length), icon: BarChart3, tone: "violet" as const },
        { label: "Avg Reliability", value: avgReliability, icon: TrendingUp, tone: "emerald" as const },
        { label: "High-Risk Actions (7d)", value: String(approvals7d.filter((a) => a.risk === "high").length), icon: ShieldAlert, tone: "rose" as const },
    ];

    const riskCounts: Record<ApprovalRisk, number> = { low: 0, medium: 0, high: 0 };
    for (const a of approvals) {
        if (a.risk in riskCounts) riskCounts[a.risk] += 1;
    }
    const riskTotal = riskCounts.low + riskCounts.medium + riskCounts.high;
    const riskDist = (["low", "medium", "high"] as ApprovalRisk[]).map((risk) => ({
        label: `${riskLabel[risk]} Risk`,
        count: riskCounts[risk],
        pct: riskTotal > 0 ? Math.round((riskCounts[risk] / riskTotal) * 100) : 0,
        color: riskColor[risk],
    }));

    const dailyVolume: number[] = [];
    const dailyLabels: string[] = [];
    for (let i = 6; i >= 0; i -= 1) {
        const dayStart = new Date(now - i * DAY_MS);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = dayStart.getTime() + DAY_MS;
        dailyVolume.push(approvals.filter((a) => a.createdAt >= dayStart.getTime() && a.createdAt < dayEnd).length);
        dailyLabels.push(dayInitials[dayStart.getDay()] ?? "?");
    }

    const latencies = approvals
        .map((a) => a.decisionLatencySeconds)
        .filter((s): s is number => typeof s === "number");
    const avgLatencyLabel = latencies.length > 0
        ? `${Math.round(latencies.reduce((sum, s) => sum + s, 0) / latencies.length)}s`
        : "—";

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
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{approvals7d.length}</span>
                            </div>
                        </div>

                        {/* Decision latency */}
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <PremiumIcon icon={Clock} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Avg. Decision Latency</h3>
                            </div>
                            <p className="text-3xl font-extrabold text-sky-600 dark:text-sky-400 tabular-nums">{avgLatencyLabel}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {latencies.length > 0
                                    ? `Across ${latencies.length} decided ${latencies.length === 1 ? "approval" : "approvals"}`
                                    : "No decided approvals recorded yet"}
                            </p>
                            <div className="mt-3 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                <Users className="w-3.5 h-3.5" /> {agentRows.length} {agentRows.length === 1 ? "agent" : "agents"} active
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
