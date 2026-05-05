import type { Metadata } from "next";
import {
    AlertTriangle,
    BadgeCheck,
    BellRing,
    Building2,
    CreditCard,
    KeyRound,
    Settings2,
    Shield,
    ShieldCheck,
    Users,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import PremiumIcon from "@/components/shared/PremiumIcon";

export const metadata: Metadata = {
    title: "Admin Console - AgentFarm",
    description: "Manage organization users, permissions, policy controls, and billing for AgentFarm.",
};

const orgStats = [
    { label: "Members", value: "28", icon: Users, iconBg: "bg-violet-100 dark:bg-violet-900/50", iconColor: "text-violet-600 dark:text-violet-400", sub: "4 pending invite" },
    { label: "Active AI Workers", value: "14", icon: BadgeCheck, iconBg: "bg-emerald-100 dark:bg-emerald-900/50", iconColor: "text-emerald-600 dark:text-emerald-400", sub: "All healthy" },
    { label: "Open Alerts", value: "3", icon: BellRing, iconBg: "bg-rose-100 dark:bg-rose-900/50", iconColor: "text-rose-600 dark:text-rose-400", sub: "Needs attention" },
    { label: "Monthly Spend", value: "$6,920", icon: CreditCard, iconBg: "bg-amber-100 dark:bg-amber-900/50", iconColor: "text-amber-600 dark:text-amber-400", sub: "+9.1% vs last month" },
];

const members = [
    { name: "Alex Rivera", initials: "AR", role: "Org Admin", status: "active", lastLogin: "5m ago" },
    { name: "Priya Nair", initials: "PN", role: "Engineering Lead", status: "active", lastLogin: "24m ago" },
    { name: "Jordan Kim", initials: "JK", role: "Security Viewer", status: "pending", lastLogin: "Never" },
    { name: "Sam Okafor", initials: "SO", role: "Finance Admin", status: "active", lastLogin: "2h ago" },
];

const alerts = [
    { text: "MFA not enabled for 2 invited users", level: "high" },
    { text: "One production approval rule has no fallback approver", level: "high" },
    { text: "Billing seat limit at 92% of current plan", level: "medium" },
];

export default function AdminPage() {
    return (
        <div className="site-shell min-h-screen">
            {/* Hero */}
            <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
                <img
                    src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1800&q=80"
                    alt="Admin operations center"
                    className="w-full h-[260px] sm:h-[300px] object-cover object-center"
                    loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-slate-900/10" />
                <div className="absolute inset-0 flex items-center">
                    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
                        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300 mb-3">
                            <PremiumIcon icon={Shield} tone="amber" containerClassName="w-5 h-5 rounded-md bg-amber-300/15 text-amber-200 border-amber-200/30" iconClassName="w-3 h-3" />
                            Admin Console
                        </div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight max-w-xl leading-tight">
                            Govern identity,<br className="hidden sm:block" /> policy, and spend
                        </h1>
                        <p className="mt-2 text-slate-300 text-base max-w-lg">
                            Central control for users, approvals, RBAC, and enterprise audit posture.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <ButtonLink href="/dashboard" size="sm">Customer Dashboard</ButtonLink>
                            <ButtonLink href="/admin/superadmin" size="sm" variant="outline" className="!bg-fuchsia-500/20 !text-white !border-fuchsia-300/50 hover:!bg-fuchsia-500/30">
                                Tenant Superadmin
                            </ButtonLink>
                            <ButtonLink href="/docs/api-reference" variant="outline" size="sm" className="!bg-white/10 !text-white !border-white/30 hover:!bg-white/20">
                                API Keys and Access
                            </ButtonLink>
                        </div>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Org KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {orgStats.map(({ label, value, icon: Icon, iconBg, iconColor, sub }) => (
                        <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <PremiumIcon icon={Icon} tone="sky" containerClassName={`w-10 h-10 rounded-xl ${iconBg} ${iconColor}`} iconClassName="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{value}</p>
                                <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Team table + Risk alerts */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Team table */}
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Team and Access</h2>
                            <ButtonLink href="/admin/users" variant="outline" size="sm">Manage Members</ButtonLink>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[580px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Member</th>
                                        <th className="text-left px-4 py-3">Role</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Last Login</th>
                                        <th className="text-left px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {members.map((m) => (
                                        <tr key={m.name} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold shrink-0">
                                                        {m.initials}
                                                    </span>
                                                    <span className="font-semibold text-slate-900 dark:text-slate-100">{m.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{m.role}</td>
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 ${m.status === "active" ? "text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-900/40" : "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40"}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${m.status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} />
                                                    {m.status === "active" ? "Active" : "Pending"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">{m.lastLogin}</td>
                                            <td className="px-4 py-3.5">
                                                <ButtonLink href="/admin/users" size="sm" variant="ghost" className="text-xs px-2 py-1 h-auto">
                                                    Edit role
                                                </ButtonLink>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Risk and Alerts */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Risk and Alerts</h2>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-bold">
                                {alerts.length}
                            </span>
                        </div>
                        <div className="p-4 space-y-3">
                            {alerts.map((alert) => (
                                <div key={alert.text} className={`rounded-xl border p-3.5 flex items-start gap-2.5 ${alert.level === "high" ? "border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20" : "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20"}`}>
                                    <PremiumIcon icon={AlertTriangle} tone="slate" containerClassName={`w-6 h-6 mt-0.5 shrink-0 rounded-lg ${alert.level === "high" ? "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" : "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400"}`} iconClassName="w-4 h-4" />
                                    <p className={`text-sm leading-snug ${alert.level === "high" ? "text-rose-800 dark:text-rose-300" : "text-amber-800 dark:text-amber-300"}`}>{alert.text}</p>
                                </div>
                            ))}
                            <div className="pt-1">
                                <ButtonLink href="/admin/users" size="sm" className="w-full justify-center">Resolve Alerts</ButtonLink>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Action Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <PremiumIcon icon={Shield} tone="sky" containerClassName="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">Policy Engine</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Define role-based approval rules for high-impact actions and deployment workflows.</p>
                        <ButtonLink href="/admin/roles" size="sm" variant="outline" className="mt-4">Configure Policies</ButtonLink>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <PremiumIcon icon={KeyRound} tone="violet" containerClassName="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400" iconClassName="w-5 h-5" />
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">Secrets and Tokens</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Rotate API keys, track token usage, and monitor expired credentials by workspace.</p>
                        <ButtonLink href="/admin/integrations" size="sm" variant="outline" className="mt-4">Rotate Access</ButtonLink>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <PremiumIcon icon={Settings2} tone="emerald" containerClassName="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" iconClassName="w-5 h-5" />
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">Org Settings</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Update SSO, domain verification, default seat assignments, and escalation contacts.</p>
                        <ButtonLink href="/admin/security" size="sm" variant="outline" className="mt-4">Open Settings</ButtonLink>
                    </div>
                </div>

                {/* Enterprise readiness banner */}
                {/* A2: Usage analytics panel */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <PremiumIcon icon={Building2} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                            Usage Analytics
                        </h2>
                        <span className="text-[10px] text-slate-400 font-mono">Last 30 days</span>
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Top agents by task volume */}
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Top Agents by Tasks</p>
                            <div className="space-y-2.5">
                                {[
                                    { name: "AI QA Engineer", tasks: 52, pct: 100 },
                                    { name: "AI Backend Dev", tasks: 34, pct: 65 },
                                    { name: "AI DevOps", tasks: 18, pct: 35 },
                                    { name: "AI Security", tasks: 7, pct: 14 },
                                ].map((a) => (
                                    <div key={a.name}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="text-slate-700 dark:text-slate-300 font-medium truncate max-w-[140px]">{a.name}</span>
                                            <span className="font-bold text-slate-900 dark:text-slate-100 ml-2">{a.tasks}</span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div className="h-1.5 rounded-full bg-sky-500" style={{ width: `${a.pct}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        {/* API calls by connector */}
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">API Calls by Connector</p>
                            <div className="space-y-2.5">
                                {[
                                    { connector: "GitHub", calls: 4200, color: "bg-slate-700 dark:bg-slate-400" },
                                    { connector: "Jira", calls: 1800, color: "bg-blue-500" },
                                    { connector: "Linear", calls: 960, color: "bg-violet-500" },
                                    { connector: "Teams", calls: 340, color: "bg-indigo-500" },
                                ].map((c) => {
                                    const pct = Math.round((c.calls / 4200) * 100);
                                    return (
                                        <div key={c.connector}>
                                            <div className="flex justify-between text-xs mb-1">
                                                <span className="text-slate-700 dark:text-slate-300">{c.connector}</span>
                                                <span className="font-bold text-slate-900 dark:text-slate-100">{(c.calls / 1000).toFixed(1)}k</span>
                                            </div>
                                            <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div className={`h-1.5 rounded-full ${c.color}`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        {/* Seat utilization */}
                        <div className="flex flex-col items-center justify-center gap-3">
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider self-start">Seat Utilization</p>
                            <div className="relative w-24 h-24">
                                <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90" aria-hidden>
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3.5" className="text-slate-100 dark:text-slate-800" />
                                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3.5" strokeDasharray="92 100" strokeLinecap="round" className="text-amber-500" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-extrabold text-slate-900 dark:text-slate-100">92%</span>
                                    <span className="text-[9px] text-slate-500">46 / 50</span>
                                </div>
                            </div>
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold text-center">4 seats remaining</p>
                        </div>
                    </div>
                </div>

                {/* Enterprise readiness banner */}
                <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <PremiumIcon icon={Building2} tone="amber" containerClassName="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" iconClassName="w-5 h-5" />
                        <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">Enterprise readiness</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                                Your org meets <span className="font-semibold text-amber-700 dark:text-amber-400">17 of 19</span> enterprise controls. Finish MFA enforcement and add backup approvers.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs text-slate-500 dark:text-slate-400">Completion</p>
                            <p className="text-lg font-extrabold text-amber-700 dark:text-amber-400">89%</p>
                        </div>
                        <ButtonLink href="/book-demo" size="sm">
                            <PremiumIcon icon={ShieldCheck} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-white/60 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 mr-1" iconClassName="w-4 h-4" />
                            Book Security Review
                        </ButtonLink>
                    </div>
                </div>

            </div>
        </div>
    );
}
