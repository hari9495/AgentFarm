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
    active: { label: "Active", color: "bg-[var(--ok)]" },
    created: { label: "Provisioning", color: "bg-[var(--accent)]" },
    paused: { label: "Paused", color: "bg-[var(--warn)]" },
    error: { label: "Needs review", color: "bg-[var(--danger)]" },
    maintenance: { label: "Maintenance", color: "bg-[var(--bg-deep)]" },
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
        { label: "Tasks completed", value: "0", icon: CheckCircle2, iconBg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40", iconColor: "text-[color:var(--accent)] dark:text-[color:var(--accent)]" },
        { label: "Reliability", value: "—", icon: Shield, iconBg: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40", iconColor: "text-[color:var(--ok)] dark:text-[color:var(--ok)]" },
        { label: "Pending approvals", value: "0", icon: GitPullRequest, iconBg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40", iconColor: "text-[color:var(--accent)] dark:text-[color:var(--accent)]" },
        { label: "Last active", value: formatRelativeTime(lastActivityTs), icon: Clock3, iconBg: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40", iconColor: "text-[color:var(--warn)] dark:text-[color:var(--warn)]" },
        { label: "Working hours", value: "09:00–18:00", icon: Timer, iconBg: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40", iconColor: "text-[color:var(--danger)] dark:text-[color:var(--danger)]" },
    ];

    return (
        <div className="site-shell min-h-screen">
            {/* Header */}
            <div className="bg-[var(--card)] dark:bg-[var(--card)] border-b border-[color:var(--line)] dark:border-[color:var(--line)] px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-[4px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 flex items-center justify-center text-base font-bold text-[color:var(--accent)] dark:text-[color:var(--accent)]">
                            {initials}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{agentName}</h1>
                                <span className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                    <span className={`h-1.5 w-1.5 rounded-full ${meta.color}`} />
                                    {meta.label}
                                </span>
                            </div>
                            <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{agent.role}</p>
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
                        <div key={label} className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-4">
                            <PremiumIcon icon={Icon} tone="sky" containerClassName={`h-8 w-8 rounded-[3px] ${iconBg} ${iconColor} mb-3`} iconClassName="w-4 h-4" />
                            <p className="text-2xl font-extrabold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{value}</p>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">{label}</p>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Approval history */}
                    <div className="xl:col-span-2 bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)]">
                        <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                            <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Approval Activity</h2>
                            <span className="text-xs text-[color:var(--ink-muted)]">0 recent</span>
                        </div>
                        <div className="px-5 py-10 text-center">
                            <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">No approval activity yet for this agent.</p>
                            <p className="text-xs text-[color:var(--ink-muted)] mt-1">Requests this agent raises for risky actions will appear here.</p>
                        </div>
                    </div>

                    {/* Configuration & quality */}
                    <div className="space-y-4">
                        <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-5">
                            <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] mb-4">Configuration</h2>
                            <dl className="space-y-3 text-xs">
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] shrink-0">Status</dt>
                                    <dd className="text-right font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)] capitalize">{agent.status}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] shrink-0">Role</dt>
                                    <dd className="text-right font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)]">{agent.role}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] shrink-0">Last updated</dt>
                                    <dd className="text-right font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)]">{formatRelativeTime(lastActivityTs)}</dd>
                                </div>
                            </dl>
                            <div className="mt-4">
                                <ButtonLink href="/dashboard/settings" variant="ghost" size="sm" className="!px-0 !py-0 !h-auto text-xs">
                                    Edit configuration →
                                </ButtonLink>
                            </div>
                        </div>

                        <div className="bg-gradient-to-br from-[color-mix(in_srgb,var(--ok)_8%,transparent)] to-[color-mix(in_srgb,var(--accent)_8%,transparent)] dark:from-[color-mix(in_srgb,var(--ok)_14%,transparent)]/20 dark:to-[color-mix(in_srgb,var(--accent)_14%,transparent)]/20 rounded-[4px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40 p-5">
                            <div className="flex items-center gap-2 mb-2">
                                <PremiumIcon icon={ArrowUpRight} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" />
                                <span className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Lifetime summary</span>
                            </div>
                            <p className="text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] leading-relaxed">
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
