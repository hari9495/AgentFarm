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
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(244,63,94,0.16)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[var(--danger)]/10 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--danger)]">
                                <PremiumIcon icon={Shield} tone="rose" containerClassName="w-4 h-4 rounded bg-[var(--danger)]/20 text-[color:var(--danger)]" iconClassName="w-2.5 h-2.5" />
                                Security
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Sign-in &amp; Sessions</span>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">
                                    Account security
                                </h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">
                                    Review how you sign in, see where you&apos;re currently logged in, and manage your active sessions.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <ButtonLink href="/dashboard/security/api-keys" size="sm" variant="outline" className="!bg-[var(--card)] !text-[color:var(--ink)] !border-[color:var(--line)] hover:!bg-[var(--bg-deep)]">
                                    API keys
                                </ButtonLink>
                                <ButtonLink href="/dashboard/settings" size="sm" variant="outline" className="!bg-[var(--card)] !text-[color:var(--ink)] !border-[color:var(--line)] hover:!bg-[var(--bg-deep)]">
                                    Account settings
                                </ButtonLink>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-[color:var(--line)] pt-4">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                                <span className="text-[color:var(--ink)] font-bold">{sessions.length}</span>
                                {sessions.length === 1 ? "active session" : "active sessions"}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                                <span className="text-[color:var(--ink)] font-bold">{roleDisplayName(user?.role)}</span>
                                role
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Sign-in method / MFA cards ──────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <PremiumIcon icon={Mail} tone="sky" containerClassName="h-9 w-9 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 shrink-0 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-5 h-5" />
                            <div>
                                <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Sign-in method</p>
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">How you access your account</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Email</span>
                                <span className="text-sm font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{user?.email ?? "—"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Password</span>
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                                    <PremiumIcon icon={KeyRound} tone="emerald" containerClassName="w-4 h-4 rounded bg-[color-mix(in_srgb,var(--ok)_16%,transparent)]/60 dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/60 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-2.5 h-2.5" />
                                    Set
                                </span>
                            </div>
                        </div>
                        <p className="mt-4 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            To change your password, use &quot;Forgot password&quot; from the sign-in page.
                        </p>
                    </div>

                    <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <PremiumIcon icon={Smartphone} tone="amber" containerClassName="h-9 w-9 rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 shrink-0 text-[color:var(--warn)] dark:text-[color:var(--warn)]" iconClassName="w-5 h-5" />
                            <div>
                                <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Multi-factor authentication</p>
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Extra verification at sign-in</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Status</span>
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                Not yet available
                            </span>
                        </div>
                        <p className="mt-4 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            Multi-factor authentication isn&apos;t enabled for your account yet. We&apos;ll let you know here as soon as it&apos;s available.
                        </p>
                    </div>
                </div>

                {/* ── Active sessions ─────────────────────────────────── */}
                <ActiveSessionsPanel sessions={sessions} />

                {/* ── Footnote ────────────────────────────────────────── */}
                <div className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <PremiumIcon icon={ShieldCheck} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="w-3.5 h-3.5" />
                        <h3 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">About account security</h3>
                    </div>
                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        {canManagePolicy
                            ? "Org-wide security policy — MFA enforcement, session limits, and IP allowlists — is managed from the Admin Console → Security."
                            : "Org-wide security policy (MFA enforcement, session limits, IP allowlists) is set by your org admins. You can always revoke your own sessions above if you spot one you don't recognize."}
                    </p>
                </div>

            </div>
        </div>
    );
}
