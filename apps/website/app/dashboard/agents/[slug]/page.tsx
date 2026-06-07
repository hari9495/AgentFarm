import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
    ArrowUpRight,
    CheckCircle2,
    Clock3,
    GitPullRequest,
    Shield,
    Timer,
    AlertTriangle,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import RiskyActionTrigger from "@/components/dashboard/RiskyActionTrigger";
import PremiumIcon from "@/components/shared/PremiumIcon";
import { getBotBySlug, listApprovals, type ApprovalRecord, type AutonomyLevel, type ApprovalPolicy, type BotStatus } from "@/lib/auth-store";

export const metadata: Metadata = {
    title: "Agent Detail - AgentFarms Dashboard",
};

const statusMeta: Record<BotStatus, { label: string; color: string }> = {
    active: { label: "Active", color: "bg-emerald-500" },
    paused: { label: "Paused", color: "bg-amber-500" },
    error: { label: "Needs review", color: "bg-rose-500" },
    maintenance: { label: "Maintenance", color: "bg-slate-400" },
};

const autonomyLabel: Record<AutonomyLevel, string> = {
    low: "Low — every action requires approval",
    medium: "Medium — risky actions require approval",
    high: "High — runs independently, audited after the fact",
};

const policyLabel: Record<ApprovalPolicy, string> = {
    "all": "All actions require approval",
    "medium-high": "Medium and high-risk actions require approval",
    "high-only": "Only high-risk actions require approval",
};

const riskBadge: Record<string, string> = {
    low: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
    medium: "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40",
    high: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
};

const decisionBadge: Record<string, string> = {
    requested: "text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-sky-900/40",
    approved: "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40",
    rejected: "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40",
};

function initialsFromName(name: string): string {
    const words = name.replace(/^AI\s+/i, "").split(/\s+/).filter(Boolean);
    return (words[0]?.[0] ?? "").concat(words[1]?.[0] ?? "").toUpperCase() || name.slice(0, 2).toUpperCase();
}

function formatRelativeTime(ts: number): string {
    if (!ts) return "Never";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(ts).toLocaleDateString();
}

function formatActiveDays(activeDays: string): string {
    const days = activeDays.split(",").map((d) => d.trim()).filter(Boolean);
    if (days.length === 7) return "Every day";
    if (days.length === 0) return "No scheduled days";
    return days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
}

type HistoryRow = {
    id: string;
    time: string;
    ts: number;
    action: string;
    detail: string;
    risk: string;
    outcome: "requested" | "approved" | "rejected";
};

function buildHistoryFromApprovals(approvals: ApprovalRecord[], limit: number): HistoryRow[] {
    const rows: HistoryRow[] = [];
    for (const approval of approvals) {
        rows.push({
            id: `${approval.id}-req`,
            time: formatRelativeTime(approval.createdAt),
            ts: approval.createdAt,
            action: "Approval requested",
            detail: `${approval.id} · ${approval.title}`,
            risk: approval.risk,
            outcome: "requested",
        });
        if (approval.decidedAt && approval.status !== "pending") {
            rows.push({
                id: `${approval.id}-dec`,
                time: formatRelativeTime(approval.decidedAt),
                ts: approval.decidedAt,
                action: approval.status === "approved" ? "Approval granted" : "Approval rejected",
                detail: `${approval.id} · ${approval.decidedBy ?? "operator"}${approval.reason ? ` — ${approval.reason}` : ""}`,
                risk: approval.risk,
                outcome: approval.status,
            });
        }
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, limit);
}

