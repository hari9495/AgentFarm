"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Lock, Mail, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get("from") ?? undefined;
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const [serverError, setServerError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const nextErrors: { email?: string; password?: string } = {};
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            nextErrors.email = "Enter a valid work email.";
        }
        if (password.length < 8) {
            nextErrors.password = "Password must be at least 8 characters.";
        }
        setErrors(nextErrors);
        setServerError("");
        if (Object.keys(nextErrors).length > 0) return;

        setSubmitting(true);
        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, from }),
            });
            const data = (await response.json()) as { error?: string; redirectTo?: string };

            if (!response.ok) {
                setServerError(data.error ?? "Unable to sign in right now.");
                return;
            }

            const redirectTo = data.redirectTo ?? "/dashboard";
            if (/^https?:\/\//i.test(redirectTo)) {
                window.location.assign(redirectTo);
                return;
            }

            router.push(redirectTo);
        } catch {
            setServerError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <section className="relative py-16 sm:py-24">
            <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
                <div className="grid gap-0 overflow-hidden rounded-3xl border border-white/70 dark:border-slate-700 bg-white/90 dark:bg-slate-900/85 backdrop-blur-xl shadow-2xl shadow-sky-500/10 dark:shadow-slate-950/50 lg:grid-cols-2">
                    <div className="relative hidden lg:block p-8 bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 text-white">
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)", backgroundSize: "18px 18px" }} />
                        <p className="relative inline-flex items-center gap-1 rounded-full border border-white/30 px-3 py-1 text-xs font-semibold">
                            <Sparkles className="h-3 w-3" /> Secure workspace access
                        </p>
                        <h2 className="relative mt-4 text-3xl font-bold leading-tight">
                            Manage your AI team from one control panel
                        </h2>
                        <ul className="relative mt-6 space-y-3 text-sm text-white/90">
                            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 mt-0.5" /> SOC-ready access patterns for enterprise teams</li>
                            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 mt-0.5" /> Role-based actions and audit-friendly workflows</li>
                            <li className="flex items-start gap-2"><ShieldCheck className="h-4 w-4 mt-0.5" /> Fast routing into marketplace and onboarding</li>
                        </ul>
                    </div>

                    <div className="p-8">
                        <p className="inline-flex items-center rounded-full border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
                            Welcome back
                        </p>
                        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            Sign in to AgentFarm
                        </h1>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                            Continue to your AI teammate dashboard and marketplace.
                        </p>

                        <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Work email</span>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="email"
                                        placeholder="you@company.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none ring-0 focus:border-sky-500"
                                        autoComplete="email"
                                    />
                                </div>
                                {errors.email && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.email}</p>}
                            </label>

                            <label className="block">
                                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Password</span>
                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-2.5 text-sm text-slate-900 dark:text-slate-100 outline-none ring-0 focus:border-sky-500"
                                        autoComplete="current-password"
                                    />
                                </div>
                                {errors.password && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.password}</p>}
                            </label>

                            <div className="flex justify-end">
                                <Link href="/forgot-password" className="text-xs font-semibold text-sky-700 dark:text-sky-300 hover:underline">
                                    Forgot password?
                                </Link>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {submitting ? "Signing in..." : "Sign In"} <ArrowRight className="h-4 w-4" />
                            </button>
                            {serverError && <p className="text-xs text-rose-600 dark:text-rose-400">{serverError}</p>}
                        </form>

                        <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                            New here? <Link href="/signup" className="font-semibold text-sky-700 dark:text-sky-300 hover:underline">Create account</Link>
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
