"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check } from "lucide-react";
import Link from "next/link";

type Step = "form" | "success";

const TRUST_TOOLS = ["GitHub", "Slack", "Jira", "Gmail", "Salesforce", "Linear"];

/** Logo lockup — same mark as the marketing Navbar. */
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
        `w-full px-3.5 py-2.5 rounded-lg border bg-white text-[14px] text-[color:var(--op-ink)] placeholder:text-[color:var(--op-muted)] focus:outline-none focus:ring-2 disabled:opacity-60 transition ${
            fieldError === field
                ? "border-[color:var(--op-blocked)] focus:ring-[color:var(--op-blocked)]"
                : "border-[color:var(--op-line)] focus:border-[color:var(--op-indigo)] focus:ring-[color:var(--op-indigo)]"
        }`;

    const labelCls = "block text-[13px] font-medium mb-1.5";

    return (
        <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: "var(--op-paper-2)", color: "var(--op-ink)" }}>
            {/* soft brand wash — calm, same family as home */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ background: "radial-gradient(45% 40% at 50% 0%, var(--op-indigo-soft), transparent 70%)" }}
            />

            <main className="relative flex-1 flex items-center justify-center px-4 py-12">
                <div className="op-rise w-full max-w-[400px]">
                    {/* Logo */}
                    <div className="flex justify-center mb-7">
                        <BrandMark />
                    </div>

                    {step === "success" && result ? (
                        /* ── Success ── */
                        <div className="rounded-2xl bg-white p-8" style={{ border: "1px solid var(--op-line)", boxShadow: "0 10px 40px rgba(16,24,40,0.08)" }}>
                            <div className="flex flex-col items-center text-center mb-6">
                                <div className="h-12 w-12 rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--op-approved-soft)" }}>
                                    <Check className="h-6 w-6" style={{ color: "var(--op-approved)" }} />
                                </div>
                                <h1 className="font-display font-bold" style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>Workspace created</h1>
                                <p className="mt-1.5 text-[14px]" style={{ color: "var(--op-muted)" }}>Your AgentFarms workspace is ready.</p>
                            </div>

                            <div className="rounded-xl p-4 mb-4" style={{ background: "var(--op-paper-2)", border: "1px solid var(--op-line)" }}>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] mb-2" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                                    Your Tenant ID
                                </p>
                                <div className="flex items-center justify-between gap-2">
                                    <code className="text-[13px] font-semibold break-all" style={{ fontFamily: "var(--font-mono)", color: "var(--op-indigo)" }}>
                                        {result.tenantId}
                                    </code>
                                    <button onClick={copyTenantId} className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-black/[0.04]" style={{ color: "var(--op-muted)" }} title="Copy">
                                        {copied ? <Check className="w-4 h-4" style={{ color: "var(--op-approved)" }} /> : <Copy className="w-4 h-4" />}
                                    </button>
                                </div>
                                <p className="mt-2 text-[12px]" style={{ color: "var(--op-muted)" }}>
                                    Save this for API access and support — to sign in you only need your email and password.
                                </p>
                            </div>

                            {result.emailVerified ? (
                                <div className="rounded-xl px-4 py-3 text-[14px] mb-4" style={{ background: "var(--op-approved-soft)", color: "var(--op-approved)" }}>
                                    Email verified — you can sign in now.
                                </div>
                            ) : (
                                <div className="rounded-xl px-4 py-3 text-[14px] space-y-2 mb-4" style={{ background: "var(--op-indigo-soft)", color: "var(--op-indigo-ink)" }}>
                                    <p className="font-semibold">Check your email to verify your account.</p>
                                    <p className="text-[12px]">We sent a verification link to <strong>{form.email}</strong>. Click it before signing in.</p>
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
                    ) : (
                        /* ── Form ── */
                        <>
                            <div className="rounded-2xl bg-white p-8" style={{ border: "1px solid var(--op-line)", boxShadow: "0 10px 40px rgba(16,24,40,0.08)" }}>
                                <div className="text-center mb-6">
                                    <h1 className="font-display font-bold" style={{ fontSize: "1.6rem", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                                        Create your workspace
                                    </h1>
                                    <p className="mt-2 text-[14px]" style={{ color: "var(--op-muted)" }}>
                                        Start free — no credit card required.
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-5 rounded-lg px-4 py-3 text-[13px]" style={{ background: "#fdecea", border: "1px solid var(--op-blocked)", color: "var(--op-blocked)" }}>
                                        {error}
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                                    <div>
                                        <label htmlFor="sg-company" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>Company name</label>
                                        <input id="sg-company" type="text" autoComplete="organization" placeholder="Acme Corp" required value={form.companyName} onChange={set("companyName")} disabled={loading} className={fieldCls("companyName")} />
                                    </div>

                                    <div>
                                        <label htmlFor="sg-name" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>
                                            Your name <span className="font-normal" style={{ color: "var(--op-muted)" }}>(optional)</span>
                                        </label>
                                        <input id="sg-name" type="text" autoComplete="name" placeholder="Jane Smith" value={form.displayName} onChange={set("displayName")} disabled={loading} className={fieldCls("displayName")} />
                                    </div>

                                    <div>
                                        <label htmlFor="sg-email" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>Work email</label>
                                        <input id="sg-email" type="email" autoComplete="email" placeholder="you@company.com" required value={form.email} onChange={set("email")} disabled={loading} className={fieldCls("email")} />
                                    </div>

                                    <div>
                                        <label htmlFor="sg-password" className={labelCls} style={{ color: "var(--op-ink-soft)" }}>Password</label>
                                        <input id="sg-password" type="password" autoComplete="new-password" placeholder="Min. 8 characters" required minLength={8} value={form.password} onChange={set("password")} disabled={loading} className={fieldCls("password")} />
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

                            <p className="mt-5 text-center text-[13px]" style={{ color: "var(--op-muted)" }}>
                                Already have an account?{" "}
                                <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--op-indigo)" }}>Sign in</Link>
                            </p>

                            {/* honest social proof — the tools the workers act through */}
                            <div className="mt-10 text-center">
                                <p className="text-[11px] uppercase tracking-[0.14em] mb-3" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                                    Works with the tools you already run
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                                    {TRUST_TOOLS.map((t) => (
                                        <span key={t} className="text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)", opacity: 0.8 }}>{t}</span>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </main>

            {/* slim footer */}
            <footer className="relative flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-8 text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                <span>© {new Date().getFullYear()} AgentFarms</span>
                <Link href="/privacy" className="hover:text-[color:var(--op-indigo)] transition-colors">Privacy</Link>
                <Link href="/terms" className="hover:text-[color:var(--op-indigo)] transition-colors">Terms</Link>
            </footer>
        </div>
    );
}
