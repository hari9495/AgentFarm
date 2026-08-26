import type { Metadata } from "next";
import {
    ChevronRight,
    KeyRound,
    Mail,
    Shield,
    ShieldCheck,
    Smartphone,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import ButtonLink from "@/components/shared/ButtonLink";
import ActiveSessionsPanel from "@/components/dashboard/ActiveSessionsPanel";
import { getPortalUser } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Security - AgentFarms Dashboard",
    description: "Review your account security: sign-in method, active sessions, and MFA status.",
};

/** Map portal role → display label */
function roleDisplayName(role?: string): string {
    if (role === "owner" || role === "superadmin") return "Super Admin";
    if (role === "admin") return "Org Admin";
    return "Member";
}

export default async function SecurityPage() {
    const user = await getPortalUser();

    const canManagePolicy =
        user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

    // Portal sessions are managed by the gateway — we show an empty list here
    // and let the session revocation endpoint handle removal.
    const sessions: import("@/components/dashboard/ActiveSessionsPanel").OwnSessionView[] = [];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(244,63,94,0.16)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-rose-400">
                                <PremiumIcon icon={Shield} tone="rose" containerClassName="w-4 h-4 rounded bg-rose-400/20 text-rose-300" iconClassName="w-2.5 h-2.5" />
                                Security
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                            <span className="text-xs text-slate-500">Sign-in &amp; Sessions</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                                    Account security
                                </h1>
                                <p className="mt-2 text-slate-600 text-base max-w-lg">
                                    Review how you sign in, see where you&apos;re currently logged in, and manage your active sessions.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <ButtonLink href="/dashboard/security/api-keys" size="sm" variant="outline" className="!bg-white !text-slate-900 !border-slate-200 hover:!bg-slate-50">
                                    API keys
                                </ButtonLink>
                                <ButtonLink href="/dashboard/settings" size="sm" variant="outline" className="!bg-white !text-slate-900 !border-slate-200 hover:!bg-slate-50">
                                    Account settings
                                </ButtonLink>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-slate-200 pt-4">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                <span className="text-white font-bold">{sessions.length}</span>
                                {sessions.length === 1 ? "active session" : "active sessions"}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                                <span className="text-white font-bold">{roleDisplayName(user?.role)}</span>
                                role
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Sign-in method / MFA cards ──────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <PremiumIcon icon={Mail} tone="sky" containerClassName="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 shrink-0 text-blue-600 dark:text-blue-400" iconClassName="w-5 h-5" />
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Sign-in method</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">How you access your account</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Email</span>
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{user?.email ?? "—"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Password</span>
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                    <PremiumIcon icon={KeyRound} tone="emerald" containerClassName="w-4 h-4 rounded bg-emerald-200/60 dark:bg-emerald-800/60 text-emerald-700 dark:text-emerald-300" iconClassName="w-2.5 h-2.5" />
                                    Set
                                </span>
                            </div>
                        </div>
                        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                            To change your password, use &quot;Forgot password&quot; from the sign-in page.
                        </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <PremiumIcon icon={Smartphone} tone="amber" containerClassName="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 shrink-0 text-amber-600 dark:text-amber-400" iconClassName="w-5 h-5" />
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Multi-factor authentication</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Extra verification at sign-in</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Status</span>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                Not yet available
                            </span>
                        </div>
                        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
                            Multi-factor authentication isn&apos;t enabled for your account yet. We&apos;ll let you know here as soon as it&apos;s available.
                        </p>
                    </div>
                </div>

                {/* ── Active sessions ─────────────────────────────────── */}
                <ActiveSessionsPanel sessions={sessions} />

                {/* ── Footnote ────────────────────────────────────────── */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <PremiumIcon icon={ShieldCheck} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3.5 h-3.5" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">About account security</h3>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {canManagePolicy
                            ? "Org-wide security policy — MFA enforcement, session limits, and IP allowlists — is managed from the Admin Console → Security."
                            : "Org-wide security policy (MFA enforcement, session limits, IP allowlists) is set by your org admins. You can always revoke your own sessions above if you spot one you don't recognize."}
                    </p>
                </div>

            </div>
        </div>
    );
}
