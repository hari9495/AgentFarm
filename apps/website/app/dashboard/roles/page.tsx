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
        badgeClassName: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]",
        icon: Users,
        values: ["View", "View", "View (own)", "Run", "Request", "View (own)", "View"],
    },
    {
        key: "admin",
        name: "Org Admin",
        description: "Manages the workspace day-to-day — billing, roster, security policy, and integrations.",
        badgeClassName: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
        icon: Shield,
        values: ["Full", "Full", "Full", "Full", "Approve", "Full", "Full"],
    },
    {
        key: "superadmin",
        name: "Super Admin",
        description: "Highest level of access — everything an Org Admin can do, plus admin role assignment.",
        badgeClassName: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
        icon: ShieldCheck,
        values: ["Full", "Full", "Full", "Full", "Approve", "Full", "Full"],
    },
];

const classFor = (value: string) => {
    if (value === "Full") return "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]";
    if (value === "Approve") return "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]";
    if (value === "Run") return "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]";
    if (value === "Request") return "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]";
    if (value.startsWith("View")) return "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]";
    return "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]";
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
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(99,102,241,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <PremiumIcon icon={Lock} tone="indigo" containerClassName="w-4 h-4 rounded bg-[var(--accent)]/20 text-[color:var(--accent)]" iconClassName="w-2.5 h-2.5" />
                                Access
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Roles &amp; Permissions</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">
                                    Roles &amp; permissions
                                </h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">
                                    See what each role can do in your workspace — from running agents to managing billing and security policy.
                                </p>
                            </div>
                            {canManageMembers && (
                                <div className="flex flex-wrap items-center gap-3 shrink-0">
                                    <ButtonLink href="/dashboard/team" size="sm" variant="outline" className="!bg-[var(--card)] !text-[color:var(--ink)] !border-[color:var(--line)] hover:!bg-[var(--bg-deep)]">
                                        Manage team roles
                                    </ButtonLink>
                                </div>
                            )}
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-[color:var(--line)] pt-4">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                                <span className="text-white font-bold">{roleLabel(displayRole)}</span>
                                your current role
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                                <span className="text-white font-bold">{roleRows.length}</span>
                                roles defined
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
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
                                className={`rounded-[4px] border bg-[var(--card)] dark:bg-[var(--card)] p-5 transition-colors ${
                                    isYou
                                        ? "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]/50"
                                        : "border-[color:var(--line)] dark:border-[color:var(--line)]"
                                }`}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${role.badgeClassName}`}>
                                        <PremiumIcon icon={role.icon} tone="slate" containerClassName="w-4 h-4 rounded bg-[var(--card)] dark:bg-black/20" iconClassName="w-2.5 h-2.5" />
                                        {role.name}
                                    </span>
                                    {isYou && (
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]">
                                            You
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] leading-relaxed">{role.description}</p>
                            </div>
                        );
                    })}
                </div>

                {/* ── Permission matrix ───────────────────────────────── */}
                <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] inline-flex items-center gap-1.5">
                            <PremiumIcon icon={Lock} tone="indigo" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                            Permission matrix
                        </h2>
                        <span className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Read-only — assigned by your org admins</span>
                    </div>

                    {/* Legend */}
                    <div className="px-5 py-2.5 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex flex-wrap items-center gap-3">
                        {[
                            { label: "Full", cls: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]" },
                            { label: "Approve", cls: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]" },
                            { label: "Run", cls: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]" },
                            { label: "Request", cls: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]" },
                            { label: "View", cls: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]" },
                        ].map((item) => (
                            <span key={item.label} className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.cls}`}>{item.label}</span>
                        ))}
                        <span className="text-[10px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] ml-1">— hover a row to highlight</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead>
                                <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50">
                                    <th className="text-left px-5 py-3 text-xs uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] sticky left-0 bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 z-10">Role</th>
                                    {modules.map((m) => (
                                        <th key={m} className="text-left px-3 py-3 text-xs uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{m}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                                {roleRows.map((role) => (
                                    <tr key={role.key} className="hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10 transition-colors group">
                                        <td className="px-5 py-3 font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)] whitespace-nowrap sticky left-0 bg-[var(--card)] dark:bg-[var(--card)] group-hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:group-hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/10 z-10 transition-colors">
                                            <span className="inline-flex items-center gap-1.5">
                                                {role.name}
                                                {role.key === displayRole && (
                                                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]">
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
                <div className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <PremiumIcon icon={CheckSquare} tone="indigo" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                        <h3 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">About roles in your workspace</h3>
                    </div>
                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        {canManageMembers
                            ? <>Roles are assigned from the <a href="/dashboard/team" className="font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:underline">Team page</a> — promote or demote members between Member and Org Admin there. Super Admin is reserved for workspace owners.</>
                            : "Your role determines what you can see and do across billing, team, security, and agent operations. If you need broader access, ask an org admin to update your role from the Team page."}
                    </p>
                </div>

            </div>
        </div>
    );
}
