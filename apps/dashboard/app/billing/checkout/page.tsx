'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../../components/page-header';

type Plan = {
    id: string;
    name: string;
    priceUsdCents: number;
    currency: string;
    description?: string;
};

function formatPrice(cents: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: 0,
    }).format(cents / 100);
}

export default function CheckoutPage() {
    const router = useRouter();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(true);
    const [checkingOut, setCheckingOut] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/billing/plans', { cache: 'no-store' })
            .then((r) => r.json() as Promise<{ plans: Plan[] }>)
            .then((data) => {
                setPlans(data.plans ?? []);
                setLoading(false);
            })
            .catch(() => {
                setError('Failed to load plans. Please try again.');
                setLoading(false);
            });
    }, []);

    async function handleCheckout() {
        if (!selectedPlanId || !email) return;
        setCheckingOut(true);
        setError(null);
        try {
            const origin = window.location.origin;
            const res = await fetch('/api/billing/checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planId: selectedPlanId,
                    customerEmail: email,
                    successUrl: `${origin}/billing?checkout=success`,
                    cancelUrl: `${origin}/billing/checkout?checkout=cancelled`,
                }),
            });
            const data = (await res.json()) as { checkoutUrl?: string; error?: string };
            if (!res.ok || !data.checkoutUrl) {
                setError(data.error ?? 'Failed to create checkout session.');
                setCheckingOut(false);
                return;
            }
            window.location.href = data.checkoutUrl;
        } catch {
            setError('Network error. Please try again.');
            setCheckingOut(false);
        }
    }

    if (loading) {
        return (
            <main className="p-8 max-w-2xl mx-auto">
                <p className="text-gray-500">Loading plans…</p>
            </main>
        );
    }

    return (
        <main className="p-8 max-w-2xl mx-auto space-y-8">
            <PageHeader
                eyebrow="Finance"
                title="Upgrade your plan"
                description="Select a plan and complete checkout to activate your subscription."
                backHref="/billing"
                backLabel="← Billing"
            />

            {error && (
                <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {/* Plan selection */}
            <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Choose a plan
                </h2>
                {plans.length === 0 ? (
                    <p className="text-gray-500 text-sm">No active plans available.</p>
                ) : (
                    plans.map((plan) => (
                        <button
                            key={plan.id}
                            onClick={() => setSelectedPlanId(plan.id)}
                            className={`w-full text-left rounded-lg border p-4 transition-colors ${selectedPlanId === plan.id
                                ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium text-gray-900">{plan.name}</p>
                                    {plan.description && (
                                        <p className="text-sm text-gray-500 mt-0.5">{plan.description}</p>
                                    )}
                                </div>
                                <span className="text-lg font-bold text-gray-900">
                                    {formatPrice(plan.priceUsdCents, plan.currency ?? 'usd')}
                                </span>
                            </div>
                        </button>
                    ))
                )}
            </section>

            {/* Email input */}
            <section className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Billing email address
                </label>
                <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
            </section>

            {/* Actions */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleCheckout}
                    disabled={!selectedPlanId || !email || checkingOut}
                    className="inline-flex items-center rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {checkingOut ? 'Redirecting…' : 'Continue to checkout'}
                </button>
                <button
                    onClick={() => router.push('/billing')}
                    className="text-sm text-gray-600 hover:text-gray-900"
                >
                    Cancel
                </button>
            </div>

            <p className="text-xs text-gray-400">
                You will be redirected to our secure payment provider (Stripe) to complete your purchase.
            </p>
        </main>
    );
}
