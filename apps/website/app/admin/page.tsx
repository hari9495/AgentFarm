import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
    AlertTriangle,
    BadgeCheck,
    BellRing,
    Bot,
    Building2,
    CreditCard,
    Download,
    KeyRound,
    Settings2,
    Shield,
    ShieldCheck,
    Users,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import PremiumIcon from "@/components/shared/PremiumIcon";
import { getPortalUser } from "@/lib/portal-server";
import { listTeamMembers, listBots } from "@/lib/auth-store";

export const metadata: Metadata = {
    title: "Admin Console - AgentFarms",
    description: "Manage organization users, permissions, policy controls, and billing for AgentFarms.",
};

const initials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "U";

const ROLE_LABEL: Record<string, string> = {
    superadmin: "Super Admin",
    admin: "Org Admin",
    member: "Member",
};

export default async function AdminPage() {
    const portalUser = await getPortalUser();
    if (!portalUser) redirect("/login?next=/admin");

    const role = portalUser.role ?? "member";
    if (role !== "owner" && role !== "admin" && role !== "superadmin") {
        redirect("/dashboard");
    }

    const [teamMembers, bots] = await Promise.all([
        portalUser.tenantId ? listTeamMembers(portalUser.tenantId) : Promise.resolve([]),
        listBots(),
    ]);

    const activeBotsCount = bots.filter((b) => b.status === "active").length;
    const memberCount = teamMembers.length;

    // Show current user in the table if not yet in local DB
    const rosterMembers = teamMembers.length > 0 ? teamMembers : [
        {
            id: portalUser.accountId,
            email: portalUser.email,
            name: portalUser.displayName ?? portalUser.email.split("@")[0] ?? "Account",
            company: "",
            role: role as "superadmin" | "admin" | "member",
            createdAt: Date.now(),
        },
    ];

    const orgStats = [
        {
            label: "Members",
            value: memberCount.toString(),
            icon: Users,
            iconBg: "bg-blue-100 dark:bg-blue-900/50",
            iconColor: "text-blue-600 dark:text-blue-400",
            sub: memberCount === 1 ? "1 on your team" : `${memberCount} on your team`,
        },
        {
            label: "Active AI Workers",
            value: activeBotsCount.toString(),
            icon: BadgeCheck,
            iconBg: "bg-emerald-100 dark:bg-emerald-900/50",
            iconColor: "text-emerald-600 dark:text-emerald-400",
            sub: activeBotsCount > 0 ? "All healthy" : "None configured yet",
        },
        {
            label: "Open Alerts",
            value: "0",
            icon: BellRing,
            iconBg: "bg-rose-100 dark:bg-rose-900/50",
            iconColor: "text-rose-600 dark:text-rose-400",
            sub: "No issues detected",
        },
        {
            label: "Monthly Spend",
            value: "—",
            icon: CreditCard,
            iconBg: "bg-amber-100 dark:bg-amber-900/50",
            iconColor: "text-amber-600 dark:text-amber-400",
            sub: "Billing not configured",
        },
    ];

    return (
        <div className="site-shell min-h-screen">
            {/* Hero */}
            <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-blue-50 via-white to-white dark:from-slate-900 dark:to-slate-950">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_90%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                </div>
                <div className="relative max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-3">
                        <PremiumIcon icon={Shield} tone="sky" containerClassName="w-5 h-5 rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300" iconClassName="w-3 h-3" />
                        Admin Console
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight max-w-xl leading-tight">
                        Govern identity,<br className="hidden sm:block" /> policy, and spend
                    </h1>
                    <p className="mt-2 text-slate-600 dark:text-slate-400 text-base max-w-lg">
                        Central control for users, approvals, RBAC, and enterprise audit posture.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <ButtonLink href="/dashboard" size="sm">Customer Dashboard</ButtonLink>
                        <ButtonLink href="/admin/superadmin" size="sm" variant="outline" className="!bg-white !text-slate-900 !border-slate-200 hover:!bg-slate-50">
                            Tenant Superadmin
                        </ButtonLink>
                        <ButtonLink href="/docs/api-reference" variant="outline" size="sm" className="!bg-white !text-slate-900 !border-slate-200 hover:!bg-slate-50">
                            API Keys and Access
                        </ButtonLink>
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
                            <ButtonLink href="/dashboard/team" variant="outline" size="sm">Manage Members</ButtonLink>
                        </div>
                        {rosterMembers.length === 0 ? (
                            <p className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">No team members found.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[480px]">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                            <th className="text-left px-5 py-3">Member</th>
                                            <th className="text-left px-4 py-3">Email</th>
                                            <th className="text-left px-4 py-3">Role</th>
                                            <th className="text-left px-4 py-3">Joined</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                        {rosterMembers.map((m) => (
                                            <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-5 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-xs font-bold shrink-0">
                                                            {initials(m.name)}
                                                        </span>
                                                        <span className="font-semibold text-slate-900 dark:text-slate-100">{m.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">{m.email}</td>
                                                <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 text-xs">{ROLE_LABEL[m.role] ?? m.role}</td>
                                                <td className="px-4 py-3.5 text-slate-400 dark:text-slate-500 text-xs">
                                                    {new Date(m.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Risk and Alerts */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Risk and Alerts</h2>
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold">0</span>
                        </div>
                        <div className="p-5 flex flex-col items-center justify-center gap-3 py-12 text-center">
                            <PremiumIcon icon={ShieldCheck} tone="emerald" containerClassName="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-5 h-5" />
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No open alerts</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-[180px]">All systems are operating normally.</p>
                        </div>
                    </div>
                </div>

                {/* Quick Action Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    <div className="rounded-2xl border border-blue-200 dark:border-blue-800/40 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <PremiumIcon icon={Bot} tone="violet" containerClassName="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400" iconClassName="w-5 h-5" />
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">Bot Control</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Add bots, pause or resume workers, set autonomy levels, approval policies, and working hours.</p>
                        <ButtonLink href="/admin/bots" size="sm" variant="outline" className="mt-4">Manage Bots</ButtonLink>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <PremiumIcon icon={Shield} tone="sky" containerClassName="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400" iconClassName="w-5 h-5" />
                            <h3 className="font-bold text-slate-900 dark:text-slate-100">Policy Engine</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Define role-based approval rules for high-impact actions and deployment workflows.</p>
                        <ButtonLink href="/admin/roles" size="sm" variant="outline" className="mt-4">Configure Policies</ButtonLink>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center gap-3 mb-3">
                            <PremiumIcon icon={KeyRound} tone="violet" containerClassName="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400" iconClassName="w-5 h-5" />
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

                {/* Data Exports */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <PremiumIcon icon={Download} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />
                            Data Exports
                        </h2>
                        <span className="text-[10px] text-slate-400">Scoped to your workspace — downloads are audit-logged</span>
                    </div>
                    <div className="p-5 flex flex-wrap gap-3">
                        <a href="/api/admin/export/sql" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-colors">
                            <Download className="w-4 h-4" /> Workspace Backup (JSON)
                        </a>
                        <a href="/api/admin/export/csv?table=users" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-colors">
                            <Download className="w-4 h-4" /> Users CSV
                        </a>
                        <a href="/api/admin/export/csv?table=approvals" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-colors">
                            <Download className="w-4 h-4" /> Approvals CSV
                        </a>
                        <a href="/api/admin/export/csv?table=tenant_bots" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 transition-colors">
                            <Download className="w-4 h-4" /> Bots CSV
                        </a>
                    </div>
                    <div className="px-5 pb-5 -mt-1">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            Exports include only your organization&apos;s records — never other tenants&apos; data or credentials (passwords, tokens are always excluded).
                        </p>
                    </div>
                </div>

                {/* Billing placeholder */}
                <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 p-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <PremiumIcon icon={Building2} tone="amber" containerClassName="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/50 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" iconClassName="w-5 h-5" />
                        <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100">Billing and usage</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                                Connect a billing plan to track monthly spend, seat limits, and usage analytics.
                            </p>
                        </div>
                    </div>
                    <ButtonLink href="/admin/billing" size="sm">
                        <PremiumIcon icon={CreditCard} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-white/60 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 mr-1" iconClassName="w-4 h-4" />
                        Set Up Billing
                    </ButtonLink>
                </div>

            </div>
        </div>
    );
}
