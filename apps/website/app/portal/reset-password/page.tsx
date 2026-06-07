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
                <p className="text-sm text-rose-600 dark:text-rose-400">Invalid reset link — no token found.</p>
                <Link href="/portal/forgot-password" className="text-sm text-sky-600 hover:underline">Request a new reset link</Link>
            </div>
        );
    }

    if (done) {
        return (
            <div className="text-center space-y-2">
                <CheckCircle2 className="h-9 w-9 text-emerald-500 mx-auto" />
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Password updated successfully!</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">Redirecting to sign in…</p>
            </div>
        );
    }

    return (
        <>
            {error && (
                <div className="mb-5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                    {error}
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                    <label htmlFor="rp-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">New password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            id="rp-password"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Min. 8 characters"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="rp-confirm" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">Confirm password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            id="rp-confirm"
                            type="password"
                            autoComplete="new-password"
                            placeholder="Re-enter password"
                            required
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    disabled={loading || !password || !confirm}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400 text-white text-sm font-semibold shadow-sm transition-colors"
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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-md">
                <div className="flex flex-col items-center mb-8 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-sky-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                        <LayoutDashboard className="h-6 w-6 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Set new password</h1>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 dark:border-slate-800 p-8">
                    <Suspense fallback={<p className="text-center text-sm text-slate-400">Loading…</p>}>
                        <ResetPasswordForm />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
