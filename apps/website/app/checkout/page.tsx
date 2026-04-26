"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-store";

type SubmissionState =
    | { type: "idle" }
    | { type: "submitting" }
    | { type: "success"; requestId: string }
    | { type: "error"; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CHECKOUT_DRAFT_KEY = "agentfarm-checkout-draft";

export default function CheckoutPage() {
    const { items, total, clearCart } = useCart();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [company, setCompany] = useState("");
    const [notes, setNotes] = useState("");
    const [state, setState] = useState<SubmissionState>({ type: "idle" });

    useEffect(() => {
        try {
            const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
            if (!raw) {
                return;
            }

            const parsed = JSON.parse(raw) as {
                name?: string;
                email?: string;
                company?: string;
                notes?: string;
            };

            setName(parsed.name ?? "");
            setEmail(parsed.email ?? "");
            setCompany(parsed.company ?? "");
            setNotes(parsed.notes ?? "");
        } catch {
            // Ignore invalid local draft payloads.
        }
    }, []);

    useEffect(() => {
        const draft = {
            name,
            email,
            company,
            notes,
        };
        localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft));
    }, [name, email, company, notes]);

    const nameError = name.length > 0 && name.trim().length < 2 ? "Enter at least 2 characters." : "";
    const emailError = email.length > 0 && !emailPattern.test(email.trim()) ? "Enter a valid work email." : "";
    const companyError = company.length > 0 && company.trim().length < 2 ? "Enter at least 2 characters." : "";

    const canSubmit = useMemo(() => {
        return (
            items.length > 0 &&
            name.trim().length >= 2 &&
            email.trim().length > 3 &&
            company.trim().length >= 2 &&
            state.type !== "submitting"
        );
    }, [items.length, name, email, company, state.type]);

    const submitQuickStart = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canSubmit) {
            return;
        }

        setState({ type: "submitting" });

        try {
            const response = await fetch("/api/marketplace/quick-start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name,
                    email,
                    company,
                    notes,
                    bots: items,
                }),
            });

            const result = (await response.json()) as {
                requestId?: string;
                error?: string;
            };

            if (!response.ok || !result.requestId) {
                setState({
                    type: "error",
                    message: result.error ?? "Could not submit onboarding request.",
                });
                return;
            }

            clearCart();
            localStorage.removeItem(CHECKOUT_DRAFT_KEY);
            setState({ type: "success", requestId: result.requestId });
        } catch {
            setState({
                type: "error",
                message: "Network error while submitting onboarding request.",
            });
        }
    };

    if (state.type === "success") {
        return (
            <div className="site-shell min-h-screen px-4 py-16">
                <div className="max-w-2xl mx-auto rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-8">
                    <h1 className="text-3xl font-bold text-emerald-800 dark:text-emerald-300 mb-4">
                        Onboarding request received
                    </h1>
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 mb-2">
                        Request ID: <span className="font-mono">{state.requestId}</span>
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-6">
                        Our team will follow up with your quick-start setup details shortly.
                    </p>
                    <Link
                        href="/marketplace"
                        className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
                    >
                        Back to marketplace
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="site-shell min-h-screen px-4 py-12">
            <div className="max-w-5xl mx-auto grid gap-8 lg:grid-cols-5">
                <section className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300 mb-2">
                        Step 3 of 4
                    </p>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                        Confirm your quick-start onboarding
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        Share your details and we will configure your selected bots, repos, and initial rollout plan.
                    </p>

                    <div className="mb-6 rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3">
                        <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">
                            Typical response time: within 1 business day.
                        </p>
                        <p className="text-xs text-blue-700/90 dark:text-blue-400 mt-1">
                            No payment required at this stage. We will confirm scope with you before any activation.
                        </p>
                    </div>

                    <form onSubmit={submitQuickStart} className="space-y-4">
                        <label className="block">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Full name</span>
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                                placeholder="Your name"
                                required
                            />
                            {nameError && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{nameError}</p>}
                        </label>

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Work email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                                placeholder="you@company.com"
                                required
                            />
                            {emailError && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{emailError}</p>}
                        </label>

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Company</span>
                            <input
                                value={company}
                                onChange={(event) => setCompany(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                                placeholder="Company name"
                                required
                            />
                            {companyError && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{companyError}</p>}
                        </label>

                        <label className="block">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Implementation notes</span>
                            <textarea
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                rows={4}
                                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                                placeholder="Tell us about your stack, repos, and onboarding timeline"
                            />
                        </label>

                        {state.type === "error" && (
                            <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
                        )}

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {state.type === "submitting"
                                ? "Submitting..."
                                : `Submit onboarding request${items.length > 0 ? ` (${items.length} bot${items.length !== 1 ? "s" : ""})` : ""}`}
                        </button>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                            By submitting, you agree to start a no-obligation onboarding discussion with the AgentFarm team.
                        </p>
                    </form>
                </section>

                <aside className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 h-fit">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Selected bots</h2>
                    {items.length === 0 ? (
                        <div>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                No bots selected yet. Pick at least one bot to start onboarding.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Link
                                    href="/marketplace"
                                    className="inline-flex items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-semibold text-white dark:text-slate-900"
                                >
                                    Browse marketplace
                                </Link>
                                <Link
                                    href="/get-started"
                                    className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200"
                                >
                                    Contact onboarding
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            <ul className="space-y-3 mb-4">
                                {items.map((item) => (
                                    <li key={item.slug} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2">
                                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{item.price}</p>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                Estimated monthly: ${total.toLocaleString()}
                            </p>
                            <div className="mt-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                    ~{items.length * 40} hrs/mo automated
                                </p>
                                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                                    Saves ~${(items.length * 3000).toLocaleString()}/mo in team time
                                </p>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                                Includes 14-day trial and guided setup support.
                            </p>
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}
