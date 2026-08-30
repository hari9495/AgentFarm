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
    sky: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    violet: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    amber: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    rose: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
};

const riskBadge: Record<string, string> = {
    Low: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]",
    Medium: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    High: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
    "—": "bg-[var(--bg-deep)] text-[color:var(--ink-muted)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]",
};

type ApprovalRisk = "low" | "medium" | "high";

const riskColor: Record<ApprovalRisk, string> = {
    low: "bg-[var(--ok)]",
    medium: "bg-[var(--warn)]",
    high: "bg-[var(--danger)]",
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
                                className="w-full rounded-t-sm bg-[var(--ok)] dark:bg-[var(--ok)] transition-all"
                                style={{ height: `${v === 0 ? 4 : Math.max(8, pct)}%` }}
                            />
                        </div>
                        <span className="text-[8px] text-[color:var(--ink-muted)]">{labels[i]}</span>
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
        <div className="min-h-screen bg-[var(--bg-deep)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <BarChart3 className="w-3.5 h-3.5" />
                                Reports
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Analytics</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Reports & Analytics</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Agent output, reliability, and risk distribution derived from live approval activity.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Summary KPIs */}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                    {summaryCards.map(({ label, value, icon, tone }) => (
                        <div key={label} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                            <div className="flex items-center justify-between mb-3">
                                <PremiumIcon icon={icon} tone={tone} containerClassName="w-9 h-9 rounded-[3px]" iconClassName="w-4.5 h-4.5" />
                            </div>
                            <p className="text-2xl font-extrabold text-[color:var(--ink)] dark:text-[color:var(--ink)] tabular-nums">{value}</p>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">{label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Agent output table */}
                    <div className="xl:col-span-2 rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
                        <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                            <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-2">
                                <PremiumIcon icon={Users} tone="sky" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                                Agent Output
                            </h2>
                            <span className="text-[10px] text-[color:var(--ink-muted)] font-mono">Lifetime totals · approvals last 7d</span>
                        </div>
                        {agentRows.length === 0 ? (
                            <div className="px-5 py-12 text-center">
                                <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">No agents deployed yet</p>
                                <p className="text-xs text-[color:var(--ink-muted)] mt-1">Deploy an agent to start collecting output and reliability data.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[580px] text-sm">
                                    <thead>
                                        <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                            <th className="text-left px-5 py-3">Agent</th>
                                            <th className="text-left px-4 py-3">Tasks</th>
                                            <th className="text-left px-4 py-3">Pending</th>
                                            <th className="text-left px-4 py-3">Decided (7d)</th>
                                            <th className="text-left px-4 py-3">Reliability</th>
                                            <th className="text-left px-4 py-3">Risk</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                                        {agentRows.map((row) => (
                                            <tr key={row.slug} className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold ${toneClass[row.tone]}`}>{row.initials}</span>
                                                        <span className="text-xs font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{row.agent}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{row.tasks}</td>
                                                <td className="px-4 py-3.5 font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{row.pending}</td>
                                                <td className="px-4 py-3.5 font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{row.decided7d}</td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-1.5 rounded-full bg-[var(--line)] dark:bg-[var(--card)]">
                                                            <div className="h-1.5 rounded-full bg-[var(--ok)]" style={{ width: `${row.reliability}%` }} />
                                                        </div>
                                                        <span className="text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{row.reliability}%</span>
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
                        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                            <h3 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-4 flex items-center gap-2">
                                <PremiumIcon icon={ShieldAlert} tone="amber" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 text-[color:var(--warn)] dark:text-[color:var(--warn)]" iconClassName="w-3.5 h-3.5" />
                                Risk Distribution
                            </h3>
                            {riskTotal === 0 ? (
                                <p className="text-xs text-[color:var(--ink-muted)]">No approval requests recorded yet.</p>
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
                                                <span className="flex items-center gap-1.5 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                                    <span className={`w-2 h-2 rounded-full ${r.color}`} />
                                                    {r.label}
                                                </span>
                                                <span className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{r.count} <span className="font-normal text-[color:var(--ink-muted)]">({r.pct}%)</span></span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Approval volume trend */}
                        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                            <h3 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-1 flex items-center gap-2">
                                <PremiumIcon icon={TrendingUp} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" />
                                Approval Volume
                            </h3>
                            <p className="text-[10px] text-[color:var(--ink-muted)] mb-4">Requests per day, last 7 days</p>
                            <SparkBars values={dailyVolume} labels={dailyLabels} />
                            <div className="mt-3 flex items-center justify-between text-xs">
                                <span className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">7-day total</span>
                                <span className="font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)]">{approvals7d.length}</span>
                            </div>
                        </div>

                        {/* Decision latency */}
                        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <PremiumIcon icon={Clock} tone="sky" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                                <h3 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Avg. Decision Latency</h3>
                            </div>
                            <p className="text-3xl font-extrabold text-[color:var(--accent)] dark:text-[color:var(--accent)] tabular-nums">{avgLatencyLabel}</p>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">
                                {latencies.length > 0
                                    ? `Across ${latencies.length} decided ${latencies.length === 1 ? "approval" : "approvals"}`
                                    : "No decided approvals recorded yet"}
                            </p>
                            <div className="mt-3 flex items-center gap-1 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] font-semibold">
                                <Users className="w-3.5 h-3.5" /> {agentRows.length} {agentRows.length === 1 ? "agent" : "agents"} active
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
