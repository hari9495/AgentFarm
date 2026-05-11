'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { SubscriptionStatusCard } from '../components/subscription-status-card';
import { UsageSummaryCard } from '../components/usage-summary-card';
import { CostTrendChart, type WeeklyTrendPoint } from '../components/cost-trend-chart';
import { AgentCostTable, type ProviderCost } from '../components/agent-cost-table';

// ── Types ─────────────────────────────────────────────────────────────────────

type SubscriptionData = {
    status: string;
    expiresAt?: string | null;
    gracePeriodDays?: number;
    suspendedAt?: string | null;
    daysUntilSuspension?: number | null;
};

type CostSummaryData = {
    period_start: string;
    period_end: string;
    total_tokens: number;
    total_cost_usd: number;
    total_invocations: number;
    success_rate: number;
    by_skill: unknown[];
    by_provider: ProviderCost[];
    weekly_trend: WeeklyTrendPoint[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const defaultFrom = (): string => isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
const defaultTo = (): string => isoDate(new Date());

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
    const [from, setFrom] = useState<string>(defaultFrom);
    const [to, setTo] = useState<string>(defaultTo);

    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [costSummary, setCostSummary] = useState<CostSummaryData | null>(null);
    const [subLoading, setSubLoading] = useState(true);
    const [costLoading, setCostLoading] = useState(true);
    const [subError, setSubError] = useState<string | null>(null);
    const [costError, setCostError] = useState<string | null>(null);

    // Fetch subscription once on mount
    useEffect(() => {
        let cancelled = false;
        setSubLoading(true);
        setSubError(null);
        fetch('/api/billing/subscription', { cache: 'no-store' })
            .then((r) => r.json() as Promise<SubscriptionData>)
            .then((data) => {
                if (!cancelled) {
                    setSubscription(data);
                    setSubLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setSubError('Failed to load subscription data.');
                    setSubLoading(false);
                }
            });
        return () => { cancelled = true; };
    }, []);

    // Fetch cost summary whenever from/to changes
    const fetchCostSummary = useCallback(() => {
        setCostLoading(true);
        setCostError(null);
        const params = new URLSearchParams({ from, to });
        fetch(`/api/analytics/cost-summary?${params.toString()}`, { cache: 'no-store' })
            .then((r) => r.json() as Promise<CostSummaryData>)
            .then((data) => {
                setCostSummary(data);
                setCostLoading(false);
            })
            .catch(() => {
                setCostError('Failed to load usage data.');
                setCostLoading(false);
            });
    }, [from, to]);

    useEffect(() => {
        fetchCostSummary();
    }, [fetchCostSummary]);

    const loading = subLoading || costLoading;

    return (
        <div
            className="page-shell"
            style={{
                maxWidth: 960,
                margin: '0 auto',
                padding: '2rem 1.5rem',
                display: 'grid',
                gap: '1.5rem',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                }}
            >
                <div>
                    <Link
                        href="/"
                        style={{
                            fontSize: '0.8rem',
                            color: 'var(--ink-muted)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            marginBottom: '0.4rem',
                        }}
                    >
                        ← Back to Dashboard
                    </Link>
                    <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
                        Billing &amp; Usage
                    </h1>
                </div>

                {/* Date range */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.6rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <label
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: 'var(--ink-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            gap: '0.2rem',
                        }}
                    >
                        From
                        <input
                            type="date"
                            value={from}
                            max={to}
                            onChange={(e) => setFrom(e.target.value)}
                            style={{
                                padding: '0.4rem 0.6rem',
                                borderRadius: 7,
                                border: '1px solid var(--line)',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: 'var(--ink)',
                                background: '#fff',
                            }}
                        />
                    </label>
                    <label
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: 'var(--ink-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            gap: '0.2rem',
                        }}
                    >
                        To
                        <input
                            type="date"
                            value={to}
                            min={from}
                            max={isoDate(new Date())}
                            onChange={(e) => setTo(e.target.value)}
                            style={{
                                padding: '0.4rem 0.6rem',
                                borderRadius: 7,
                                border: '1px solid var(--line)',
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: 'var(--ink)',
                                background: '#fff',
                            }}
                        />
                    </label>
                </div>
            </div>

            {loading && (
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.875rem', margin: 0 }}>
                    Loading billing data…
                </p>
            )}

            {subError && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>{subError}</p>
            )}

            {costError && (
                <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>{costError}</p>
            )}

            {/* Row 1: Subscription */}
            {!subLoading && subscription && (
                <SubscriptionStatusCard
                    status={subscription.status}
                    expiresAt={subscription.expiresAt}
                    gracePeriodDays={subscription.gracePeriodDays}
                    suspendedAt={subscription.suspendedAt}
                    daysUntilSuspension={subscription.daysUntilSuspension}
                    tasksUsed={costSummary?.total_invocations}
                    tasksLimit={
                        // Provide a sensible soft limit per plan; backend does not return this today
                        subscription.status === 'active' ? undefined : undefined
                    }
                />
            )}

            {/* Row 2: Usage + Invoices */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
                    gap: '1rem',
                    alignItems: 'start',
                }}
            >
                {!costLoading && costSummary ? (
                    <UsageSummaryCard
                        total_invocations={costSummary.total_invocations}
                        total_cost_usd={costSummary.total_cost_usd}
                        total_tokens={costSummary.total_tokens}
                        success_rate={costSummary.success_rate}
                        period_start={costSummary.period_start}
                        period_end={costSummary.period_end}
                    />
                ) : (
                    <div className="card" style={{ color: 'var(--ink-muted)', fontSize: '0.875rem' }}>
                        {costLoading ? 'Loading usage…' : 'No usage data.'}
                    </div>
                )}

                {/* Invoice history — placeholder (no backend route today) */}
                <div className="card" style={{ display: 'grid', gap: '0.75rem' }}>
                    <h2 style={{ margin: 0 }}>Invoice History</h2>
                    <p
                        style={{
                            margin: 0,
                            fontSize: '0.83rem',
                            color: 'var(--ink-muted)',
                        }}
                    >
                        Invoices will appear here once available.
                    </p>
                    <div
                        style={{
                            display: 'grid',
                            gap: '0.5rem',
                        }}
                    >
                        {(['Jan 2025', 'Feb 2025', 'Mar 2025'] as const).map((m) => (
                            <div
                                key={m}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '0.5rem 0',
                                    borderBottom: '1px solid var(--line)',
                                    fontSize: '0.83rem',
                                    color: 'var(--ink-soft)',
                                }}
                            >
                                <span>{m}</span>
                                <span
                                    style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--ink-muted)',
                                        fontStyle: 'italic',
                                    }}
                                >
                                    Coming soon
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Row 3: Cost trend */}
            <CostTrendChart data={costSummary?.weekly_trend ?? []} />

            {/* Row 4: Cost by provider */}
            <AgentCostTable byProvider={costSummary?.by_provider ?? []} />
        </div>
    );
}
