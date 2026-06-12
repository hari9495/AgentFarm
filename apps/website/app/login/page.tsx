"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
    ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck,
    Building2, CheckCircle2, AlertCircle, Fingerprint, Key,
} from "lucide-react";

const SECURITY_FEATURES = [
    { icon: ShieldCheck, label: "SOC 2 Type II certified", sub: "Annual third-party audits, continuous monitoring" },
    { icon: Lock, label: "TLS 1.3 encryption in transit", sub: "End-to-end encrypted authentication" },
    { icon: Fingerprint, label: "MFA & passkey support", sub: "TOTP, WebAuthn, and hardware security keys" },
    { icon: Key, label: "Enterprise SSO ready", sub: "SAML 2.0, OIDC, Okta, Azure AD, Google Workspace" },
] as const;

const COMPLIANCE_LABELS = ["GDPR", "CCPA", "ISO 27001", "99.9% SLA"] as const;

const INPUT_STYLE = {
    base: { border: "1px solid #d2d2d7", borderRadius: 12, background: "#f5f5f7" } as React.CSSProperties,
    error: { border: "1px solid #ff3b30", borderRadius: 12, background: "#f5f5f7" } as React.CSSProperties,
};

function Spinner() {
    return (
        <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
}

function Divider({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "#e8e8ed" }} />
            <span className="text-[12px] font-medium" style={{ color: "#aeaeb2" }}>{label}</span>
            <div className="flex-1 h-px" style={{ background: "#e8e8ed" }} />
        </div>
    );
}

function AgentFarmsLogo({ size = 8 }: { size?: number }) {
    const px = size * 4;
    const iconPx = px * 0.55;
    return (
        <div
            className="rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: "#0071e3", width: px, height: px }}
        >
            <svg width={iconPx} height={iconPx} viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="white" strokeWidth="2" />
                <path d="M5 8h6M8 5v6" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
        </div>
    );
}

// ── SSO sub-view ─────────────────────────────────────────────────────────────

