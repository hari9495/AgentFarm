"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
    ArrowRight,
    CheckCircle2,
    Eye,
    EyeOff,
    GitPullRequest,
    Lock,
    Mail,
    Shield,
    Sparkles,
    Zap,
} from "lucide-react";

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get("from") ?? undefined;
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const [serverError, setServerError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const nextErrors: { email?: string; password?: string } = {};
        if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid work email.";
        if (password.length < 8) nextErrors.password = "Password must be at least 8 characters.";
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
        <div className="min-h-screen flex bg-white dark:bg-slate-950">
            {/* ── Left Panel — Brand ── */}
            <div className="hidden lg:flex lg:w-[58%] relative overflow-hidden flex-col bg-slate-950">
                {/* Layered gradient mesh */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_10%_10%,rgba(14,165,233,0.25)_0%,transparent_60%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_90%_85%,rgba(16,185,129,0.18)_0%,transparent_60%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_50%,rgba(99,102,241,0.10)_0%,transparent_70%)]" />
                    {/* Dot grid */}
                    <div
                        className="absolute inset-0 opacity-[0.07]"
                        style={{
                            backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)",
                            backgroundSize: "28px 28px",
                        }}
                    />
                </div>

                <div className="relative z-10 flex flex-col h-full p-12">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-emerald-400 flex items-center justify-center shadow-xl shadow-sky-500/30">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-extrabold text-white tracking-tight">AgentFarm</span>
                    </div>

                    {/* Hero copy */}
                    <div className="flex-1 flex flex-col justify-center max-w-[440px]">
                        <span className="inline-flex items-center gap-2 self-start rounded-full border border-sky-500/30 bg-sky-500/10 px-3.5 py-1.5 text-xs font-semibold text-sky-400 mb-7">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                            AI teammates are live right now
                        </span>

                        <h2 className="text-[2.6rem] font-extrabold text-white leading-[1.15] tracking-tight">
                            Your engineering team,{" "}
                            <span className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent">
                                always on.
                            </span>
                        </h2>
                        <p className="mt-4 text-slate-400 text-base leading-relaxed">
                            Deploy AI engineers that plan, code, review, and ship — while you focus on strategy and growth.
                        </p>

                        {/* Live metric mini-cards */}
                        <div className="mt-9 grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm p-5 group hover:border-sky-500/30 transition-colors">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-xl bg-sky-500/15 flex items-center justify-center">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
                                    </div>
                                    <span className="text-xs font-medium text-slate-400">Tasks today</span>
                                </div>
                                <p className="text-3xl font-extrabold text-white tabular-nums leading-none">184</p>
                                <p className="text-xs text-emerald-400 font-semibold mt-2">↑ 19% this week</p>
                            </div>
                            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm p-5 group hover:border-violet-500/30 transition-colors">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-7 h-7 rounded-xl bg-violet-500/15 flex items-center justify-center">
                                        <GitPullRequest className="w-3.5 h-3.5 text-violet-400" />
                                    </div>
                                    <span className="text-xs font-medium text-slate-400">PRs merged</span>
                                </div>
                                <p className="text-3xl font-extrabold text-white tabular-nums leading-none">46</p>
                                <p className="text-xs text-violet-400 font-semibold mt-2">↑ 12% this week</p>
                            </div>
                        </div>

                        {/* Live activity feed */}
                        <div className="mt-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-sm p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Live Activity</span>
                                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Streaming
                                </span>
                            </div>
                            {[
                                { initials: "AB", agent: "AI Backend Dev", action: "opened PR #482 · billing webhooks", time: "2m ago", color: "text-sky-400", ring: "ring-sky-500/30 bg-sky-500/10" },
                                { initials: "AQ", agent: "AI QA Engineer", action: "passed 423/423 tests", time: "8m ago", color: "text-violet-400", ring: "ring-violet-500/30 bg-violet-500/10" },
                                { initials: "AD", agent: "AI DevOps", action: "deployed canary to staging", time: "15m ago", color: "text-amber-400", ring: "ring-amber-500/30 bg-amber-500/10" },
                            ].map((item) => (
                                <div key={item.action} className="flex items-center gap-3">
                                    <div className={`w-7 h-7 rounded-full ring-1 ${item.ring} flex items-center justify-center shrink-0`}>
                                        <span className={`text-[10px] font-bold ${item.color}`}>{item.initials}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-300 truncate">
                                            <span className={`font-semibold ${item.color}`}>{item.agent}</span>{" "}
                                            {item.action}
                                        </p>
                                    </div>
                                    <span className="text-[11px] text-slate-500 shrink-0">{item.time}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Trust bar */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        {[
                            { icon: <Shield className="w-3.5 h-3.5" />, label: "SOC 2 Ready" },
                            { icon: <Sparkles className="w-3.5 h-3.5" />, label: "Enterprise-grade" },
                            { label: "99.9% uptime" },
                        ].map(({ icon, label }) => (
                            <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                                {icon}
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right Panel — Form ── */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-slate-950">
                <div className="w-full max-w-[400px]">

                    {/* Mobile logo */}
                    <div className="flex items-center gap-3 mb-10 lg:hidden">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-emerald-400 flex items-center justify-center shadow-lg shadow-sky-500/30">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-lg font-extrabold text-slate-900 dark:text-white">AgentFarm</span>
                    </div>

                    <div className="mb-8">
                        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                            Welcome back
                        </h1>
                        <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">
                            Sign in to your AI teammate dashboard.
                        </p>
                    </div>

                    <form onSubmit={onSubmit} noValidate className="space-y-5">
                        {/* Email */}
                        <div className="space-y-1.5">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                                Work email
                            </label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 z-10" />
                                <input
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 pl-11 pr-4 py-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-sky-500/10"
                                    autoComplete="email"
                                />
                            </div>
                            {errors.email && (
                                <p className="text-xs text-rose-500 dark:text-rose-400 flex items-center gap-1 pl-1">
                                    {errors.email}
                                </p>
                            )}
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                                    Password
                                </label>
                                <Link
                                    href="/forgot-password"
                                    className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 pl-11 pr-12 py-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-sky-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-sky-500/10"
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((p) => !p)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-0.5"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            {errors.password && (
                                <p className="text-xs text-rose-500 dark:text-rose-400 pl-1">{errors.password}</p>
                            )}
                        </div>

                        {/* Server error */}
                        {serverError && (
                            <div className="rounded-2xl border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 px-4 py-3.5">
                                <p className="text-sm text-rose-600 dark:text-rose-400 font-medium">{serverError}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="relative w-full flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-sky-500/35 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {submitting ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Signing in…
                                </>
                            ) : (
                                <>
                                    Sign in to AgentFarm
                                    <ArrowRight className="h-4 w-4 shrink-0" />
                                </>
                            )}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
                        Don&rsquo;t have an account?{" "}
                        <Link
                            href="/signup"
                            className="font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                        >
                            Request access
                        </Link>
                    </p>

                    {/* Bottom trust row */}
                    <div className="mt-8 pt-7 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-3 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                            <Shield className="w-3 h-3" />
                            SOC 2 Ready
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span>256-bit encryption</span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span>99.9% uptime</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
