"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, AlertCircle, Loader2 } from "lucide-react";

/** Logo lockup — same mark as signup / login. */
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

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    async function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            setError("Enter a valid email address.");
            return;
        }
        setSubmitting(true);
        try {
            const response = await fetch("/api/auth/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = (await response.json()) as { error?: string };

            if (!response.ok) {
                setError(data.error ?? "Unable to process request.");
                return;
            }

            setError("");
            setSent(true);
        } catch {
            setError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    const fieldCls = `w-full px-3.5 py-2.5 rounded-lg border bg-white text-[14px] text-[color:var(--op-ink)] placeholder:text-[color:var(--op-muted)] focus:outline-none focus:ring-2 transition ${
        error
            ? "border-[color:var(--op-blocked)] focus:ring-[color:var(--op-blocked)]"
            : "border-[color:var(--op-line)] focus:border-[color:var(--op-indigo)] focus:ring-[color:var(--op-indigo)]"
    }`;

    return (
        <div className="relative min-h-screen flex flex-col overflow-hidden" style={{ background: "var(--op-paper-2)", color: "var(--op-ink)" }}>
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(45% 40% at 50% 0%, var(--op-indigo-soft), transparent 70%)" }} />

            <main className="relative flex-1 flex items-center justify-center px-4 py-12">
                <div className="op-rise w-full max-w-[400px]">
                    <div className="flex justify-center mb-7"><BrandMark /></div>

                    <div className="rounded-2xl bg-white p-8" style={{ border: "1px solid var(--op-line)", boxShadow: "0 10px 40px rgba(16,24,40,0.08)" }}>
                        <div className="text-center mb-6">
                            <h1 className="font-display font-bold" style={{ fontSize: "1.6rem", letterSpacing: "-0.02em", lineHeight: 1.1 }}>Reset your password</h1>
                            <p className="mt-2 text-[14px]" style={{ color: "var(--op-muted)" }}>We&apos;ll send a secure reset link to your email.</p>
                        </div>

                        {!sent ? (
                            <form onSubmit={submit} className="space-y-4" noValidate>
                                <div>
                                    <label htmlFor="fp-email" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>Work email</label>
                                    <input
                                        id="fp-email" type="email" placeholder="you@company.com" value={email}
                                        onChange={(e) => { setEmail(e.target.value); setError(""); }} className={fieldCls} autoComplete="email" autoCapitalize="off"
                                    />
                                    {error && (
                                        <p className="mt-1.5 flex items-center gap-1 text-[12px]" style={{ color: "var(--op-blocked)" }}>
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                                        </p>
                                    )}
                                </div>
                                <button
                                    disabled={submitting} type="submit"
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
                                    style={{ background: "var(--op-indigo)" }}
                                >
                                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <>Send reset link <ArrowRight className="w-4 h-4" /></>}
                                </button>
                            </form>
                        ) : (
                            <div className="rounded-xl px-4 py-4" style={{ background: "var(--op-approved-soft)" }}>
                                <p className="text-[14px] font-semibold inline-flex items-center gap-2" style={{ color: "var(--op-approved)" }}>
                                    <Check className="w-4 h-4" /> Reset email sent
                                </p>
                                <p className="text-[12px] mt-1" style={{ color: "var(--op-approved)" }}>
                                    If this account exists, you&apos;ll receive a secure reset link shortly.
                                </p>
                            </div>
                        )}
                    </div>

                    <p className="mt-5 text-center text-[13px]" style={{ color: "var(--op-muted)" }}>
                        Back to <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--op-indigo)" }}>Sign in</Link>
                    </p>
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
