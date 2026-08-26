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
import { portalFetch } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Agent Detail - AgentFarms Dashboard",
};

interface PortalAgent {
    id: string;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    workspace: { name: string } | null;
}

type BotStatus = "active" | "paused" | "error" | "maintenance" | "created";

const statusMeta: Record<string, { label: string; color: string }> = {
    active: { label: "Active", color: "bg-emerald-500" },
    created: { label: "Provisioning", color: "bg-blue-500" },
    paused: { label: "Paused", color: "bg-amber-500" },
    error: { label: "Needs review", color: "bg-rose-500" },
    maintenance: { label: "Maintenance", color: "bg-slate-400" },
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

export default async function AgentDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;

    // slug == agent id (set by the agents list page via `slug: bot.id`)
    const data = await portalFetch<{ agent: PortalAgent }>(`/portal/data/agents/${encodeURIComponent(slug)}`);
    if (!data?.agent) notFound();

    const agent = data.agent;
    const agentName = agent.workspace?.name ?? agent.role ?? slug;
    const meta = statusMeta[agent.status] ?? statusMeta.active!;
    const initials = initialsFromName(agentName);
    const lastActivityTs = new Date(agent.updatedAt).getTime();

    const kpis = [
        { label: "Tasks completed", value: "0", icon: CheckCircle2, iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600 dark:text-blue-400" },
        { label: "Reliability", value: "—", icon: Shield, iconBg: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-600 dark:text-emerald-400" },
        { label: "Pending approvals", value: "0", icon: GitPullRequest, iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600 dark:text-blue-400" },
        { label: "Last active", value: formatRelativeTime(lastActivityTs), icon: Clock3, iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-600 dark:text-amber-400" },
        { label: "Working hours", value: "09:00–18:00", icon: Timer, iconBg: "bg-rose-100 dark:bg-rose-900/40", iconColor: "text-rose-600 dark:text-rose-400" },
    ];

    return (
        <div className="site-shell min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-base font-bold text-blue-600 dark:text-blue-400">
                            {initials}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{agentName}</h1>
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    <span className={`h-1.5 w-1.5 rounded-full ${meta.color}`} />
                                    {meta.label}
                                </span>
                            </div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">{agent.role}</p>
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
                            <span className="text-xs text-slate-400">0 recent</span>
                        </div>
                        <div className="px-5 py-10 text-center">
                            <p className="text-sm text-slate-500 dark:text-slate-400">No approval activity yet for this agent.</p>
                            <p className="text-xs text-slate-400 mt-1">Requests this agent raises for risky actions will appear here.</p>
                        </div>
                    </div>

                    {/* Configuration & quality */}
                    <div className="space-y-4">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4">Configuration</h2>
                            <dl className="space-y-3 text-xs">
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Status</dt>
                                    <dd className="text-right font-medium text-slate-800 dark:text-slate-200 capitalize">{agent.status}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Role</dt>
                                    <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{agent.role}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400 shrink-0">Last updated</dt>
                                    <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{formatRelativeTime(lastActivityTs)}</dd>
                                </div>
                            </dl>
                            <div className="mt-4">
                                <ButtonLink href="/dashboard/settings" variant="ghost" size="sm" className="!px-0 !py-0 !h-auto text-xs">
                                    Edit configuration →
                                </ButtonLink>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-950/20 dark:to-blue-950/20 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <PremiumIcon icon={ArrowUpRight} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" />
                                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">Lifetime summary</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                Agent active since {new Date(agent.createdAt).toLocaleDateString()}. Last seen {formatRelativeTime(lastActivityTs).toLowerCase()}.
                            </p>
                            <div className="mt-3">
                                <ButtonLink href="/dashboard/evidence" variant="ghost" size="sm" className="!px-0 !py-0 !h-auto text-xs">
                                    View audit log →
                                </ButtonLink>
                            </div>
                        </div>

                        <RiskyActionTrigger agentSlug={slug} agentName={agentName} />
                    </div>
                </div>
            </div>
        </div>
    );
}
