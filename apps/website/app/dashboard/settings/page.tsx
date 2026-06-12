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
    all: { label: "All actions", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
    "medium-high": { label: "Medium + high risk", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    "high-only": { label: "High risk only", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
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
                                <Settings className="w-3.5 h-3.5" />
                                Settings
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Worker Configuration</span>
                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">Worker Settings</h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">Shift hours, approval policy, and notification preferences per AI agent.</p>
                            </div>
                            <ButtonLink href="/dashboard" variant="outline" size="sm" className="self-start lg:self-auto">← Dashboard</ButtonLink>
                        </div>
                    </div>
                </section>

                {/* Shift configuration */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Clock3} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Shift Schedule</h2>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <ShiftScheduleTable agents={shiftAgents} />
                    </div>
                </section>

                {/* Policy presets */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Shield} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Policy Presets</h2>
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
                            <div key={name} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                                <div className="flex items-center justify-between mb-3 gap-3">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{name}</h3>
                                    <ApplyPolicyPresetButton preset={preset} />
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">{description}</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {badges.map((b) => (
                                        <span key={b} className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">{b}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                        Applying a preset sets the approval policy on every deployed agent at once. You can still fine-tune an individual
                        agent&apos;s policy from its detail page.
                    </p>
                </section>

                {/* Approval policy distribution */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Shield} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Current Approval Policy</h2>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                        {policyRows.length === 0 ? (
                            <p className="px-5 py-6 text-xs text-slate-400">No agents deployed yet — approval policy will appear here once agents are active.</p>
                        ) : (
                            policyRows.map(({ policy, count }) => {
                                const badge = policyBadge[policy];
                                return (
                                    <div key={policy} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-bold rounded-full px-2.5 py-1 shrink-0 ${badge.className}`}>{badge.label}</span>
                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{count} agent{count === 1 ? "" : "s"}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{policyDescription[policy]}</p>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                    <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                        To change an individual agent&apos;s policy, autonomy level, or working hours, open that agent&apos;s detail page — or
                        apply a policy preset above to update every agent at once.
                    </p>
                </section>

                {/* Integrations */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Zap} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Integrations</h2>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4">
                        <PremiumIcon icon={Link2} tone="violet" containerClassName="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 shrink-0" iconClassName="w-5 h-5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Connect tools your agents use</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
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
                        <PremiumIcon icon={Settings} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Notification Preferences</h2>
                    </div>
                    <NotificationPreferencesPanel initialPrefs={defaultPrefs} />
                </section>

            </div>
        </div>
    );
}
