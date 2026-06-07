import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
    ChevronRight,
    ShieldCheck,
    Users,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import ButtonLink from "@/components/shared/ButtonLink";
import { getSessionUser, getUserById, listTeamMembers } from "@/lib/auth-store";
import TeamRosterClient from "./TeamRosterClient";

export const metadata: Metadata = {
    title: "Team - AgentFarms Dashboard",
    description: "See who's on your team, their roles, and when they joined.",
};

const COOKIE_NAME = "agentfarm_session";

const getCookieValue = (cookieHeader: string | null, name: string): string | null => {
    if (!cookieHeader) return null;
    const cookie = cookieHeader
        .split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`));
    if (!cookie) return null;
    return decodeURIComponent(cookie.slice(name.length + 1));
};

export default async function TeamPage() {
    const requestHeaders = await headers();
    const token = getCookieValue(requestHeaders.get("cookie"), COOKIE_NAME);
    if (!token) redirect("/login");

    const user = await getSessionUser(token!);
    if (!user) redirect("/login");

    // Users not yet attached to a tenant have no shared roster to scope to —
    // show them as the sole (current) member of their own team rather than an empty state.
    const members = user.tenantId
        ? await listTeamMembers(user.tenantId)
        : [await getUserById(user.id)].filter((m): m is NonNullable<typeof m> => m !== null);
    const canManageMembers = user.role === "admin" || user.role === "superadmin";

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(139,92,246,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-violet-400">
                                <PremiumIcon icon={Users} tone="violet" containerClassName="w-4 h-4 rounded bg-violet-400/20 text-violet-300" iconClassName="w-2.5 h-2.5" />
                                Team
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Members &amp; Roles</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
                                    Your team
                                </h1>
                                <p className="mt-2 text-slate-400 text-base max-w-lg">
                                    See who's on your team, their roles, and when they joined.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <ButtonLink href="/dashboard" size="sm" variant="outline" className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 hover:!border-white/30">
                                    Back to Overview
                                </ButtonLink>
                            </div>
                        </div>

                    </div>
                </section>

                {/* ── Roster (stats + table, with promote/demote for admins) ── */}
                <TeamRosterClient initialMembers={members} currentUserId={user.id} canManage={canManageMembers} />

                {/* ── Footnote ────────────────────────────────────────── */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <PremiumIcon icon={ShieldCheck} tone="violet" containerClassName="w-6 h-6 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400" iconClassName="w-3.5 h-3.5" />
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
