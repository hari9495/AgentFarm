"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, Eye, EyeOff, Building2, Check, AlertCircle, ShieldCheck, Loader2 } from "lucide-react";

/** Logo lockup — same mark as signup / the marketing Navbar. */
function BrandMark() {
    return (
        <Link href="/" className="inline-flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--op-indigo)" }}>
                <svg width="15" height="15" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="5" stroke="white" strokeWidth="1.5" />
                    <path d="M4 6h4M6 4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </span>
            <span className="font-semibold text-[15px] tracking-[-0.01em]" style={{ color: "var(--op-ink)" }}>AgentFarms</span>
        </Link>
    );
}

/** Page shell: soft light bg + wash, centered card, logo above, slim footer. */
function AuthShell({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: "var(--op-paper-2)", color: "var(--op-ink)" }}>
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(45% 40% at 50% 0%, var(--op-indigo-soft), transparent 70%)" }} />
            <main className="relative flex-1 flex items-center justify-center px-4 py-12">
                <div className="op-rise w-full max-w-[400px]">
                    <div className="flex justify-center mb-7"><BrandMark /></div>
                    {children}
                </div>
            </main>
            <footer className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-8 text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                <span>© {new Date().getFullYear()} AgentFarms</span>
                <Link href="/privacy" className="hover:text-[color:var(--op-indigo)] transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-[color:var(--op-indigo)] transition-colors">Terms</Link>
            </footer>
        </div>
    );
}

const CARD_STYLE: React.CSSProperties = { border: "1px solid var(--op-line)", boxShadow: "0 10px 40px rgba(16,24,40,0.08)" };

const fieldCls = (hasError: boolean, extra = "") =>
    `w-full px-3.5 py-2.5 rounded-lg border bg-white text-[14px] text-[color:var(--op-ink)] placeholder:text-[color:var(--op-muted)] focus:outline-none focus:ring-2 transition ${extra} ${
        hasError
            ? "border-[color:var(--op-blocked)] focus:ring-[color:var(--op-blocked)]"
            : "border-[color:var(--op-line)] focus:border-[color:var(--op-indigo)] focus:ring-[color:var(--op-indigo)]"
    }`;

const labelCls = "block text-[13px] font-medium mb-1.5";

