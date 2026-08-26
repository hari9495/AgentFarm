"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Mail, Lock, User, Copy, Check } from "lucide-react";
import Link from "next/link";

type Step = "form" | "success";

/** Same logo lockup as the marketing Navbar so signup reads as the same site. */
function BrandMark() {
    return (
        <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md" style={{ background: "var(--op-indigo)" }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <circle cx="6" cy="6" r="5" stroke="white" strokeWidth="1.5" />
                    <path d="M4 6h4M6 4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </span>
            <span className="font-semibold text-[13px] tracking-[-0.01em]" style={{ color: "var(--op-ink)" }}>AgentFarms</span>
        </Link>
    );
}

/** Left brand panel — light & airy, matching the home hero. The signature
 *  approval-gate card sits on paper as a calm white card, not a blue slab. */
function BrandPanel() {
    return (
        <div className="relative hidden lg:flex flex-col justify-between p-12">
            <BrandMark />

            <div>
                <p className="op-eyebrow mb-4">AI workforce · human control</p>
                <h2 className="font-display font-extrabold" style={{ fontSize: "2.3rem", lineHeight: 1.06, letterSpacing: "-0.03em", color: "var(--op-ink)" }}>
                    Hire AI workers that ship —
                    <br />
                    <span style={{ color: "var(--op-indigo)" }}>behind your approval.</span>
                </h2>

                {/* signature approval-gate card — same styling as the home hero card */}
                <div className="mt-8 max-w-sm rounded-2xl border bg-white p-1.5 shadow-xl" style={{ borderColor: "var(--op-line)" }}>
                    <div className="flex items-center justify-between px-3 py-2" style={{ fontFamily: "var(--font-mono)" }}>
                        <div className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                        </div>
                        <span className="text-[11px]" style={{ color: "var(--op-muted)" }}>approval-queue</span>
                    </div>
                    <div className="rounded-xl p-4" style={{ background: "var(--op-paper-2)" }}>
                        <div className="flex items-center justify-between">
                            <span className="rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider" style={{ fontFamily: "var(--font-mono)", color: "var(--op-approved)", background: "var(--op-approved-soft)" }}>
                                shipped
                            </span>
                            <span className="text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>risk: HIGH</span>
                        </div>
                        <p className="mt-3 text-[15px] font-semibold" style={{ color: "var(--op-ink)" }}>Send offer letter — Jordan Lee</p>
                        <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--op-approved-soft)", color: "var(--op-approved)" }}>
                            <Check className="h-4 w-4" />
                            Approved · offer sent via Gmail
                        </div>
                        <p className="mt-2.5 text-[11px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                            evidence › gmail:send_email · task 98f2a1
                        </p>
                    </div>
                </div>
            </div>

            <ul className="space-y-2.5 text-[14px]" style={{ color: "var(--op-ink-soft)" }}>
                {["13 specialist roles, live in your tools", "Every risky action stops at an approval gate", "Full evidence trail on everything they do"].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--op-approved)" }} />
                        <span>{t}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Slim footer echoing the marketing Footer's bottom bar. */
function AuthFooter() {
    return (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-8 text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
            <span>© {new Date().getFullYear()} AgentFarms</span>
            <Link href="/privacy" className="hover:text-[color:var(--op-indigo)] transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-[color:var(--op-indigo)] transition-colors">Terms</Link>
        </div>
    );
}

export default function SignupPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>("form");
    const [form, setForm] = useState({ companyName: "", displayName: "", email: "", password: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [result, setResult] = useState<{ tenantId: string; emailVerified: boolean; verifyUrl?: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setFieldError(null);
        setLoading(true);

        try {
            const res = await fetch("/api/portal/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyName: form.companyName.trim(),
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    displayName: form.displayName.trim() || undefined,
                }),
            });

            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                field?: string;
                message?: string;
                tenantId?: string;
                emailVerified?: boolean;
                verifyUrl?: string;
            };

            if (!res.ok) {
                if (data.field) setFieldError(data.field);
                setError(data.message ?? "Registration failed. Please try again.");
                return;
            }

            setResult({
                tenantId: data.tenantId ?? "",
                emailVerified: data.emailVerified ?? false,
                verifyUrl: data.verifyUrl,
            });
            setStep("success");
        } catch {
            setError("Unable to connect. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    function copyTenantId() {
        if (!result?.tenantId) return;
        void navigator.clipboard.writeText(result.tenantId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    const fieldCls = (field: string) =>
        `w-full pl-10 pr-3 py-2.5 rounded-lg border bg-white text-[14px] text-[color:var(--op-ink)] placeholder:text-[color:var(--op-muted)] focus:outline-none focus:ring-2 disabled:opacity-60 transition ${
            fieldError === field
                ? "border-[color:var(--op-blocked)] focus:ring-[color:var(--op-blocked)]"
                : "border-[color:var(--op-line)] focus:border-[color:var(--op-indigo)] focus:ring-[color:var(--op-indigo)]"
        }`;

    return (
        <div className="relative min-h-screen grid lg:grid-cols-2 overflow-hidden" style={{ background: "var(--op-paper)", color: "var(--op-ink)" }}>
            {/* soft brand wash — same calm feel as the home hero */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(50% 45% at 18% 12%, var(--op-indigo-soft), transparent 70%), radial-gradient(42% 42% at 95% 92%, var(--op-approved-soft), transparent 70%)" }}
            />

            <div className="relative"><BrandPanel /></div>

            {/* ── Right: the form / success ── */}
            <div className="relative flex flex-col px-5 py-6 sm:px-10">
                {/* slim header row — logo (mobile) + sign-in link */}
                <div className="flex items-center justify-between">
                    <div className="lg:hidden"><BrandMark /></div>
                    <div className="ml-auto text-[13px]" style={{ color: "var(--op-muted)" }}>
                        {step === "form" ? (
                            <>Already have an account?{" "}
                                <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--op-indigo)" }}>Sign in</Link>
                            </>
                        ) : null}
                    </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center py-8">
                    <div className="w-full max-w-md">
                        {step === "success" && result ? (
                            /* ── Success ── */
                            <div>
                                <div className="mb-6 flex flex-col items-start gap-3">
                                    <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: "var(--op-approved-soft)" }}>
                                        <Check className="h-6 w-6" style={{ color: "var(--op-approved)" }} />
                                    </div>
                                    <div>
                                        <h1 className="font-display font-extrabold" style={{ fontSize: "1.9rem", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                                            Workspace created
                                        </h1>
                                        <p className="mt-1.5 text-[14px]" style={{ color: "var(--op-muted)" }}>Your AgentFarms workspace is ready.</p>
                                    </div>
                                </div>

                                <div className="rounded-2xl p-6 space-y-5 bg-white shadow-xl" style={{ border: "1px solid var(--op-line)" }}>
                                    {/* Tenant ID */}
                                    <div className="rounded-xl p-4" style={{ background: "var(--op-paper-2)", border: "1px solid var(--op-line)" }}>
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                                            Your Tenant ID
                                        </p>
                                        <div className="flex items-center justify-between gap-2">
                                            <code className="text-[13px] font-semibold break-all" style={{ fontFamily: "var(--font-mono)", color: "var(--op-indigo)" }}>
                                                {result.tenantId}
                                            </code>
                                            <button
                                                onClick={copyTenantId}
                                                className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-black/[0.04]"
                                                style={{ color: "var(--op-muted)" }}
                                                title="Copy"
                                            >
                                                {copied ? <Check className="w-4 h-4" style={{ color: "var(--op-approved)" }} /> : <Copy className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <p className="mt-2 text-[12px]" style={{ color: "var(--op-muted)" }}>
                                            Save this for API access and support — to sign in you only need your email and password.
                                        </p>
                                    </div>

                                    {/* Verification status */}
                                    {result.emailVerified ? (
                                        <div className="rounded-xl px-4 py-3 text-[14px]" style={{ background: "var(--op-approved-soft)", color: "var(--op-approved)" }}>
                                            Email verified — you can sign in now.
                                        </div>
                                    ) : (
                                        <div className="rounded-xl px-4 py-3 text-[14px] space-y-2" style={{ background: "var(--op-indigo-soft)", color: "var(--op-indigo-ink)" }}>
                                            <p className="font-semibold">Check your email to verify your account.</p>
                                            <p className="text-[12px]">
                                                We sent a verification link to <strong>{form.email}</strong>. Click it before signing in.
                                            </p>
                                            {result.verifyUrl && (
                                                <a href={result.verifyUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-[12px] font-semibold underline">
                                                    Click here to verify (backup link)
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        onClick={() => router.push("/login")}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                                        style={{ background: "var(--op-indigo)" }}
                                    >
                                        Go to login
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* ── Form ── */
                            <div>
                                <div className="mb-6">
                                    <p className="op-eyebrow mb-3">Start free — no card</p>
                                    <h1 className="font-display font-extrabold" style={{ fontSize: "2rem", letterSpacing: "-0.03em", lineHeight: 1.08 }}>
                                        Create your workspace
                                    </h1>
                                    <p className="mt-1.5 text-[14px]" style={{ color: "var(--op-muted)" }}>
                                        Deploy your first AI worker in minutes.
                                    </p>
                                </div>

                                <div className="rounded-2xl bg-white p-7 shadow-xl" style={{ border: "1px solid var(--op-line)" }}>
                                    {error && (
                                        <div className="mb-5 rounded-xl px-4 py-3 text-[14px]" style={{ background: "#fdecea", border: "1px solid var(--op-blocked)", color: "var(--op-blocked)" }}>
                                            {error}
                                        </div>
                                    )}

                                    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                                        <div>
                                            <label htmlFor="sg-company" className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>Company name</label>
                                            <div className="relative">
                                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--op-muted)" }} />
                                                <input id="sg-company" type="text" autoComplete="organization" placeholder="Acme Corp" required value={form.companyName} onChange={set("companyName")} disabled={loading} className={fieldCls("companyName")} />
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="sg-name" className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>
                                                Your name <span className="font-normal" style={{ color: "var(--op-muted)" }}>(optional)</span>
                                            </label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--op-muted)" }} />
                                                <input id="sg-name" type="text" autoComplete="name" placeholder="Jane Smith" value={form.displayName} onChange={set("displayName")} disabled={loading} className={fieldCls("displayName")} />
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="sg-email" className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>Work email</label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--op-muted)" }} />
                                                <input id="sg-email" type="email" autoComplete="email" placeholder="you@company.com" required value={form.email} onChange={set("email")} disabled={loading} className={fieldCls("email")} />
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="sg-password" className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>Password</label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--op-muted)" }} />
                                                <input id="sg-password" type="password" autoComplete="new-password" placeholder="Min. 8 characters" required minLength={8} value={form.password} onChange={set("password")} disabled={loading} className={fieldCls("password")} />
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={loading || form.companyName.trim().length < 2 || !form.email.trim() || form.password.length < 8}
                                            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
                                            style={{ background: "var(--op-indigo)" }}
                                        >
                                            {loading ? (<><Loader2 className="h-4 w-4 animate-spin" />Creating workspace…</>) : "Create my workspace"}
                                        </button>

                                        <p className="text-center text-[11px]" style={{ color: "var(--op-muted)" }}>
                                            By signing up you agree to our{" "}
                                            <Link href="/privacy" className="underline hover:text-[color:var(--op-ink)]">Privacy Policy</Link>{" "}and{" "}
                                            <Link href="/terms" className="underline hover:text-[color:var(--op-ink)]">Terms of Service</Link>.
                                        </p>
                                    </form>
                                </div>
                            </div>
                        )}

                        <AuthFooter />
                    </div>
                </div>
            </div>
        </div>
    );
}
