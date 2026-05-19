'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageHeader } from '../../components/page-header';

// ── Plan definitions ──────────────────────────────────────────────────────────

type PlanTier = {
    id: string;
    name: string;
    price: string;
    period: string;
    description: string;
    features: string[];
    cta: string;
    highlight: boolean;
};

const PLANS: PlanTier[] = [
    {
        id: 'free',
        name: 'Free',
        price: '$0',
        period: 'forever',
        description: 'For individuals exploring AgentFarm.',
        features: [
            '1 active agent',
            '50 tasks / month',
            'Community support',
            'Basic approval queue',
            'Activity feed (7-day history)',
        ],
        cta: 'Current plan',
        highlight: false,
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$49',
        period: 'per agent / month',
        description: 'For teams running agents in production.',
        features: [
            'Up to 10 active agents',
            '2,000 tasks / month per agent',
            'Priority email support',
            'Full approval queue + evidence',
            'Audit log (90-day history)',
            'Custom connector integrations',
            'Role enforcement',
            'Scheduled reports',
        ],
        cta: 'Upgrade to Pro',
        highlight: true,
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 'Custom',
        period: 'contact us',
        description: 'For organisations with compliance and scale requirements.',
        features: [
            'Unlimited agents',
            'Unlimited tasks',
            'Dedicated SLA + support',
            'SSO / SAML',
            'Custom data residency',
            'Private deployment option',
            'Audit log (unlimited retention)',
            'Advanced role profiles',
            'Custom billing terms',
        ],
        cta: 'Contact Sales',
        highlight: false,
    },
];

// ── Inner component ───────────────────────────────────────────────────────────

function UpgradeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get('from') ?? 'free';

    function handleSelect(plan: PlanTier) {
        if (plan.id === 'enterprise') {
            router.push('/contact?subject=enterprise');
            return;
        }
        if (plan.id === 'free') return;
        router.push(`/billing/checkout?plan=${plan.id}`);
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' }}>
                <PageHeader
                    eyebrow="Billing"
                    title="Upgrade your plan"
                    description="Choose the plan that fits your team. Upgrade, downgrade, or cancel any time."
                    backHref="/billing"
                    backLabel="← Billing"
                />

                {/* Plan cards */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '1.25rem',
                        marginTop: '2rem',
                    }}
                >
                    {PLANS.map((plan) => {
                        const isCurrent =
                            (from === 'free' && plan.id === 'free') ||
                            (from === 'pro' && plan.id === 'pro');

                        return (
                            <div
                                key={plan.id}
                                className="card"
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    border: plan.highlight
                                        ? '2px solid var(--brand)'
                                        : '1px solid var(--line)',
                                    position: 'relative',
                                }}
                            >
                                {plan.highlight && (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: '-12px',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            background: 'var(--brand)',
                                            color: '#fff',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            padding: '2px 10px',
                                            borderRadius: 99,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        Most popular
                                    </span>
                                )}

                                <div style={{ flex: 1 }}>
                                    <h2
                                        style={{
                                            margin: '0 0 0.25rem',
                                            fontSize: '1.1rem',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {plan.name}
                                    </h2>
                                    <p
                                        style={{
                                            margin: '0 0 1rem',
                                            fontSize: '0.82rem',
                                            color: 'var(--ink-muted)',
                                        }}
                                    >
                                        {plan.description}
                                    </p>

                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <span
                                            style={{
                                                fontSize: '2rem',
                                                fontWeight: 800,
                                                color: 'var(--ink)',
                                            }}
                                        >
                                            {plan.price}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--ink-muted)',
                                                marginLeft: '0.35rem',
                                            }}
                                        >
                                            {plan.period}
                                        </span>
                                    </div>

                                    <ul
                                        style={{
                                            listStyle: 'none',
                                            padding: 0,
                                            margin: '0 0 1.5rem',
                                            display: 'grid',
                                            gap: '0.45rem',
                                        }}
                                    >
                                        {plan.features.map((f) => (
                                            <li
                                                key={f}
                                                style={{
                                                    fontSize: '0.83rem',
                                                    color: 'var(--ink-soft)',
                                                    display: 'flex',
                                                    gap: '0.5rem',
                                                    alignItems: 'flex-start',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        color: 'var(--brand)',
                                                        fontWeight: 700,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    ✓
                                                </span>
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <button
                                    onClick={() => handleSelect(plan)}
                                    disabled={isCurrent}
                                    style={{
                                        width: '100%',
                                        padding: '0.6rem 1rem',
                                        fontSize: '0.875rem',
                                        fontWeight: 700,
                                        borderRadius: 8,
                                        border: plan.highlight ? 'none' : '1px solid var(--brand)',
                                        background: plan.highlight ? 'var(--brand)' : 'transparent',
                                        color: plan.highlight ? '#fff' : 'var(--brand)',
                                        cursor: isCurrent ? 'default' : 'pointer',
                                        opacity: isCurrent ? 0.5 : 1,
                                    }}
                                >
                                    {isCurrent ? 'Current plan' : plan.cta}
                                </button>
                            </div>
                        );
                    })}
                </div>

                <p
                    style={{
                        textAlign: 'center',
                        marginTop: '2rem',
                        fontSize: '0.8rem',
                        color: 'var(--ink-muted)',
                    }}
                >
                    All plans include a 14-day free trial. No credit card required to start.
                    Questions?{' '}
                    <a href="/contact" style={{ color: 'var(--brand)' }}>
                        Talk to us
                    </a>
                    .
                </p>
            </div>
        </div>
    );
}

// ── Page export ───────────────────────────────────────────────────────────────

export default function UpgradePage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <span className="text-gray-400 text-sm">Loading plans…</span>
                </div>
            }
        >
            <UpgradeContent />
        </Suspense>
    );
}
