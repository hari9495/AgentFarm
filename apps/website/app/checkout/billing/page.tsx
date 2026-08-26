"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe, StripeCardElement } from "@stripe/stripe-js";

// ── Types ──────────────────────────────────────────────────────────────────

type Plan = {
    id: string;
    name: string;
    priceInr: number;
    priceUsd: number;
    agentSlots: number;
    features: string;
    isActive: boolean;
};

type CreateOrderResponse = {
    provider: "stripe" | "razorpay";
    orderId: string;
    clientSecret?: string;
    providerOrderId?: string;
    razorpayOrderId?: string;
    amount?: number;
    currency?: string;
    keyId?: string;
};

type RazorpaySuccessPayload = {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
};

declare global {
    interface Window {
        Razorpay: new (options: Record<string, unknown>) => { open(): void };
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fieldCls =
    "w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-[color:var(--op-ink)] placeholder:text-[color:var(--op-muted)] outline-none focus:ring-2 transition border-[color:var(--op-line)] focus:border-[color:var(--op-indigo)] focus:ring-[color:var(--op-indigo)]";

function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof window !== "undefined" && window.Razorpay) {
            resolve();
            return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Razorpay checkout script."));
        document.body.appendChild(script);
    });
}

// ── Checkout content ───────────────────────────────────────────────────────

function BillingCheckoutContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const planId = searchParams.get("planId") ?? "";
    const initialCountry = (searchParams.get("country") ?? "US").toUpperCase();

    const [plan, setPlan] = useState<Plan | null>(null);
    const [planLoading, setPlanLoading] = useState(true);
    const [planError, setPlanError] = useState("");

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [country, setCountry] = useState<"IN" | "OTHER">(
        initialCountry === "IN" ? "IN" : "OTHER",
    );

    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const stripeRef = useRef<Stripe | null>(null);
    const cardElementRef = useRef<StripeCardElement | null>(null);
    const cardMountRef = useRef<HTMLDivElement>(null);

    // Fetch plan details on mount
    useEffect(() => {
        if (!planId) {
            setPlanError("No plan selected.");
            setPlanLoading(false);
            return;
        }

        fetch("/api/billing/plans")
            .then((r) => r.json() as any)
            .then((data: any) => {
                const found = data.plans?.find((p: any) => p.id === planId);
                if (found) {
                    setPlan(found);
                } else {
                    setPlanError("Plan not found. Please go back and select a plan.");
                }
            })
            .catch(() => setPlanError("Failed to load plan details. Please refresh."))
            .finally(() => setPlanLoading(false));
    }, [planId]);

    // Mount / unmount Stripe card element when country changes
    useEffect(() => {
        if (country === "IN") {
            if (cardElementRef.current) {
                cardElementRef.current.destroy();
                cardElementRef.current = null;
            }
            stripeRef.current = null;
            return;
        }

        const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
        if (!pubKey) return;

        let cancelled = false;

        void loadStripe(pubKey).then((stripe) => {
            if (cancelled || !stripe || !cardMountRef.current) return;
            stripeRef.current = stripe;
            const elements = stripe.elements();
            const card = elements.create("card", {
                style: {
                    base: {
                        color: "#16181d",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: "15px",
                        "::placeholder": { color: "#697586" },
                    },
                },
            });
            card.mount(cardMountRef.current);
            cardElementRef.current = card;
        });

        return () => {
            cancelled = true;
            if (cardElementRef.current) {
                cardElementRef.current.destroy();
                cardElementRef.current = null;
            }
            stripeRef.current = null;
        };
    }, [country]);

    const handleSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            setFormError("");

            if (!fullName.trim()) {
                setFormError("Full name is required.");
                return;
            }
            if (!email.trim() || !email.includes("@")) {
                setFormError("A valid email address is required.");
                return;
            }

            setSubmitting(true);

            try {
                const orderRes = await fetch("/api/billing/create-order", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        planId,
                        customerEmail: email.trim(),
                        customerCountry: country === "IN" ? "IN" : "US",
                    }),
                });

                if (orderRes.status === 401) {
                    setFormError("Please sign in to continue.");
                    return;
                }

                if (!orderRes.ok) {
                    const errData = (await orderRes.json() as any) as { error?: string };
                    setFormError(errData.error ?? "Failed to create order. Please try again.");
                    return;
                }

                const data = (await orderRes.json() as any) as CreateOrderResponse;

                if (data.provider === "razorpay") {
                    await loadRazorpayScript();

                    await new Promise<void>((resolve, reject) => {
                        const rzp = new window.Razorpay({
                            key: data.keyId,
                            amount: data.amount,
                            currency: data.currency ?? "INR",
                            order_id: data.razorpayOrderId,
                            name: "AgentFarms",
                            description: `${plan?.name ?? "Plan"} subscription`,
                            prefill: {
                                name: fullName.trim(),
                                email: email.trim(),
                            },
                            handler: async (response: RazorpaySuccessPayload) => {
                                await fetch("/api/billing/webhook/razorpay", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        razorpay_order_id: response.razorpay_order_id,
                                        razorpay_payment_id: response.razorpay_payment_id,
                                        razorpay_signature: response.razorpay_signature,
                                        orderId: data.orderId,
                                    }),
                                }).catch(() => null);
                                resolve();
                                router.push("/checkout/billing/success");
                            },
                            modal: {
                                ondismiss: () => reject(new Error("dismissed")),
                            },
                        });
                        rzp.open();
                    });
                } else if (data.provider === "stripe") {
                    const stripe = stripeRef.current;
                    const card = cardElementRef.current;
                    if (!stripe || !card) {
                        setFormError("Card payment is not ready. Please refresh and try again.");
                        return;
                    }

                    const clientSecret = data.clientSecret;
                    if (!clientSecret) {
                        setFormError("Missing Stripe credentials. Please try again.");
                        return;
                    }

                    const { error: stripeError } = await stripe.confirmCardPayment(clientSecret, {
                        payment_method: {
                            card,
                            billing_details: {
                                name: fullName.trim(),
                                email: email.trim(),
                            },
                        },
                    });

                    if (stripeError) {
                        setFormError(stripeError.message ?? "Payment failed. Please try again.");
                        return;
                    }

                    router.push("/checkout/billing/success");
                }
            } catch (err) {
                if ((err as Error).message !== "dismissed") {
                    setFormError("Payment failed. Please try again.");
                }
            } finally {
                setSubmitting(false);
            }
        },
        [planId, fullName, email, country, plan, router],
    );

    const isIndia = country === "IN";
    const priceDisplay = plan
        ? isIndia
            ? `₹${plan.priceInr.toLocaleString("en-IN")}/mo`
            : `$${plan.priceUsd}/mo`
        : null;

    return (
        <div className="relative min-h-screen flex items-center justify-center px-4 py-12 overflow-hidden" style={{ background: "var(--op-paper-2)", color: "var(--op-ink)" }}>
            <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(45% 40% at 50% 0%, var(--op-indigo-soft), transparent 70%)" }} />
            <div className="relative op-rise w-full max-w-lg">

                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="font-display font-bold" style={{ fontSize: "2rem", letterSpacing: "-0.02em" }}>
                        Complete your order
                    </h1>
                    <p className="mt-2 text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                        Secure checkout · Stripe &amp; Razorpay
                    </p>
                </div>

                {/* Plan summary */}
                {planLoading ? (
                    <div className="rounded-2xl bg-white p-5 mb-6 animate-pulse" style={{ border: "1px solid var(--op-line)" }}>
                        <div className="h-4 rounded w-1/3 mb-3" style={{ background: "var(--op-paper-3)" }} />
                        <div className="h-8 rounded w-1/4" style={{ background: "var(--op-paper-3)" }} />
                    </div>
                ) : planError ? (
                    <div className="rounded-2xl p-5 mb-6 text-[14px]" style={{ border: "1px solid var(--op-blocked)", background: "#fdecea", color: "var(--op-blocked)" }}>
                        {planError}
                    </div>
                ) : plan ? (
                    <div className="rounded-2xl bg-white p-5 mb-6 flex items-center justify-between" style={{ border: "1px solid var(--op-line)", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
                        <div>
                            <p className="op-eyebrow mb-1">Selected plan</p>
                            <p className="font-display font-bold" style={{ fontSize: "1.25rem", color: "var(--op-ink)" }}>{plan.name}</p>
                            <p className="text-[12px] mt-0.5" style={{ color: "var(--op-muted)" }}>
                                {plan.agentSlots} agent slots
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="font-bold" style={{ fontSize: "1.5rem", fontFamily: "var(--font-mono)", color: "var(--op-indigo)" }}>
                                {priceDisplay}
                            </p>
                        </div>
                    </div>
                ) : null}

                {/* Form */}
                <div className="rounded-2xl bg-white p-6" style={{ border: "1px solid var(--op-line)", boxShadow: "0 10px 40px rgba(16,24,40,0.08)" }}>
                    <form onSubmit={handleSubmit} noValidate className="space-y-5">

                        {/* Full name */}
                        <div>
                            <label htmlFor="checkout-name" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>
                                Full name
                            </label>
                            <input
                                id="checkout-name"
                                type="text"
                                required
                                autoComplete="name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                placeholder="Jane Smith"
                                className={fieldCls}
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label htmlFor="checkout-email" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>
                                Email address
                            </label>
                            <input
                                id="checkout-email"
                                type="email"
                                required
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="jane@company.com"
                                className={fieldCls}
                            />
                        </div>

                        {/* Country */}
                        <div>
                            <label htmlFor="checkout-country" className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>
                                Country
                            </label>
                            <select
                                id="checkout-country"
                                value={country}
                                onChange={(e) => setCountry(e.target.value as "IN" | "OTHER")}
                                className={fieldCls}
                            >
                                <option value="IN">India</option>
                                <option value="OTHER">Other</option>
                            </select>
                            {plan && (
                                <p className="mt-1.5 text-[12px]" style={{ color: "var(--op-muted)" }}>
                                    {isIndia
                                        ? `Charged ₹${plan.priceInr.toLocaleString("en-IN")} / month via Razorpay`
                                        : `Charged $${plan.priceUsd} / month via Stripe`}
                                </p>
                            )}
                        </div>

                        {/* Stripe card element — only for non-India */}
                        {!isIndia && (
                            <div>
                                <label className="block text-[13px] font-medium mb-1.5" style={{ color: "var(--op-ink-soft)" }}>
                                    Card details
                                </label>
                                <div
                                    ref={cardMountRef}
                                    className="rounded-lg bg-white px-3.5 py-3.5 min-h-[46px]"
                                    style={{ border: "1px solid var(--op-line)" }}
                                />
                            </div>
                        )}

                        {/* Error */}
                        {formError && (
                            <div className="rounded-lg px-4 py-3 text-[13px]" style={{ border: "1px solid var(--op-blocked)", background: "#fdecea", color: "var(--op-blocked)" }}>
                                {formError}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting || planLoading || !!planError}
                            className="w-full rounded-lg text-white font-semibold py-3 text-[14px] shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 flex items-center justify-center gap-2"
                            style={{ background: "var(--op-indigo)" }}
                        >
                            {submitting ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Processing…
                                </>
                            ) : isIndia ? (
                                "Pay with Razorpay"
                            ) : (
                                "Pay with Stripe"
                            )}
                        </button>

                    </form>
                </div>

                <p className="mt-6 text-center text-[12px]" style={{ color: "var(--op-muted)" }}>
                    By completing this payment you agree to the AgentFarms{" "}
                    <a href="/terms" className="underline hover:text-[color:var(--op-ink)]">
                        Terms of Service
                    </a>
                    .
                </p>

            </div>
        </div>
    );
}

// ── Page export ────────────────────────────────────────────────────────────

export default function BillingCheckoutPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--op-paper-2)" }}>
                    <p className="text-[14px] animate-pulse" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>Loading checkout…</p>
                </div>
            }
        >
            <BillingCheckoutContent />
        </Suspense>
    );
}
