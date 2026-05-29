"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, CheckCircle2, GitPullRequest } from "lucide-react";

function LoginForm() {
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
            window.location.assign(data.redirectTo ?? "/dashboard");
        } catch {
            setServerError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen flex" style={{ background: "#ffffff" }}>

            {/* ── Left panel — brand / social proof ── */}
            <div
                className="hidden lg:flex lg:w-[52%] flex-col relative overflow-hidden"
                style={{ background: "#1a1a1c" }}
            >
                {/* Subtle ambient glow */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: "radial-gradient(ellipse 70% 50% at 20% 20%, rgba(0,102,204,0.18) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 80%, rgba(41,151,255,0.10) 0%, transparent 60%)",
                    }}
                />

                <div className="relative z-10 flex flex-col h-full p-12">
                    {/* Logo */}
                    <div className="flex items-center gap-2.5">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: "#0066cc" }}
                        >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="2" />
                                <path d="M5 8h6M8 5v6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </div>
                        <span className="text-white font-semibold text-[15px]" style={{ letterSpacing: "-0.01em" }}>
                            AgentFarms
                        </span>
                    </div>

                    {/* Hero copy */}
                    <div className="flex-1 flex flex-col justify-center max-w-[420px]">
                        <div
                            className="inline-flex items-center gap-2 self-start rounded-full mb-7 px-3.5 py-1.5 text-[12px] font-semibold"
                            style={{ border: "1px solid rgba(41,151,255,0.3)", background: "rgba(41,151,255,0.1)", color: "#2997ff" }}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2997ff] animate-pulse" />
                            Workers active right now
                        </div>

                        <h2
                            className="font-semibold text-white"
                            style={{ fontSize: "clamp(2rem, 3.5vw, 2.6rem)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
                        >
                            AI workers that ship{" "}
                            <span style={{ color: "#2997ff" }}>with your oversight.</span>
                        </h2>
                        <p className="mt-4 text-[15px]" style={{ color: "#98989d", lineHeight: 1.6 }}>
                            12 specialist roles, 18 connectors, approval gates on every high-stakes action.
                        </p>

                        {/* Metric mini-cards */}
                        <div className="mt-8 grid grid-cols-2 gap-3">
                            {[
                                { label: "Tasks today", value: "184", delta: "↑ 19% this week", icon: CheckCircle2, color: "#2997ff" },
                                { label: "PRs merged", value: "46", delta: "↑ 12% this week", icon: GitPullRequest, color: "#30d158" },
                            ].map(({ label, value, delta, icon: Icon, color }) => (
                                <div
                                    key={label}
                                    className="rounded-[14px] p-5"
                                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                                >
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${color}20` }}>
                                            <Icon className="w-3.5 h-3.5" style={{ color }} />
                                        </div>
                                        <span className="text-[12px] font-medium" style={{ color: "#6e6e73" }}>{label}</span>
                                    </div>
                                    <p className="text-[2rem] font-semibold text-white" style={{ letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</p>
                                    <p className="text-[12px] font-semibold mt-2" style={{ color }}>{delta}</p>
                                </div>
                            ))}
                        </div>

                        {/* Live activity feed */}
                        <div
                            className="mt-3 rounded-[14px] p-5"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "#6e6e73" }}>
                                    Live Activity
                                </span>
                                <span className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#30d158" }}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#30d158] animate-pulse" />
                                    Streaming
                                </span>
                            </div>
                            <div className="space-y-3.5">
                                {[
                                    { initials: "AB", agent: "AI Backend Dev", action: "opened PR #482 · billing webhooks", time: "2m ago", color: "#2997ff" },
                                    { initials: "AQ", agent: "AI QA Engineer", action: "passed 423/423 tests", time: "8m ago", color: "#30d158" },
                                    { initials: "AD", agent: "AI DevOps", action: "deployed canary to staging", time: "15m ago", color: "#ff9f0a" },
                                ].map((item) => (
                                    <div key={item.action} className="flex items-center gap-3">
                                        <div
                                            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                                            style={{ background: `${item.color}18`, color: item.color, border: `1px solid ${item.color}30` }}
                                        >
                                            {item.initials}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12px] truncate" style={{ color: "#e5e5ea" }}>
                                                <span className="font-semibold" style={{ color: item.color }}>{item.agent}</span>{" "}
                                                {item.action}
                                            </p>
                                        </div>
                                        <span className="text-[11px] shrink-0" style={{ color: "#6e6e73" }}>{item.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Trust bar */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        {["SOC 2 Ready", "256-bit encryption", "99.9% uptime"].map((label) => (
                            <span key={label} className="flex items-center gap-1.5 text-[12px]" style={{ color: "#6e6e73" }}>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right panel — form ── */}
            <div className="flex-1 flex items-center justify-center px-6 py-12" style={{ background: "#ffffff" }}>
                <div className="w-full max-w-[400px]">

                    {/* Mobile logo */}
                    <div className="flex items-center gap-2.5 mb-10 lg:hidden">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#0066cc" }}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.8" />
                                <path d="M4.5 7h5M7 4.5v5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                            </svg>
                        </div>
                        <span className="font-semibold text-[#1d1d1f] text-[15px]">AgentFarms</span>
                    </div>

                    {/* Heading */}
                    <div className="mb-8">
                        <h1 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "2rem", letterSpacing: "-0.028em", lineHeight: 1.1 }}>
                            Welcome back
                        </h1>
                        <p className="mt-2 text-[15px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>
                            Sign in to your AgentFarms workspace.
                        </p>
                    </div>

                    <form onSubmit={onSubmit} noValidate className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-[14px] font-semibold text-[#1d1d1f] mb-1.5">
                                Work email
                            </label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 z-10" style={{ color: "#aeaeb2" }} />
                                <input
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 text-[15px] text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none transition-colors"
                                    style={{
                                        border: errors.email ? "1px solid #ff3b30" : "1px solid #d2d2d7",
                                        borderRadius: 11,
                                        background: "#f5f5f7",
                                    }}
                                    onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                                    onBlur={(e) => (e.currentTarget.style.borderColor = errors.email ? "#ff3b30" : "#d2d2d7")}
                                    autoComplete="email"
                                />
                            </div>
                            {errors.email && (
                                <p className="mt-1.5 text-[12px] text-[#ff3b30]">{errors.email}</p>
                            )}
                        </div>

                        {/* Password */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-[14px] font-semibold text-[#1d1d1f]">
                                    Password
                                </label>
                                <Link
                                    href="/forgot-password"
                                    className="text-[13px] font-medium text-[#0066cc] hover:text-[#0071e3] transition-colors"
                                >
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#aeaeb2" }} />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-12 py-3 text-[15px] text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none transition-colors"
                                    style={{
                                        border: errors.password ? "1px solid #ff3b30" : "1px solid #d2d2d7",
                                        borderRadius: 11,
                                        background: "#f5f5f7",
                                    }}
                                    onFocus={(e) => (e.currentTarget.style.borderColor = "#0066cc")}
                                    onBlur={(e) => (e.currentTarget.style.borderColor = errors.password ? "#ff3b30" : "#d2d2d7")}
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((p) => !p)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer transition-colors"
                                    style={{ color: "#aeaeb2" }}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {errors.password && (
                                <p className="mt-1.5 text-[12px] text-[#ff3b30]">{errors.password}</p>
                            )}
                        </div>

                        {/* Server error */}
                        {serverError && (
                            <div className="rounded-[11px] px-4 py-3" style={{ background: "rgba(255,59,48,0.06)", border: "1px solid rgba(255,59,48,0.25)" }}>
                                <p className="text-[13px] text-[#ff3b30] font-medium">{serverError}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full flex items-center justify-center gap-2 py-3 text-[15px] font-medium text-white rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                            style={{ background: "#0066cc" }}
                            onMouseOver={(e) => !submitting && (e.currentTarget.style.background = "#0071e3")}
                            onMouseOut={(e) => (e.currentTarget.style.background = "#0066cc")}
                        >
                            {submitting ? (
                                <>
                                    <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Signing in…
                                </>
                            ) : (
                                <>
                                    Sign in to AgentFarms
                                    <ArrowRight className="w-4 h-4 shrink-0" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Sign up link */}
                    <p className="mt-6 text-center text-[14px] text-[#6e6e73]">
                        Don&rsquo;t have an account?{" "}
                        <Link href="/get-started" className="font-semibold text-[#0066cc] hover:text-[#0071e3] transition-colors">
                            Get started free
                        </Link>
                    </p>

                    {/* Trust row */}
                    <div
                        className="mt-8 pt-6 flex items-center justify-center gap-3 text-[12px] text-[#aeaeb2]"
                        style={{ borderTop: "1px solid #e8e8ed" }}
                    >
                        <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            SOC 2 Ready
                        </span>
                        <span>·</span>
                        <span>256-bit encryption</span>
                        <span>·</span>
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
