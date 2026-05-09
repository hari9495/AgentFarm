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
            .then((r) => r.json())
            .then((data: { plans?: Plan[] }) => {
                const found = data.plans?.find((p) => p.id === planId);
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
                        color: "#1e293b",
                        fontFamily: "system-ui, sans-serif",
                        fontSize: "16px",
                        "::placeholder": { color: "#94a3b8" },
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
                    const errData = (await orderRes.json()) as { error?: string };
                    setFormError(errData.error ?? "Failed to create order. Please try again.");
                    return;
                }

                const data = (await orderRes.json()) as CreateOrderResponse;

                if (data.provider === "razorpay") {
                    await loadRazorpayScript();

                    await new Promise<void>((resolve, reject) => {
                        const rzp = new window.Razorpay({
                            key: data.keyId,
                            amount: data.amount,
                            currency: data.currency ?? "INR",
                            order_id: data.razorpayOrderId,
                            name: "AgentFarm",
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
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center px-4 py-12">
            <div className="w-full max-w-lg">

                {/* Header */}
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                        Complete your order
                    </h1>
                    <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm">
                        Secure checkout powered by Stripe &amp; Razorpay
                    </p>
                </div>

                {/* Plan summary */}
                {planLoading ? (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-6 animate-pulse">
                        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-3" />
                        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                    </div>
                ) : planError ? (
                    <div className="rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-5 mb-6 text-red-700 dark:text-red-400 text-sm">
                        {planError}
                    </div>
                ) : plan ? (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-5 mb-6 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
                                Selected plan
                            </p>
                            <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100">{plan.name}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {plan.agentSlots} agent slots
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                                {priceDisplay}
                            </p>
                        </div>
                    </div>
                ) : null}

                {/* Form */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
                    <form onSubmit={handleSubmit} noValidate className="space-y-5">

                        {/* Full name */}
                        <div>
                            <label
                                htmlFor="checkout-name"
                                className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                            >
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
                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label
                                htmlFor="checkout-email"
                                className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                            >
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
                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                            />
                        </div>

                        {/* Country */}
                        <div>
                            <label
                                htmlFor="checkout-country"
                                className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                            >
                                Country
                            </label>
                            <select
                                id="checkout-country"
                                value={country}
                                onChange={(e) => setCountry(e.target.value as "IN" | "OTHER")}
                                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition"
                            >
                                <option value="IN">India</option>
                                <option value="OTHER">Other</option>
                            </select>
                            {plan && (
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    {isIndia
                                        ? `Charged ₹${plan.priceInr.toLocaleString("en-IN")} / month via Razorpay`
                                        : `Charged $${plan.priceUsd} / month via Stripe`}
                                </p>
                            )}
                        </div>

                        {/* Stripe card element — only for non-India */}
                        {!isIndia && (
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Card details
                                </label>
                                <div
                                    ref={cardMountRef}
                                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3.5 min-h-[46px]"
                                />
                            </div>
                        )}

                        {/* Error */}
                        {formError && (
                            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                                {formError}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting || planLoading || !!planError}
                            className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-3.5 text-sm transition-colors flex items-center justify-center gap-2"
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

                <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    By completing this payment you agree to the AgentFarm{" "}
                    <a href="/terms" className="underline hover:text-slate-600 dark:hover:text-slate-300">
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
                <div className="min-h-screen flex items-center justify-center">
                    <p className="text-slate-400 text-sm animate-pulse">Loading checkout…</p>
                </div>
            }
        >
            <BillingCheckoutContent />
        </Suspense>
    );
}
