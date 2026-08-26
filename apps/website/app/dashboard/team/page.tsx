import type { Metadata } from "next";
import {
    ChevronRight,
    ShieldCheck,
    Users,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import ButtonLink from "@/components/shared/ButtonLink";
import { getPortalUser, portalFetch } from "@/lib/portal-server";
import TeamRosterClient from "./TeamRosterClient";

export const metadata: Metadata = {
    title: "Team - AgentFarms Dashboard",
    description: "See who's on your team, their roles, and when they joined.",
};

type UserPublic = {
    id: string;
    email: string;
    name: string;
    company: string;
    role: "superadmin" | "admin" | "member";
    createdAt: number;
};

/** Map portal role → roster role key */
function toRosterRole(portalRole?: string): "superadmin" | "admin" | "member" {
    if (portalRole === "owner" || portalRole === "superadmin") return "superadmin";
    if (portalRole === "admin") return "admin";
    return "member";
}

export default async function TeamPage() {
    const portalUser = await getPortalUser();
    const rosterRole = toRosterRole(portalUser?.role);
    const canManageMembers = rosterRole === "admin" || rosterRole === "superadmin";

    // Load the roster from the gateway's portal accounts — the store portal
    // login authenticates against, so every listed member can actually sign in.
    type PortalMember = { id: string; email: string; name: string; role: string; createdAt: number };
    let members: UserPublic[] = [];
    if (portalUser?.tenantId) {
        const data = await portalFetch<{ members: PortalMember[] }>("/portal/data/team/members");
        members = (data?.members ?? []).map((m) => ({
            id: m.id,
            email: m.email,
            name: m.name,
            company: portalUser.tenantId,
            role: toRosterRole(m.role),
            createdAt: m.createdAt,
        }));
    }

    // Ensure the current user always appears (fallback if the roster is empty).
    if (portalUser && !members.find((m) => m.id === portalUser.accountId)) {
        members = [
            {
                id: portalUser.accountId,
                email: portalUser.email,
                name: portalUser.displayName ?? portalUser.email.split("@")[0] ?? "Account",
                company: portalUser.tenantId,
                role: rosterRole,
                createdAt: Date.now(),
            },
            ...members,
        ];
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(139,92,246,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-700">
                                <PremiumIcon icon={Users} tone="violet" containerClassName="w-4 h-4 rounded bg-blue-400/20 text-blue-300" iconClassName="w-2.5 h-2.5" />
                                Team
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Members &amp; Roles</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                                    Your team
                                </h1>
                                <p className="mt-2 text-slate-600 text-base max-w-lg">
                                    See who&apos;s on your team, their roles, and when they joined.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <ButtonLink href="/dashboard" size="sm" variant="outline" className="!bg-white !text-slate-900 !border-slate-200 hover:!bg-slate-50">
                                    Back to Overview
                                </ButtonLink>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Roster ─────────────────────────────────────────── */}
                <TeamRosterClient
                    initialMembers={members}
                    currentUserId={portalUser?.accountId ?? ""}
                    canManage={canManageMembers}
                />

                {/* ── Footnote ────────────────────────────────────────── */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <PremiumIcon icon={ShieldCheck} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400" iconClassName="w-3.5 h-3.5" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">About roles</h3>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 list-disc list-inside">
                        {canManageMembers ? (
                            <>
                                <li>Promote or demote teammates directly from the roster above — changes take effect on their next login.</li>
                                <li>The last admin in your organization cannot be demoted, to prevent lock-out.</li>
                                <li>You cannot change your own role here — ask another org admin, or use the Admin Console → Team &amp; Access.</li>
                                <li>Super Admin is a protected role and can only be changed from the Super Admin panel.</li>
                            </>
                        ) : (
                            <li>Role changes (promoting or demoting teammates) are managed by your org admins.</li>
                        )}
                    </ul>
                </div>

            </div>
        </div>
    );
}
