import type { Metadata } from "next";
import {
    CheckSquare,
    ChevronRight,
    Lock,
    Shield,
    ShieldCheck,
    Users,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import ButtonLink from "@/components/shared/ButtonLink";
import { getPortalUser } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Roles & Permissions - AgentFarms Dashboard",
    description: "See what each role can do in your workspace — members, org admins, and super admins.",
};

// ── Role + permission matrix data ────────────────────────────────────────────

const modules = [
    "Billing & plan",
    "Team & members",
    "Security policy",
    "Agents & tasks",
    "Approvals",
    "Audit log",
    "Integrations",
];

type RoleRow = {
    key: "member" | "admin" | "superadmin";
    name: string;
    description: string;
    badgeClassName: string;
    icon: typeof Shield;
    values: string[];
};

const roleRows: RoleRow[] = [
    {
        key: "member",
        name: "Member",
        description: "Day-to-day workspace access — run agents, request approvals, view shared records.",
        badgeClassName: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
        icon: Users,
        values: ["View", "View", "View (own)", "Run", "Request", "View (own)", "View"],
    },
    {
        key: "admin",
        name: "Org Admin",
        description: "Manages the workspace day-to-day — billing, roster, security policy, and integrations.",
        badgeClassName: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        icon: Shield,
        values: ["Full", "Full", "Full", "Full", "Approve", "Full", "Full"],
    },
    {
        key: "superadmin",
        name: "Super Admin",
        description: "Highest level of access — everything an Org Admin can do, plus admin role assignment.",
        badgeClassName: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
        icon: ShieldCheck,
        values: ["Full", "Full", "Full", "Full", "Approve", "Full", "Full"],
    },
];

const classFor = (value: string) => {
    if (value === "Full") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    if (value === "Approve") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    if (value === "Run") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    if (value === "Request") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    if (value.startsWith("View")) return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
};

/** Map portal role → display role key */
function toDisplayRole(portalRole?: string): "member" | "admin" | "superadmin" {
    if (portalRole === "owner" || portalRole === "superadmin") return "superadmin";
    if (portalRole === "admin") return "admin";
    return "member";
}

const roleLabel = (role: "member" | "admin" | "superadmin") =>
    role === "superadmin" ? "Super Admin" : role === "admin" ? "Org Admin" : "Member";

export default async function RolesPermissionsPage() {
    const portalUser = await getPortalUser();
    const displayRole = toDisplayRole(portalUser?.role);
    const canManageMembers = displayRole === "admin" || displayRole === "superadmin";

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(99,102,241,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-400">
                                <PremiumIcon icon={Lock} tone="indigo" containerClassName="w-4 h-4 rounded bg-blue-400/20 text-blue-300" iconClassName="w-2.5 h-2.5" />
                                Access
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Roles &amp; Permissions</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                                    Roles &amp; permissions
                                </h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">
                                    See what each role can do in your workspace — from running agents to managing billing and security policy.
                                </p>
                            </div>
                            {canManageMembers && (
                                <div className="flex flex-wrap items-center gap-3 shrink-0">
                                    <ButtonLink href="/dashboard/team" size="sm" variant="outline" className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 hover:!border-white/30">
                                        Manage team roles
                                    </ButtonLink>
                                </div>
                            )}
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-white/10 pt-4">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                <span className="text-white font-bold">{roleLabel(displayRole)}</span>
                                your current role
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                <span className="text-white font-bold">{roleRows.length}</span>
                                roles defined
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                <span className="text-white font-bold">{modules.length}</span>
                                permission areas
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Role cards ──────────────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {roleRows.map((role) => {
                        const isYou = role.key === displayRole;
                        return (
                            <div
                                key={role.key}
                                className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 transition-colors ${
                                    isYou
                                        ? "border-blue-300 dark:border-blue-700 ring-1 ring-blue-200 dark:ring-blue-900/50"
                                        : "border-slate-200 dark:border-slate-800"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${role.badgeClassName}`}>
                                        <PremiumIcon icon={role.icon} tone="slate" containerClassName="w-4 h-4 rounded bg-white/60 dark:bg-black/20" iconClassName="w-2.5 h-2.5" />
                                        {role.name}
                                    </span>
                                    {isYou && (
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                            You
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{role.description}</p>
                            </div>
                        );
                    })}
                </div>

                {/* ── Permission matrix ───────────────────────────────── */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                            <PremiumIcon icon={Lock} tone="indigo" containerClassName="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" iconClassName="w-3.5 h-3.5" />
                            Permission matrix
                        </h2>
                        <span className="text-xs text-slate-400 dark:text-slate-500">Read-only — assigned by your org admins</span>
                    </div>

                    {/* Legend */}
                    <div className="px-5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
                        {[
                            { label: "Full", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
                            { label: "Approve", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
                            { label: "Run", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
                            { label: "Request", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
                            { label: "View", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
                        ].map((item) => (
                            <span key={item.label} className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.cls}`}>{item.label}</span>
                        ))}
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">— hover a row to highlight</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50">
                                    <th className="text-left px-5 py-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10">Role</th>
                                    {modules.map((m) => (
                                        <th key={m} className="text-left px-3 py-3 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{m}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                {roleRows.map((role) => (
                                    <tr key={role.key} className="hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors group">
                                        <td className="px-5 py-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/10 z-10 transition-colors">
                                            <span className="inline-flex items-center gap-1.5">
                                                {role.name}
                                                {role.key === displayRole && (
                                                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                                        You
                                                    </span>
                                                )}
                                            </span>
                                        </td>
                                        {role.values.map((value, idx) => (
                                            <td key={`${role.key}-${idx}`} className="px-3 py-3">
                                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${classFor(value)}`}>{value}</span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ── Footnote ────────────────────────────────────────── */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <PremiumIcon icon={CheckSquare} tone="indigo" containerClassName="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" iconClassName="w-3.5 h-3.5" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">About roles in your workspace</h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {canManageMembers
                            ? <>Roles are assigned from the <a href="/dashboard/team" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">Team page</a> — promote or demote members between Member and Org Admin there. Super Admin is reserved for workspace owners.</>
                            : "Your role determines what you can see and do across billing, team, security, and agent operations. If you need broader access, ask an org admin to update your role from the Team page."}
                    </p>
                </div>

            </div>
        </div>
    );
}