function SSOView({ onBack }: { onBack: () => void }) {
    const [ssoEmail, setSsoEmail] = useState("");
    const [ssoError, setSsoError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSSO(e: React.FormEvent) {
        e.preventDefault();
        setSsoError("");
        if (!/^\S+@\S+\.\S+$/.test(ssoEmail)) {
            setSsoError("Enter a valid work email address.");
            return;
        }
        setLoading(true);
        try {
            // Look up which tenant this email belongs to
            const res = await fetch(
                `/api/portal/auth/lookup-tenant?email=${encodeURIComponent(ssoEmail.trim().toLowerCase())}`,
            );
            const data = (await res.json()) as { tenants?: Array<{ tenantId: string }> };
            const tenantId = data.tenants?.[0]?.tenantId;
            if (!tenantId) {
                setSsoError("No SSO account found for this email. Please sign in with a password instead.");
                return;
            }
            // Redirect through our proxy route which handles errors gracefully
            window.location.assign(`/api/auth/sso?tenantId=${encodeURIComponent(tenantId)}`);
        } catch {
            setSsoError("Unable to connect. Please check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div
            className="flex items-center justify-center px-6"
            style={{ background: "#f5f5f7", fontFamily: "-apple-system, 'SF Pro Display', system-ui, sans-serif", minHeight: "100dvh" }}
        >
            <div className="w-full max-w-[400px]">
                <button
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-[13px] font-medium mb-8 cursor-pointer transition-colors"
                    style={{ color: "#6e6e73" }}
                    onMouseOver={(e) => (e.currentTarget.style.color = "#1d1d1f")}
                    onMouseOut={(e) => (e.currentTarget.style.color = "#6e6e73")}
                >
                    ← Back to sign in
                </button>
                <div className="bg-white rounded-[20px] p-8" style={{ boxShadow: "0 2px 20px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)" }}>
                    <div className="w-10 h-10 rounded-[12px] flex items-center justify-center mb-6" style={{ background: "#0071e3" }}>
                        <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <h2 className="font-semibold text-[#1d1d1f] mb-2" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>
                        Enterprise SSO
                    </h2>
                    <p className="text-[14px] text-[#6e6e73] mb-6" style={{ lineHeight: 1.6 }}>
                        Enter your work email and we&apos;ll redirect you to your identity provider.
                    </p>
                    <form onSubmit={handleSSO} noValidate className="space-y-4">
                        <div>
                            <label className="block text-[13px] font-semibold text-[#1d1d1f] mb-1.5">Work email</label>
                            <input
                                type="email"
                                placeholder="you@company.com"
                                value={ssoEmail}
                                onChange={(e) => { setSsoEmail(e.target.value); setSsoError(""); }}
                                className="w-full px-4 py-3 text-[15px] text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none transition-colors"
                                style={ssoError ? INPUT_STYLE.error : INPUT_STYLE.base}
                                onFocus={(e) => (e.currentTarget.style.borderColor = "#0071e3")}
                                onBlur={(e) => (e.currentTarget.style.borderColor = ssoError ? "#ff3b30" : "#d2d2d7")}
                                autoComplete="email"
                                autoCapitalize="off"
                                autoFocus
                            />
                            {ssoError && (
                                <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#ff3b30]">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />{ssoError}
                                </p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 py-3 text-[15px] font-medium text-white rounded-full transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                            style={{ background: "#0071e3" }}
                            onMouseOver={(e) => !loading && (e.currentTarget.style.background = "#0077ed")}
                            onMouseOut={(e) => (e.currentTarget.style.background = "#0071e3")}
                        >
                            {loading ? <><Spinner /> Looking up…</> : <>Continue with SSO <ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </form>
                    <p className="mt-6 text-[12px] text-center" style={{ color: "#aeaeb2", lineHeight: 1.6 }}>
                        Supports SAML 2.0 · OIDC · Okta · Azure AD · Google Workspace
                    </p>
                </div>
            </div>
        </div>
    );
}

// ── Main login form ───────────────────────────────────────────────────────────

function LoginForm() {
    const searchParams = useSearchParams();
    const linkError = searchParams.get("error");
    const justVerified = searchParams.get("verified") === "1";

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const [serverError, setServerError] = useState(
        linkError === "expired_link"        ? "Your sign-in link has expired. Please request a new one." :
        linkError === "invalid_link"        ? "This sign-in link is invalid. Please try again." :
        linkError === "sso_not_configured"  ? "SSO is not set up for your organization. Please sign in with your email and password." :
        linkError === "sso_error"           ? "SSO login failed. Please try again or sign in with your email and password." :
        linkError === "sso_no_tenant"       ? "No account found for that email. Please sign in with your email and password." :
        ""
    );
    const [submitting, setSubmitting] = useState(false);
    const [view, setView] = useState<"main" | "sso">("main");

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const nextErrors: { email?: string; password?: string } = {};
        if (!/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = "Enter a valid email address.";
        if (password.length < 8) nextErrors.password = "Password must be at least 8 characters.";
        setErrors(nextErrors);
        setServerError("");
        if (Object.keys(nextErrors).length > 0) return;

        setSubmitting(true);
        try {
            // Step 1: look up which tenant this email belongs to
            const lookupRes = await fetch(
                `/api/portal/auth/lookup-tenant?email=${encodeURIComponent(email.trim().toLowerCase())}`,
            );
            const lookupData = (await lookupRes.json()) as { tenants?: Array<{ tenantId: string; tenantName: string }> };
            const tenants = lookupData.tenants ?? [];

            if (tenants.length === 0) {
                setServerError("Invalid email or password. Please try again.");
                return;
            }

            // Use the first (or only) tenant — multi-tenant picker can be added later
            const tenantId = tenants[0]!.tenantId;

            // Step 2: login with portal auth
            const res = await fetch("/api/portal/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId, email: email.trim().toLowerCase(), password }),
            });
            const data = (await res.json()) as { error?: string; message?: string };

            if (!res.ok) {
                if (data.error === "email_not_verified") {
                    setServerError("Please verify your email before signing in. Check your inbox.");
                } else if (data.error === "account_inactive") {
                    setServerError("This account has been deactivated. Contact support.");
                } else {
                    setServerError("Invalid email or password. Please try again.");
                }
                return;
            }

            // Success — go to dashboard (or ?next= param)
            const next = searchParams.get("next");
            window.location.assign(next && next.startsWith("/") ? next : "/dashboard");
        } catch {
            setServerError("Unable to sign in. Please check your connection and try again.");
        } finally {
            setSubmitting(false);
        }
    }

    if (view === "sso") return <SSOView onBack={() => setView("main")} />;

    return (
        <div
            className="flex"
            style={{ fontFamily: "-apple-system, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif", background: "#ffffff", minHeight: "100dvh" }}
        >
            {/* ── Left panel ── */}
            <div
                className="hidden lg:flex lg:w-[48%] flex-col relative overflow-hidden"
                style={{ background: "#1d1d1f", minHeight: "100dvh" }}
            >
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background:
                            "radial-gradient(ellipse 80% 60% at 10% 15%, rgba(0,113,227,0.15) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 90% 85%, rgba(0,113,227,0.08) 0%, transparent 55%)",
                    }}
                />
                <div className="relative z-10 flex flex-col flex-1 px-14 pt-12 pb-10">
                    {/* Logo */}
                    <div className="flex items-center gap-2.5">
                        <AgentFarmsLogo size={8} />
                        <span className="text-white font-semibold text-[15px]" style={{ letterSpacing: "-0.01em" }}>
                            AgentFarms
                        </span>
                    </div>

                    {/* Hero */}
                    <div className="flex-1 flex flex-col justify-center max-w-[420px]">
                        <div
                            className="inline-flex items-center gap-2 self-start rounded-full mb-8 px-3.5 py-1.5 text-[12px] font-semibold"
                            style={{ border: "1px solid rgba(0,113,227,0.35)", background: "rgba(0,113,227,0.1)", color: "#2997ff" }}
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2997ff] animate-pulse" />
                            Enterprise-grade AI workforce
                        </div>
                        <h2
                            className="font-semibold text-white mb-4"
                            style={{ fontSize: "clamp(1.9rem, 3vw, 2.5rem)", letterSpacing: "-0.03em", lineHeight: 1.08 }}
                        >
                            AI workers that ship
                            <br />
                            <span style={{ color: "#2997ff" }}>with your oversight.</span>
                        </h2>
                        <p className="text-[15px] mb-10" style={{ color: "#86868b", lineHeight: 1.6 }}>
                            12 specialist roles, 18 connectors, and approval gates on every
                            high-stakes action — built for teams that need real output with real guardrails.
                        </p>
                        <div className="space-y-4">
                            {SECURITY_FEATURES.map(({ icon: Icon, label, sub }) => (
                                <div key={label} className="flex items-start gap-3">
                                    <div
                                        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 mt-0.5"
                                        style={{ background: "rgba(0,113,227,0.12)", border: "1px solid rgba(0,113,227,0.2)" }}
                                    >
                                        <Icon className="w-4 h-4" style={{ color: "#2997ff" }} />
                                    </div>
                                    <div>
                                        <p className="text-[13px] font-semibold text-white">{label}</p>
                                        <p className="text-[12px]" style={{ color: "#6e6e73" }}>{sub}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Compliance badges */}
                    <div className="flex flex-wrap gap-2">
                        {COMPLIANCE_LABELS.map((label) => (
                            <span
                                key={label}
                                className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                                style={{ background: "rgba(255,255,255,0.06)", color: "#6e6e73", border: "1px solid rgba(255,255,255,0.08)" }}
                            >
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Right panel ── */}
            <div
                className="flex-1 flex items-center justify-center px-8 py-12"
                style={{ background: "#ffffff", minHeight: "100dvh" }}
            >
                <div className="w-full max-w-[390px]">
                    {/* Mobile logo */}
                    <div className="flex items-center gap-2.5 mb-10 lg:hidden">
                        <AgentFarmsLogo size={7} />
                        <span className="font-semibold text-[#1d1d1f] text-[15px]">AgentFarms</span>
                    </div>

                    {/* Heading */}
                    <div className="mb-7">
                        <h1 className="font-semibold text-[#1d1d1f]" style={{ fontSize: "2rem", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                            Sign in
                        </h1>
                        <p className="mt-2 text-[15px]" style={{ color: "#6e6e73", lineHeight: 1.5 }}>
                            Access your AgentFarms workspace.
                        </p>
                    </div>

                    {/* Tier 1 — Enterprise SSO */}
                    <button
                        onClick={() => setView("sso")}
                        className="w-full flex items-center justify-center gap-2.5 py-3 text-[15px] font-medium rounded-[12px] transition-all cursor-pointer"
                        style={{ background: "#0071e3", color: "#ffffff" }}
                        onMouseOver={(e) => (e.currentTarget.style.background = "#0077ed")}
                        onMouseOut={(e) => (e.currentTarget.style.background = "#0071e3")}
                    >
                        <Building2 className="w-4 h-4" />
                        Continue with SSO
                    </button>

                    <Divider label="or sign in with password" />

                    {/* Email-verification confirmation */}
                    {justVerified && (
                        <div
                            className="mb-4 rounded-[12px] px-4 py-3 flex items-start gap-2.5"
                            style={{ background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.25)" }}
                        >
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#34c759" }} />
                            <p className="text-[13px]" style={{ color: "#1d7a3a" }}>
                                Email verified! Sign in below to access your workspace.
                            </p>
                        </div>
                    )}

                    {/* Tier 3 — Email + Password (portal auth) */}
                    <form onSubmit={onSubmit} noValidate className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-[13px] font-semibold text-[#1d1d1f] mb-1.5">Email</label>
                            <div className="relative">
                                <Mail
                                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 z-10"
                                    style={{ color: "#aeaeb2" }}
                                />
                                <input
                                    type="email"
                                    placeholder="you@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 text-[15px] text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none transition-colors"
                                    style={errors.email ? INPUT_STYLE.error : INPUT_STYLE.base}
                                    onFocus={(e) => (e.currentTarget.style.borderColor = "#0071e3")}
                                    onBlur={(e) => (e.currentTarget.style.borderColor = errors.email ? "#ff3b30" : "#d2d2d7")}
                                    autoComplete="email"
                                    autoCapitalize="off"
                                />
                            </div>
                            {errors.email && (
                                <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#ff3b30]">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />{errors.email}
                                </p>
                            )}
                        </div>

                        {/* Password */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-[13px] font-semibold text-[#1d1d1f]">Password</label>
                                <Link href="/portal/forgot-password" className="text-[13px] font-medium text-[#0071e3] hover:text-[#0077ed] transition-colors">
                                    Forgot password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock
                                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                                    style={{ color: "#aeaeb2" }}
                                />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-12 py-3 text-[15px] text-[#1d1d1f] placeholder:text-[#aeaeb2] outline-none transition-colors"
                                    style={errors.password ? INPUT_STYLE.error : INPUT_STYLE.base}
                                    onFocus={(e) => (e.currentTarget.style.borderColor = "#0071e3")}
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
                                <p className="mt-1.5 flex items-center gap-1 text-[12px] text-[#ff3b30]">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />{errors.password}
                                </p>
                            )}
                        </div>

                        {/* Remember me */}
                        <div className="flex items-center gap-2.5 pt-0.5">
                            <button
                                type="button"
                                onClick={() => setRememberMe((r) => !r)}
                                className="w-5 h-5 rounded-[5px] flex items-center justify-center shrink-0 transition-all cursor-pointer"
                                style={{ border: rememberMe ? "none" : "1.5px solid #c7c7cc", background: rememberMe ? "#0071e3" : "transparent" }}
                                aria-pressed={rememberMe}
                                aria-label="Keep me signed in for 30 days"
                            >
                                {rememberMe && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </button>
                            <span
                                className="text-[13px] select-none cursor-pointer"
                                style={{ color: "#6e6e73" }}
                                onClick={() => setRememberMe((r) => !r)}
                            >
                                Keep me signed in for <span className="font-medium text-[#1d1d1f]">30 days</span>
                            </span>
                        </div>

                        {/* Error */}
                        {serverError && (
                            <div
                                className="rounded-[12px] px-4 py-3 flex items-start gap-2.5"
                                style={{ background: "rgba(255,59,48,0.05)", border: "1px solid rgba(255,59,48,0.2)" }}
                            >
                                <AlertCircle className="w-4 h-4 text-[#ff3b30] shrink-0 mt-0.5" />
                                <p className="text-[13px] text-[#ff3b30]">{serverError}</p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full flex items-center justify-center gap-2 py-3 text-[15px] font-medium text-white rounded-full transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                            style={{ background: "#1d1d1f" }}
                            onMouseOver={(e) => !submitting && (e.currentTarget.style.background = "#2d2d2f")}
                            onMouseOut={(e) => (e.currentTarget.style.background = "#1d1d1f")}
                        >
                            {submitting ? <><Spinner /> Signing in…</> : <>Sign in <ArrowRight className="w-4 h-4 shrink-0" /></>}
                        </button>
                    </form>

                    {/* Sign-up link */}
                    <p className="mt-6 text-center text-[13px]" style={{ color: "#6e6e73" }}>
                        Don&rsquo;t have an account?{" "}
                        <Link href="/signup" className="font-semibold text-[#0071e3] hover:text-[#0077ed] transition-colors">
                            Create one free
                        </Link>
                    </p>

                    {/* Trust row */}
                    <div className="mt-8 pt-5 flex items-center justify-center gap-4 flex-wrap" style={{ borderTop: "1px solid #f0f0f5" }}>
                        <span className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#aeaeb2" }}>
                            <ShieldCheck className="w-3.5 h-3.5" /> SOC 2 Ready
                        </span>
                        <span className="text-[11px] font-medium" style={{ color: "#aeaeb2" }}>256-bit TLS</span>
                        <span className="text-[11px] font-medium" style={{ color: "#aeaeb2" }}>GDPR Compliant</span>
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