function FieldError({ msg }: { msg: string }) {
    return (
        <p className="mt-1.5 flex items-center gap-1 text-[12px]" style={{ color: "var(--op-blocked)" }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{msg}
        </p>
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
            const res = await fetch(`/api/portal/auth/lookup-tenant?email=${encodeURIComponent(ssoEmail.trim().toLowerCase())}`);
            const data = (await res.json()) as { tenants?: Array<{ tenantId: string }> };
            const tenantId = data.tenants?.[0]?.tenantId;
            if (!tenantId) {
                setSsoError("No SSO account found for this email. Please sign in with a password instead.");
                return;
            }
            window.location.assign(`/api/auth/sso?tenantId=${encodeURIComponent(tenantId)}`);
        } catch {
            setSsoError("Unable to connect. Please check your connection and try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <AuthShell>
            <div className="rounded-2xl bg-white p-8" style={CARD_STYLE}>
                <button onClick={onBack} className="text-[13px] font-medium mb-5 transition-colors" style={{ color: "var(--op-muted)" }}>
                    ← Back to sign in
                </button>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "var(--op-indigo-soft)" }}>
                    <Building2 className="w-5 h-5" style={{ color: "var(--op-indigo)" }} />
                </div>
                <h1 className="font-display font-bold mb-2" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>Enterprise SSO</h1>
                <p className="text-[14px] mb-6" style={{ color: "var(--op-muted)", lineHeight: 1.6 }}>
                    Enter your work email and we&apos;ll redirect you to your identity provider.
                </p>
                <form onSubmit={handleSSO} noValidate className="space-y-4">
                    <div>
                        <label htmlFor="sso-email" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>Work email</label>
                        <input
                            id="sso-email" type="email" placeholder="you@company.com" value={ssoEmail}
                            onChange={(e) => { setSsoEmail(e.target.value); setSsoError(""); }}
                            className={fieldCls(!!ssoError)} autoComplete="email" autoCapitalize="off" autoFocus
                        />
                        {ssoError && <FieldError msg={ssoError} />}
                    </div>
                    <button
                        type="submit" disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                        style={{ background: "var(--op-indigo)" }}
                    >
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Looking up…</> : <>Continue with SSO <ArrowRight className="w-4 h-4" /></>}
                    </button>
                </form>
                <p className="mt-6 text-[12px] text-center" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)", lineHeight: 1.6 }}>
                    SAML 2.0 · OIDC · Okta · Azure AD · Google Workspace
                </p>
            </div>
        </AuthShell>
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
        linkError === "expired_link" ? "Your sign-in link has expired. Please request a new one." :
        linkError === "invalid_link" ? "This sign-in link is invalid. Please try again." :
        linkError === "sso_not_configured" ? "SSO is not set up for your organization. Please sign in with your email and password." :
        linkError === "sso_error" ? "SSO login failed. Please try again or sign in with your email and password." :
        linkError === "sso_no_tenant" ? "No account found for that email. Please sign in with your email and password." :
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
            const lookupRes = await fetch(`/api/portal/auth/lookup-tenant?email=${encodeURIComponent(email.trim().toLowerCase())}`);
            const lookupData = (await lookupRes.json()) as { tenants?: Array<{ tenantId: string; tenantName: string }> };
            const tenants = lookupData.tenants ?? [];

            if (tenants.length === 0) {
                setServerError("Invalid email or password. Please try again.");
                return;
            }

            const tenantId = tenants[0]!.tenantId;

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
        <AuthShell>
            <div className="rounded-2xl bg-white p-8" style={CARD_STYLE}>
                <div className="text-center mb-6">
                    <h1 className="font-display font-bold" style={{ fontSize: "1.6rem", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Sign in</h1>
                    <p className="mt-2 text-[14px]" style={{ color: "var(--op-muted)" }}>Access your AgentFarms workspace.</p>
                </div>

                {/* Enterprise SSO — secondary path */}
                <button
                    onClick={() => setView("sso")}
                    className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg text-[14px] font-semibold bg-white transition-colors hover:bg-[var(--op-paper-2)]"
                    style={{ border: "1px solid var(--op-line)", color: "var(--op-ink)" }}
                >
                    <Building2 className="w-4 h-4" /> Continue with SSO
                </button>

                {/* divider */}
                <div className="flex items-center gap-3 my-5">
                    <div className="flex-1 h-px" style={{ background: "var(--op-line)" }} />
                    <span className="text-[12px]" style={{ color: "var(--op-muted)" }}>or sign in with password</span>
                    <div className="flex-1 h-px" style={{ background: "var(--op-line)" }} />
                </div>

                {justVerified && (
                    <div className="mb-4 rounded-lg px-4 py-3 flex items-start gap-2.5" style={{ background: "var(--op-approved-soft)" }}>
                        <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--op-approved)" }} />
                        <p className="text-[13px]" style={{ color: "var(--op-approved)" }}>Email verified! Sign in below to access your workspace.</p>
                    </div>
                )}

                <form onSubmit={onSubmit} noValidate className="space-y-4">
                    <div>
                        <label htmlFor="lg-email" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>Email</label>
                        <input
                            id="lg-email" type="email" placeholder="you@company.com" value={email}
                            onChange={(e) => setEmail(e.target.value)} className={fieldCls(!!errors.email)}
                            autoComplete="email" autoCapitalize="off"
                        />
                        {errors.email && <FieldError msg={errors.email} />}
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label htmlFor="lg-password" className="block text-[13px] font-medium" style={{ color: "var(--op-ink-soft)" }}>Password</label>
                            <Link href="/portal/forgot-password" className="text-[13px] font-medium hover:underline" style={{ color: "var(--op-indigo)" }}>Forgot password?</Link>
                        </div>
                        <div className="relative">
                            <input
                                id="lg-password" type={showPassword ? "text" : "password"} placeholder="••••••••••" value={password}
                                onChange={(e) => setPassword(e.target.value)} className={fieldCls(!!errors.password, "pr-11")}
                                autoComplete="current-password"
                            />
                            <button
                                type="button" onClick={() => setShowPassword((p) => !p)}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                                style={{ color: "var(--op-muted)" }}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        {errors.password && <FieldError msg={errors.password} />}
                    </div>

                    <div className="flex items-center gap-2.5 pt-0.5">
                        <button
                            type="button" onClick={() => setRememberMe((r) => !r)}
                            className="w-5 h-5 rounded-[5px] flex items-center justify-center shrink-0 transition-all"
                            style={{ border: rememberMe ? "none" : "1.5px solid var(--op-line)", background: rememberMe ? "var(--op-indigo)" : "transparent" }}
                            aria-pressed={rememberMe} aria-label="Keep me signed in for 30 days"
                        >
                            {rememberMe && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                        <span className="text-[13px] select-none cursor-pointer" style={{ color: "var(--op-muted)" }} onClick={() => setRememberMe((r) => !r)}>
                            Keep me signed in for <span className="font-medium" style={{ color: "var(--op-ink)" }}>30 days</span>
                        </span>
                    </div>

                    {serverError && (
                        <div className="rounded-lg px-4 py-3 flex items-start gap-2.5" style={{ background: "#fdecea", border: "1px solid var(--op-blocked)" }}>
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--op-blocked)" }} />
                            <p className="text-[13px]" style={{ color: "var(--op-blocked)" }}>{serverError}</p>
                        </div>
                    )}

                    <button
                        type="submit" disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
                        style={{ background: "var(--op-indigo)" }}
                    >
                        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : <>Sign in <ArrowRight className="w-4 h-4 shrink-0" /></>}
                    </button>
                </form>
            </div>

            <p className="mt-5 text-center text-[13px]" style={{ color: "var(--op-muted)" }}>
                Don&rsquo;t have an account?{" "}
                <Link href="/signup" className="font-medium hover:underline" style={{ color: "var(--op-indigo)" }}>Create one free</Link>
            </p>

            <div className="mt-8 flex items-center justify-center gap-x-5 gap-y-2 flex-wrap text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> SOC 2 Ready</span>
                <span>256-bit TLS</span>
                <span>GDPR Compliant</span>
            </div>
        </AuthShell>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}
