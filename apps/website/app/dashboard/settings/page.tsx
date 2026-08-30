import type { Metadata } from "next";
import {
    ChevronRight,
    Clock3,
    Link2,
    Settings,
    Shield,
    Zap,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import PremiumIcon from "@/components/shared/PremiumIcon";
import { portalFetch } from "@/lib/portal-server";
import ShiftScheduleTable from "@/components/dashboard/ShiftScheduleTable";
import ApplyPolicyPresetButton from "@/components/dashboard/ApplyPolicyPresetButton";
import NotificationPreferencesPanel from "@/components/dashboard/NotificationPreferencesPanel";
import type { NotificationPrefKey } from "@/lib/auth-store";

export const metadata: Metadata = {
    title: "Worker Settings - AgentFarms Dashboard",
    description: "Configure shift hours, approval policy, and notification preferences per AI agent.",
};

type ApprovalPolicy = "all" | "medium-high" | "high-only";

const policyDescription: Record<ApprovalPolicy, string> = {
    all: "Every action this agent takes — regardless of risk — requires human approval before it executes.",
    "medium-high": "Low-risk actions auto-execute. Medium and high-risk actions require human approval.",
    "high-only": "Low and medium-risk actions auto-execute. Only high-risk actions require human approval.",
};

const policyBadge: Record<ApprovalPolicy, { label: string; className: string }> = {
    all: { label: "All actions", className: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]" },
    "medium-high": { label: "Medium + high risk", className: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]" },
    "high-only": { label: "High risk only", className: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]" },
};

export default async function SettingsPage() {
    // Load the tenant's agents so shift schedule and policy reflect reality.
    type PortalAgent = { id: string; role: string; status: string };
    const agentsData = await portalFetch<{ agents: PortalAgent[] }>("/portal/data/agents?limit=100");
    const agents = agentsData?.agents ?? [];

    const tones = ["sky", "violet", "amber", "rose"];
    const shiftAgents: import("@/components/dashboard/ShiftScheduleTable").ShiftScheduleAgent[] =
        agents.map((agent, index) => ({
            slug: agent.id,
            name: agent.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            tone: tones[index % tones.length]!,
            start: "09:00",
            end: "18:00",
            days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        }));

    // Agents start on the default "high-only" preset until a custom policy is applied.
    const policyRows: Array<{ policy: ApprovalPolicy; count: number }> =
        agents.length > 0 ? [{ policy: "high-only", count: agents.length }] : [];

    // Default notification preferences.
    const defaultPrefs: Record<NotificationPrefKey, boolean> = {
        agent_pause: true,
        high_risk: true,
        daily_summary: true,
        weekly_report: true,
        agent_error: true,
        new_task: false,
    };

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
                                <Settings className="w-3.5 h-3.5" />
                                Settings
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Worker Configuration</span>
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Worker Settings</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Shift hours, approval policy, and notification preferences per AI agent.</p>
                            </div>
                            <ButtonLink href="/dashboard" variant="outline" size="sm" className="self-start lg:self-auto">← Dashboard</ButtonLink>
                        </div>
                    </div>
                </section>

                {/* Shift configuration */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Clock3} tone="sky" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] uppercase tracking-wide">Shift Schedule</h2>
                    </div>
                    <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] overflow-hidden">
                        <ShiftScheduleTable agents={shiftAgents} />
                    </div>
                </section>

                {/* Policy presets */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Shield} tone="violet" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] uppercase tracking-wide">Policy Presets</h2>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                        {[
                            {
                                preset: "startup" as const,
                                name: "Startup (relaxed)",
                                description: "Optimised for speed. LOW and MEDIUM-risk actions auto-execute. Only HIGH-risk actions require approval. Ideal for early-stage teams moving fast.",
                                badges: ["LOW: auto", "MEDIUM: auto", "HIGH: approve"],
                            },
                            {
                                preset: "enterprise" as const,
                                name: "Enterprise (strict)",
                                description: "Optimised for compliance. LOW-risk actions auto-execute. MEDIUM and HIGH-risk actions require approval. Full evidence trail on every action.",
                                badges: ["LOW: auto", "MEDIUM: approve", "HIGH: approve"],
                            },
                        ].map(({ preset, name, description, badges }) => (
                            <div key={name} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                                <div className="flex items-center justify-between mb-3 gap-3">
                                    <h3 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{name}</h3>
                                    <ApplyPolicyPresetButton preset={preset} />
                                </div>
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] leading-relaxed mb-3">{description}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {badges.map((b) => (
                                        <span key={b} className="text-[10px] font-semibold bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] px-2 py-0.5 rounded-full">{b}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-[11px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        Applying a preset sets the approval policy on every deployed agent at once. You can still fine-tune an individual
                        agent&apos;s policy from its detail page.
                    </p>
                </section>

                {/* Approval policy distribution */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Shield} tone="amber" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 text-[color:var(--warn)] dark:text-[color:var(--warn)]" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] uppercase tracking-wide">Current Approval Policy</h2>
                    </div>
                    <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                        {policyRows.length === 0 ? (
                            <p className="px-5 py-6 text-xs text-[color:var(--ink-muted)]">No agents deployed yet — approval policy will appear here once agents are active.</p>
                        ) : (
                            policyRows.map(({ policy, count }) => {
                                const badge = policyBadge[policy];
                                return (
                                    <div key={policy} className="flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold rounded-full px-2.5 py-1 shrink-0 ${badge.className}`}>{badge.label}</span>
                                                <span className="text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{count} agent{count === 1 ? "" : "s"}</span>
                                            </div>
                                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1.5 leading-relaxed">{policyDescription[policy]}</p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    <p className="mt-3 text-[11px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        To change an individual agent&apos;s policy, autonomy level, or working hours, open that agent&apos;s detail page — or
                        apply a policy preset above to update every agent at once.
                    </p>
                </section>

                {/* Integrations */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Zap} tone="violet" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] uppercase tracking-wide">Integrations</h2>
                    </div>
                    <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-5 flex items-center gap-4">
                        <PremiumIcon icon={Link2} tone="violet" containerClassName="h-10 w-10 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)] shrink-0" iconClassName="w-5 h-5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Connect tools your agents use</p>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                                Manage Slack, GitHub, Linear, Jira, and other connectors from the dedicated Integrations page.
                            </p>
                        </div>
                        <ButtonLink href="/dashboard/integrations" variant="outline" size="sm" className="shrink-0">
                            Manage integrations
                        </ButtonLink>
                    </div>
                </section>

                {/* Notifications */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Settings} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] uppercase tracking-wide">Notification Preferences</h2>
                    </div>
                    <NotificationPreferencesPanel initialPrefs={defaultPrefs} />
                </section>

            </div>
        </div>
    );
}
