import type { Metadata } from "next";
import {
    Bell,
    Bot,
    CheckCircle2,
    Clock3,
    GitBranch,
    Hash,
    Link2,
    Settings,
    Shield,
    Slack,
    ToggleLeft,
    ToggleRight,
    Zap,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import PremiumIcon from "@/components/shared/PremiumIcon";

export const metadata: Metadata = {
    title: "Worker Settings - AgentFarm Dashboard",
    description: "Configure shift hours, approval thresholds, and integrations per AI agent.",
};

const agents = [
    { name: "AI Backend Developer", initials: "AB", accentBg: "bg-sky-100 dark:bg-sky-900/40", accentColor: "text-sky-600 dark:text-sky-400", start: "08:00", end: "18:00", tz: "America/New_York", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    { name: "AI QA Engineer", initials: "AQ", accentBg: "bg-violet-100 dark:bg-violet-900/40", accentColor: "text-violet-600 dark:text-violet-400", start: "07:00", end: "17:00", tz: "America/New_York", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    { name: "AI DevOps Engineer", initials: "AD", accentBg: "bg-amber-100 dark:bg-amber-900/40", accentColor: "text-amber-600 dark:text-amber-400", start: "06:00", end: "22:00", tz: "UTC", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] },
    { name: "AI Security Engineer", initials: "AS", accentBg: "bg-rose-100 dark:bg-rose-900/40", accentColor: "text-rose-600 dark:text-rose-400", start: "09:00", end: "17:00", tz: "America/Los_Angeles", days: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
];

const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const thresholds = [
    { label: "Auto-approve tasks at confidence ≥", value: "85%", risk: "low", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
    { label: "Require approval for risk level", value: "Medium+", risk: "medium", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" },
    { label: "Block and escalate at risk level", value: "High", risk: "high", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/40" },
    { label: "Pause agent on consecutive errors ≥", value: "3", risk: "low", color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" },
    { label: "Max parallel tasks per agent", value: "4", risk: "low", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-100 dark:bg-sky-900/40" },
];

const integrations = [
    {
        name: "Slack",
        icon: Slack,
        status: "connected",
        detail: "acme-engineering · #agent-activity",
        iconBg: "bg-violet-100 dark:bg-violet-900/40",
        iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
        name: "GitHub",
        icon: GitBranch,
        status: "connected",
        detail: "acme-org · all repos",
        iconBg: "bg-slate-100 dark:bg-slate-800",
        iconColor: "text-slate-600 dark:text-slate-400",
    },
    {
        name: "Linear",
        icon: Hash,
        status: "connected",
        detail: "Engineering workspace",
        iconBg: "bg-indigo-100 dark:bg-indigo-900/40",
        iconColor: "text-indigo-600 dark:text-indigo-400",
    },
    {
        name: "Jira",
        icon: Link2,
        status: "disconnected",
        detail: "Not configured",
        iconBg: "bg-blue-100 dark:bg-blue-900/40",
        iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
        name: "PagerDuty",
        icon: Bell,
        status: "disconnected",
        detail: "Not configured",
        iconBg: "bg-rose-100 dark:bg-rose-900/40",
        iconColor: "text-rose-600 dark:text-rose-400",
    },
];

const notifications = [
    { label: "Agent pauses for approval", enabled: true },
    { label: "Agent detects high-risk action", enabled: true },
    { label: "Agent completes daily summary", enabled: true },
    { label: "Weekly quality report", enabled: true },
    { label: "Agent encounters error (non-critical)", enabled: false },
    { label: "New task assigned to agent", enabled: false },
];

export default function SettingsPage() {
    return (
        <div className="site-shell min-h-screen">
            {/* Header */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <PremiumIcon icon={Settings} tone="sky" containerClassName="h-9 w-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 shrink-0 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
                        <div>
                            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Worker Settings</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Shift hours, approval thresholds, and integrations per agent
                            </p>
                        </div>
                    </div>
                    <ButtonLink href="/dashboard" variant="outline" size="sm">← Dashboard</ButtonLink>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

                {/* Shift configuration */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Clock3} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Shift Schedule</h2>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[600px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Agent</th>
                                        <th className="text-left px-5 py-3">Start</th>
                                        <th className="text-left px-5 py-3">End</th>
                                        <th className="text-left px-5 py-3">Timezone</th>
                                        <th className="text-left px-5 py-3">Active days</th>
                                        <th className="px-5 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {agents.map((agent) => (
                                        <tr key={agent.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`h-7 w-7 rounded-lg ${agent.accentBg} flex items-center justify-center text-[10px] font-bold ${agent.accentColor} shrink-0`}>
                                                        {agent.initials}
                                                    </div>
                                                    <span className="font-medium text-slate-800 dark:text-slate-200 text-xs">{agent.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3 font-mono text-sm text-slate-700 dark:text-slate-300">{agent.start}</td>
                                            <td className="px-5 py-3 font-mono text-sm text-slate-700 dark:text-slate-300">{agent.end}</td>
                                            <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400">{agent.tz}</td>
                                            <td className="px-5 py-3">
                                                <div className="flex gap-0.5">
                                                    {allDays.map((d) => (
                                                        <span
                                                            key={d}
                                                            className={`inline-flex items-center justify-center h-5 w-6 rounded text-[9px] font-semibold ${agent.days.includes(d)
                                                                ? "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300"
                                                                : "bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600"
                                                                }`}
                                                        >
                                                            {d[0]}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <button className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline">Edit</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
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
                                name: "Startup (relaxed)",
                                description: "Optimised for speed. LOW and MEDIUM-risk actions auto-execute. Only HIGH-risk actions require approval. Ideal for early-stage teams moving fast.",
                                badges: ["LOW: auto", "MEDIUM: auto", "HIGH: approve"],
                                tone: "sky" as const,
                            },
                            {
                                name: "Enterprise (strict)",
                                description: "Optimised for compliance. LOW-risk actions auto-execute. MEDIUM and HIGH-risk actions require approval. Full evidence trail on every action.",
                                badges: ["LOW: auto", "MEDIUM: approve", "HIGH: approve"],
                                tone: "amber" as const,
                            },
                        ].map(({ name, description, badges, tone }) => (
                            <div key={name} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{name}</h3>
                                    <button className="text-xs font-semibold text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-1.5 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors">Apply preset</button>
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
                </section>

                {/* Approval thresholds */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Shield} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Approval Gates</h2>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                        {thresholds.map(({ label, value, color, bg }) => (
                            <div key={label} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <p className="text-sm text-slate-700 dark:text-slate-300">{label}</p>
                                <div className="flex items-center gap-3">
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${bg} ${color}`}>{value}</span>
                                    <button className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline shrink-0">Edit</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Integrations */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Zap} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Integrations</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {integrations.map(({ name, icon: Icon, status, detail, iconBg, iconColor }) => (
                            <div
                                key={name}
                                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-4"
                            >
                                <PremiumIcon icon={Icon} tone="sky" containerClassName={`h-10 w-10 rounded-xl ${iconBg} shrink-0 ${iconColor}`} iconClassName="w-5 h-5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{detail}</p>
                                </div>
                                {status === "connected" ? (
                                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 shrink-0">
                                        <PremiumIcon icon={CheckCircle2} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-4 h-4" />
                                        <PremiumIcon icon={ToggleRight} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-5 h-5" />
                                    </div>
                                ) : (
                                    <button className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline shrink-0 flex items-center gap-1">
                                        <PremiumIcon icon={ToggleLeft} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
                                        Connect
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Notifications */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <PremiumIcon icon={Bell} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" />
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Notification Preferences</h2>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                        {notifications.map(({ label, enabled }) => (
                            <div key={label} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <p className="text-sm text-slate-700 dark:text-slate-300">{label}</p>
                                <div className={`flex items-center gap-1.5 text-xs font-semibold ${enabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                                    {enabled ? (
                                        <><PremiumIcon icon={ToggleRight} tone="emerald" containerClassName="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-4 h-4" /> On</>
                                    ) : (
                                        <><PremiumIcon icon={ToggleLeft} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-4 h-4" /> Off</>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

            </div>
        </div>
    );
}
