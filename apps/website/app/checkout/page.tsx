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

const fieldCls =
    "mt-1 w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-[color:var(--op-ink)] placeholder:text-[color:var(--op-muted)] outline-none focus:ring-2 transition border-[color:var(--op-line)] focus:border-[color:var(--op-indigo)] focus:ring-[color:var(--op-indigo)]";

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
            <div className="min-h-screen px-4 py-16" style={{ color: "var(--op-ink)" }}>
                <div className="op-rise max-w-2xl mx-auto rounded-2xl p-8" style={{ border: "1px solid var(--op-approved)", background: "var(--op-approved-soft)" }}>
                    <h1 className="font-display font-bold mb-4" style={{ fontSize: "1.75rem", letterSpacing: "-0.02em", color: "var(--op-ink)" }}>
                        Onboarding request received
                    </h1>
                    <p className="text-[14px] mb-2" style={{ color: "var(--op-ink-soft)" }}>
                        Request ID: <span style={{ fontFamily: "var(--font-mono)", color: "var(--op-approved)" }}>{state.requestId}</span>
                    </p>
                    <p className="text-[14px] mb-6" style={{ color: "var(--op-muted)" }}>
                        Our team will follow up with your quick-start setup details shortly.
                    </p>
                    <Link
                        href="/marketplace"
                        className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                        style={{ background: "var(--op-indigo)" }}
                    >
                        Back to marketplace
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen px-4 py-12" style={{ color: "var(--op-ink)" }}>
            <div className="op-rise max-w-5xl mx-auto grid gap-6 lg:grid-cols-5">
                <section className="lg:col-span-3 rounded-2xl bg-white p-7" style={{ border: "1px solid var(--op-line)", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
                    <p className="op-eyebrow mb-2">Step 3 of 4</p>
                    <h1 className="font-display font-bold mb-2" style={{ fontSize: "1.6rem", letterSpacing: "-0.02em" }}>
                        Confirm your quick-start onboarding
                    </h1>
                    <p className="text-[14px] mb-6" style={{ color: "var(--op-muted)" }}>
                        Share your details and we&apos;ll configure your selected bots, repos, and initial rollout plan.
                    </p>

                    <div className="mb-6 rounded-xl px-4 py-3" style={{ border: "1px solid var(--op-indigo)", background: "var(--op-indigo-soft)" }}>
                        <p className="text-[14px] font-medium" style={{ color: "var(--op-indigo-ink)" }}>
                            Typical response time: within 1 business day.
                        </p>
                        <p className="text-[12px] mt-1" style={{ color: "var(--op-indigo-ink)" }}>
                            No payment required at this stage. We&apos;ll confirm scope with you before any activation.
                        </p>
                    </div>

                    <form onSubmit={submitQuickStart} className="space-y-4">
                        <label className="block">
                            <span className="text-[13px] font-medium" style={{ color: "var(--op-ink-soft)" }}>Full name</span>
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                className={fieldCls}
                                placeholder="Your name"
                                required
                            />
                            {nameError && <p className="mt-1 text-[12px]" style={{ color: "var(--op-pending)" }}>{nameError}</p>}
                        </label>

                        <label className="block">
                            <span className="text-[13px] font-medium" style={{ color: "var(--op-ink-soft)" }}>Work email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                className={fieldCls}
                                placeholder="you@company.com"
                                required
                            />
                            {emailError && <p className="mt-1 text-[12px]" style={{ color: "var(--op-pending)" }}>{emailError}</p>}
                        </label>

                        <label className="block">
                            <span className="text-[13px] font-medium" style={{ color: "var(--op-ink-soft)" }}>Company</span>
                            <input
                                value={company}
                                onChange={(event) => setCompany(event.target.value)}
                                className={fieldCls}
                                placeholder="Company name"
                                required
                            />
                            {companyError && <p className="mt-1 text-[12px]" style={{ color: "var(--op-pending)" }}>{companyError}</p>}
                        </label>

                        <label className="block">
                            <span className="text-[13px] font-medium" style={{ color: "var(--op-ink-soft)" }}>Implementation notes</span>
                            <textarea
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                rows={4}
                                className={fieldCls}
                                placeholder="Tell us about your stack, repos, and onboarding timeline"
                            />
                        </label>

                        {state.type === "error" && (
                            <p className="text-[13px]" style={{ color: "var(--op-blocked)" }}>{state.message}</p>
                        )}

                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                            style={{ background: "var(--op-indigo)" }}
                        >
                            {state.type === "submitting"
                                ? "Submitting…"
                                : `Submit onboarding request${items.length > 0 ? ` (${items.length} bot${items.length !== 1 ? "s" : ""})` : ""}`}
                        </button>
                        <p className="text-[12px]" style={{ color: "var(--op-muted)" }}>
                            By submitting, you agree to start a no-obligation onboarding discussion with the AgentFarms team.
                        </p>
                    </form>
                </section>

                <aside className="lg:col-span-2 rounded-2xl p-6 h-fit" style={{ border: "1px solid var(--op-line)", background: "var(--op-paper-2)" }}>
                    <h2 className="font-display font-bold mb-4" style={{ fontSize: "1.125rem", letterSpacing: "-0.01em" }}>Selected bots</h2>
                    {items.length === 0 ? (
                        <div>
                            <p className="text-[14px] mb-4" style={{ color: "var(--op-muted)" }}>
                                No bots selected yet. Pick at least one bot to start onboarding.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Link
                                    href="/marketplace"
                                    className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
                                    style={{ background: "var(--op-indigo)" }}
                                >
                                    Browse marketplace
                                </Link>
                                <Link
                                    href="/get-started"
                                    className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-[13px] font-semibold"
                                    style={{ border: "1px solid var(--op-line)", color: "var(--op-ink)" }}
                                >
                                    Contact onboarding
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <>
                            <ul className="space-y-3 mb-4">
                                {items.map((item) => (
                                    <li key={item.slug} className="rounded-lg bg-white px-3 py-2.5" style={{ border: "1px solid var(--op-line)" }}>
                                        <p className="text-[14px] font-medium" style={{ color: "var(--op-ink)" }}>{item.name}</p>
                                        <p className="text-[12px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>{item.price}</p>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-[14px] font-semibold" style={{ color: "var(--op-ink)" }}>
                                Estimated monthly: <span style={{ fontFamily: "var(--font-mono)" }}>${total.toLocaleString()}</span>
                            </p>
                            <div className="mt-3 rounded-xl px-4 py-3" style={{ background: "var(--op-approved-soft)", border: "1px solid var(--op-approved)" }}>
                                <p className="text-[12px] font-semibold" style={{ color: "var(--op-approved)" }}>
                                    ~{items.length * 40} hrs/mo automated
                                </p>
                                <p className="text-[12px] mt-0.5" style={{ color: "var(--op-approved)" }}>
                                    Saves ~${(items.length * 3000).toLocaleString()}/mo in team time
                                </p>
                            </div>
                            <p className="text-[12px] mt-2" style={{ color: "var(--op-muted)" }}>
                                Includes 14-day trial and guided setup support.
                            </p>
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}
