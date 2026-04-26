"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Mail } from "lucide-react";

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

    return (
        <section className="site-shell min-h-screen py-16">
            <div className="mx-auto max-w-md px-4 sm:px-6">
                <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
                    <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Reset your password</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">We will send a reset link to your email.</p>

                    {!sent ? (
                        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
                            <label className="block">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Work email</span>
                                <div className="relative mt-1.5">
                                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-10 py-2.5 text-sm focus:border-sky-500 outline-none" />
                                </div>
                            </label>
                            {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
                            <button disabled={submitting} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-semibold text-white dark:text-slate-900 disabled:cursor-not-allowed disabled:opacity-70">
                                {submitting ? "Sending..." : "Send reset link"} <ArrowRight className="w-4 h-4" />
                            </button>
                        </form>
                    ) : (
                        <div className="mt-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
                            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 inline-flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" /> Reset email sent
                            </p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">If this account exists, you will receive a secure reset link shortly.</p>
                        </div>
                    )}

                    <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                        Back to <Link href="/login" className="font-semibold text-sky-700 dark:text-sky-300 hover:underline">Sign in</Link>
                    </p>
                </div>
            </div>
        </section>
    );
}
