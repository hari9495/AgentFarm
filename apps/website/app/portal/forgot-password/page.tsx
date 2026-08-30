"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Loader2, Building2, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
    const [tenantId, setTenantId] = useState("");
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Dev only — gateway returns resetUrl in non-production environments.
    const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/portal/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: tenantId.trim(), email: email.trim().toLowerCase() }),
            });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { message?: string };
                setError(b.message ?? "Something went wrong.");
                return;
            }
            const data = (await res.json()) as { ok: boolean; resetUrl?: string };
            if (data.resetUrl) setDevResetUrl(data.resetUrl);
            setSubmitted(true);
        } catch {
            setError("Unable to connect. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)] flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="h-12 w-12 rounded-[4px] bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <LayoutDashboard className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Reset your password</h1>
                        <p className="mt-1 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            Enter your tenant ID and email to receive a reset link
                        </p>
                    </div>
                </div>

                <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] shadow-xl shadow-slate-900/5 border border-[color:var(--line)] dark:border-[color:var(--line)] p-8">
                    {submitted ? (
                        <div className="space-y-4">
                            <div className="rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] px-4 py-3 text-sm text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                                If an account exists for <strong>{email}</strong>, a reset link has been sent.
                            </div>
                            {devResetUrl && (
                                <div className="rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] px-4 py-3 text-xs text-[color:var(--warn)] dark:text-[color:var(--warn)] break-all">
                                    <strong>Dev mode — reset link:</strong>
                                    <br />
                                    <a href={devResetUrl} className="text-[color:var(--accent)] hover:underline">{devResetUrl}</a>
                                </div>
                            )}
                            <Link href="/portal/login" className="block text-center text-sm text-[color:var(--accent)] hover:underline">
                                ← Back to sign in
                            </Link>
                        </div>
                    ) : (
                        <>
                            {error && (
                                <div className="mb-5 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-4 py-3 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                                    {error}
                                </div>
                            )}
                            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                                <div>
                                    <label htmlFor="fp-tenant-id" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">
                                        Tenant ID
                                    </label>
                                    <div className="relative">
                                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                                        <input
                                            id="fp-tenant-id"
                                            type="text"
                                            autoComplete="organization"
                                            placeholder="your-tenant-id"
                                            required
                                            value={tenantId}
                                            onChange={(e) => setTenantId(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] transition"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="fp-email" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">
                                        Email
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                                        <input
                                            id="fp-email"
                                            type="email"
                                            autoComplete="email"
                                            placeholder="you@example.com"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] transition"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading || !tenantId.trim() || !email.trim()}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:bg-[var(--accent)] text-white text-sm font-semibold shadow-sm transition-colors"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Sending…
                                        </>
                                    ) : (
                                        "Send reset link"
                                    )}
                                </button>
                            </form>
                            <p className="mt-6 text-center text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                <Link href="/portal/login" className="text-[color:var(--accent)] hover:underline">← Back to sign in</Link>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
