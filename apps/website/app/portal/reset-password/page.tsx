"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Loader2, Lock, CheckCircle2 } from "lucide-react";

function ResetPasswordForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token") ?? "";

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (password !== confirm) { setError("Passwords do not match."); return; }
        if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
        setError(null);
        setLoading(true);
        try {
            const res = await fetch("/api/portal/auth/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, newPassword: password }),
            });
            if (!res.ok) {
                const b = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
                setError(b.message ?? (b.error === "token_expired"
                    ? "This reset link has expired. Please request a new one."
                    : "Invalid or expired reset link."));
                return;
            }
            setDone(true);
            setTimeout(() => router.push("/portal/login"), 2_500);
        } catch {
            setError("Unable to connect. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    if (!token) {
        return (
            <div className="text-center space-y-3">
                <p className="text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">Invalid reset link — no token found.</p>
                <Link href="/portal/forgot-password" className="text-sm text-[color:var(--accent)] hover:underline">Request a new reset link</Link>
            </div>
        );
    }

    if (done) {
        return (
            <div className="text-center space-y-2">
                <CheckCircle2 className="h-9 w-9 text-[color:var(--ok)] mx-auto" />
                <p className="text-sm font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)]">Password updated successfully!</p>
                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Redirecting to sign in…</p>
            </div>
        );
    }

    return (
        <>
            {error && (
                <div className="mb-5 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-4 py-3 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                    {error}
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                    <label htmlFor="rp-password" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">New password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                        <input
                            id="rp-password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Min. 8 characters"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] transition"
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="rp-confirm" className="block text-xs font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] mb-1.5">Confirm password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)]" />
                        <input
                            id="rp-confirm"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Re-enter password"
                            required
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] transition"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading || !password || !confirm}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:bg-[var(--accent)] text-white text-sm font-semibold shadow-sm transition-colors"
                >
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Updating…
                        </>
                    ) : (
                        "Set new password"
                    )}
                </button>
            </form>
        </>
    );
}

export default function ResetPasswordPage() {
    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)] flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="h-12 w-12 rounded-[4px] bg-[var(--accent)] flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <LayoutDashboard className="h-6 w-6 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Set new password</h1>
                </div>
                <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] shadow-xl shadow-slate-900/5 border border-[color:var(--line)] dark:border-[color:var(--line)] p-8">
                    <Suspense fallback={<p className="text-center text-sm text-[color:var(--ink-muted)]">Loading…</p>}>
                        <ResetPasswordForm />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