export default async function AgentDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const bot = await getBotBySlug(slug);
    if (!bot) notFound();

    const [pending, approved, rejected] = await Promise.all([
        listApprovals({ agentSlug: slug, status: "pending", limit: 25 }),
        listApprovals({ agentSlug: slug, status: "approved", limit: 25 }),
        listApprovals({ agentSlug: slug, status: "rejected", limit: 25 }),
    ]);
    const allApprovals = [...pending, ...approved, ...rejected];
    const history = buildHistoryFromApprovals(allApprovals, 8);

    const decided = approved.length + rejected.length;
    const acceptanceRate = decided > 0 ? Math.round((approved.length / decided) * 100) : null;
    const escalationRate = allApprovals.length > 0
        ? Math.round((allApprovals.filter((a) => a.risk === "high").length / allApprovals.length) * 100)
        : null;

    const meta = statusMeta[bot.status] ?? statusMeta.active;
    const initials = initialsFromName(bot.name);

    const kpis = [
        { label: "Tasks completed", value: String(bot.tasksCompleted), icon: CheckCircle2, iconBg: "bg-sky-100 dark:bg-sky-900/40", iconColor: "text-sky-600 dark:text-sky-400" },
        { label: "Reliability", value: `${bot.reliabilityPct}%`, icon: Shield, iconBg: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-600 dark:text-emerald-400" },
        { label: "Pending approvals", value: String(pending.length), icon: GitPullRequest, iconBg: "bg-violet-100 dark:bg-violet-900/40", iconColor: "text-violet-600 dark:text-violet-400" },
        { label: "Last active", value: formatRelativeTime(bot.lastActivityAt), icon: Clock3, iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-600 dark:text-amber-400" },
        { label: "Working hours", value: `${bot.shiftStart}–${bot.shiftEnd}`, icon: Timer, iconBg: "bg-rose-100 dark:bg-rose-900/40", iconColor: "text-rose-600 dark:text-rose-400" },
    ];

    return (
        <div className="site-shell min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center text-base font-bold text-sky-600 dark:text-sky-400">
                            {initials}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{bot.name}</h1>
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    <span className={`h-1.5 w-1.5 rounded-full ${meta.color}`} />
                                    {meta.label}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{bot.role}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <ButtonLink href={`/dashboard/agents/${slug}/approvals`} variant="outline" size="sm">Approvals</ButtonLink>
                        <ButtonLink href="/dashboard/settings" variant="outline" size="sm">Configure</ButtonLink>
                        <ButtonLink href="/dashboard/agents" variant="ghost" size="sm">← All agents</ButtonLink>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
                    {kpis.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
                        <div key={label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                            <PremiumIcon icon={Icon} tone="sky" containerClassName={`h-8 w-8 rounded-xl ${iconBg} ${iconColor} mb-3`} iconClassName="w-4 h-4" />
                            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Approval history */}
                    <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Approval Activity</h2>
                            <span className="text-xs text-slate-400">{history.length} recent</span>
                        </div>
                        {history.length === 0 ? (
                            <div className="px-5 py-10 text-center">
                                <p className="text-sm text-slate-500 dark:text-slate-400">No approval activity yet for this agent.</p>
                                <p className="text-xs text-slate-400 mt-1">Requests this agent raises for risky actions will appear here.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[480px]">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            <th className="text-left px-5 py-3">Time</th>
                                            <th className="text-left px-5 py-3">Action</th>
                                            <th className="text-left px-5 py-3">Detail</th>
                                            <th className="text-left px-5 py-3">Risk</th>
                                            <th className="text-left px-5 py-3">Outcome</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                        {history.map((row) => (
                                            <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{row.time}</td>
                                                <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">{row.action}</td>
                                                <td className="px-5 py-3 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">{row.detail}</td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${riskBadge[row.risk] ?? ""}`}>
                                                        {row.risk}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${decisionBadge[row.outcome] ?? ""}`}>
                                                        {row.outcome}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Configuration & quality */}
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">Configuration</h2>
                            <dl className="space-y-3 text-xs">
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Autonomy</dt>
                                    <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{autonomyLabel[bot.autonomyLevel]}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Approval policy</dt>
                                    <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{policyLabel[bot.approvalPolicy]}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Active days</dt>
                                    <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatActiveDays(bot.activeDays)}</dd>
                                </div>
                                {bot.notes && (
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                        <dt className="text-slate-500 dark:text-slate-400 mb-1">Notes</dt>
                                        <dd className="text-slate-700 dark:text-slate-300 leading-relaxed">{bot.notes}</dd>
                                    </div>
                                )}
                            </dl>
                            <div className="mt-4">
                                <ButtonLink href="/dashboard/settings" variant="ghost" size="sm" className="!px-0 !py-0 !h-auto text-xs">
                                    Edit configuration →
                                </ButtonLink>
                            </div>
                        </div>

                        {(acceptanceRate !== null || escalationRate !== null) && (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">Approval Quality</h2>
                                <div className="space-y-4">
                                    {acceptanceRate !== null && (
                                        <div>
                                            <div className="flex justify-between mb-1.5">
                                                <span className="text-xs text-slate-600 dark:text-slate-400">Approval acceptance rate</span>
                                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{acceptanceRate}%</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${acceptanceRate}%` }} />
                                            </div>
                                        </div>
                                    )}
                                    {escalationRate !== null && (
                                        <div>
                                            <div className="flex justify-between mb-1.5">
                                                <span className="text-xs text-slate-600 dark:text-slate-400">High-risk request share</span>
                                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{escalationRate}%</span>
                                            </div>
                                            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div className="h-1.5 rounded-full bg-rose-400" style={{ width: `${escalationRate}%` }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="bg-gradient-to-br from-emerald-50 to-sky-50 dark:from-emerald-950/20 dark:to-sky-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <PremiumIcon icon={ArrowUpRight} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" />
                                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Lifetime summary</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                {bot.tasksCompleted} tasks completed at {bot.reliabilityPct}% reliability. Last active {formatRelativeTime(bot.lastActivityAt).toLowerCase()}.
                            </p>
                            <div className="mt-3">
                                <ButtonLink href="/dashboard/evidence" variant="ghost" size="sm" className="!px-0 !py-0 !h-auto text-xs">
                                    View audit log →
                                </ButtonLink>
                            </div>
                        </div>

                        <RiskyActionTrigger agentSlug={slug} agentName={bot.name} />

                        {escalationRate !== null && escalationRate > 30 && (
                            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/40 p-4 flex gap-3">
                                <PremiumIcon icon={AlertTriangle} tone="amber" containerClassName="w-6 h-6 mt-0.5 shrink-0 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3.5 h-3.5" />
                                <p className="text-xs text-amber-800 dark:text-amber-300">
                                    A large share of this agent&apos;s recent requests are high-risk. Consider reviewing its approval gate settings.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
