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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <LayoutDashboard className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reset your password</h1>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Enter your tenant ID and email to receive a reset link
                        </p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 dark:border-slate-800 p-8">
                    {submitted ? (
                        <div className="space-y-4">
                            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                                If an account exists for <strong>{email}</strong>, a reset link has been sent.
                            </div>
                            {devResetUrl && (
                                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-xs text-amber-800 dark:text-amber-300 break-all">
                                    <strong>Dev mode — reset link:</strong>
                                    <br />
                                    <a href={devResetUrl} className="text-blue-600 hover:underline">{devResetUrl}</a>
                                </div>
                            )}
                            <Link href="/portal/login" className="block text-center text-sm text-blue-600 hover:underline">
                                ← Back to sign in
                            </Link>
                        </div>
                    ) : (
                        <>
                            {error && (
                                <div className="mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                                    {error}
                                </div>
                            )}
                            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                                <div>
                                    <label htmlFor="fp-tenant-id" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                        Tenant ID
                                    </label>
                                    <div className="relative">
                                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                            id="fp-tenant-id"
                                            type="text"
                                            autoComplete="organization"
                                            placeholder="your-tenant-id"
                                            required
                                            value={tenantId}
                                            onChange={(e) => setTenantId(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="fp-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                        Email
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                            id="fp-email"
                                            type="email"
                                            autoComplete="email"
                                            placeholder="you@example.com"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
                                        />
                                    </div>
                                </div>
                                <button
                                    type="submit"
                                    disabled={loading || !tenantId.trim() || !email.trim()}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold shadow-sm transition-colors"
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
                            <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
                                <Link href="/portal/login" className="text-blue-600 hover:underline">← Back to sign in</Link>
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
