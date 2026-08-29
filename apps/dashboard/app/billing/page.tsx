'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '../components/page-header';
import { SubscriptionStatusCard } from '../components/subscription-status-card';
import { UsageSummaryCard } from '../components/usage-summary-card';
import { CostTrendChart, type WeeklyTrendPoint } from '../components/cost-trend-chart';
import { AgentCostTable, type ProviderCost } from '../components/agent-cost-table';
import { UiKit, Masthead, Panel, Badge, Eyebrow, Display, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

// ── Types ─────────────────────────────────────────────────────────────────────

type OrderInvoice = {
    id: string;
    number?: string | null;
    amountCents: number;
    currency: string;
    paidAt?: string | null;
    pdfUrl?: string | null;
};

type Order = {
    id: string;
    planId: string;
    status: string;
    amountCents: number;
    currency: string;
    createdAt: string;
    invoice?: OrderInvoice | null;
};

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

type MeteringData = {
    taskCount: number;
    billableTaskCount: number;
    platformFeeUsd: number;
    llmCostUsd: number;
    totalChargeUsd: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const defaultFrom = (): string => isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
const defaultTo = (): string => isoDate(new Date());

function Kv({ k, children }: { k: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
            <span style={{ color: 'var(--ink-muted)' }}>{k}</span>
            <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{children}</span>
        </div>
    );
}

// ── MeteringBreakdownCard ─────────────────────────────────────────────────────

function MeteringBreakdownCard({ data }: { data: MeteringData }) {
    const rows: { label: string; value: string; highlight?: boolean }[] = [
        { label: 'Total tasks', value: data.taskCount.toLocaleString() },
        { label: 'Billable tasks', value: data.billableTaskCount.toLocaleString() },
        { label: 'Platform fee ($0.10 / task)', value: `$${data.platformFeeUsd.toFixed(2)}` },
        { label: 'LLM inference cost', value: `$${data.llmCostUsd.toFixed(4)}` },
        { label: 'Total charge', value: `$${data.totalChargeUsd.toFixed(2)}`, highlight: true },
    ];

    return (
        <div className="card" style={{ display: 'grid', gap: '0.5rem' }}>
            <h2 style={{ margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>Metering Breakdown</h2>
            {rows.map(({ label, value, highlight }) => (
                <div
                    key={label}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.4rem 0',
                        borderBottom: '1px solid var(--line)',
                        fontSize: highlight ? '0.9rem' : '0.83rem',
                        fontWeight: highlight ? 700 : 400,
                        color: highlight ? 'var(--ink)' : 'var(--ink-soft)',
                    }}
                >
                    <span>{label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                </div>
            ))}
        </div>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
    const [from, setFrom] = useState<string>(defaultFrom);
    const [to, setTo] = useState<string>(defaultTo);

    const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
    const [costSummary, setCostSummary] = useState<CostSummaryData | null>(null);
    const [metering, setMetering] = useState<MeteringData | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [subLoading, setSubLoading] = useState(true);
    const [costLoading, setCostLoading] = useState(true);
    const [subError, setSubError] = useState<string | null>(null);
    const [costError, setCostError] = useState<string | null>(null);

    // Fetch subscription + orders once on mount
    useEffect(() => {
        let cancelled = false;
        setSubLoading(true);
        setSubError(null);
        Promise.all([
            fetch('/api/billing/subscription', { cache: 'no-store' }).then(async (r) => {
                if (!r.ok) throw new Error('Failed to load subscription');
                return r.json() as Promise<SubscriptionData>;
            }),
            fetch('/api/billing/orders', { cache: 'no-store' }).then((r) => r.ok ? (r.json() as Promise<{ orders: Order[] }>) : Promise.resolve({ orders: [] })),
        ])
            .then(([subData, ordersData]) => {
                if (!cancelled) {
                    setSubscription(subData);
                    setOrders(ordersData.orders ?? []);
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
            .then(async (r) => {
                if (!r.ok) throw new Error('Failed to load cost data');
                return r.json() as Promise<CostSummaryData>;
            })
            .then((data) => {
                setCostSummary(data);
                setCostLoading(false);
            })
            .catch(() => {
                setCostError('Failed to load usage data.');
                setCostLoading(false);
            });

        const meteringParams = new URLSearchParams({ from, to });
        fetch(`/api/billing/metering?${meteringParams.toString()}`, { cache: 'no-store' })
            .then((r) => (r.ok ? (r.json() as Promise<MeteringData>) : Promise.reject()))
            .then((data) => { setMetering(data); })
            .catch(() => { setMetering(null); });
    }, [from, to]);

    useEffect(() => {
        fetchCostSummary();
    }, [fetchCostSummary]);

    const loading = subLoading || costLoading;

    const dateInput = (label: string, value: string, onChange: (v: string) => void, extra: { min?: string; max?: string }) => (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="uk-eyebrow">{label}</span>
            <input type="date" value={value} {...extra} onChange={(e) => onChange(e.target.value)} className="uk-input" style={{ width: 150 }} />
        </label>
    );

    return (
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Finance — Subscription & Usage"
                title="Billing"
                actions={<WfThemeToggle />}
                stats={
                    <>
                        <Stat n={costSummary ? `$${costSummary.total_cost_usd.toFixed(2)}` : '—'} k="Cost · period" tone="accent" />
                        <Stat n={costSummary ? costSummary.total_invocations.toLocaleString() : '—'} k="Invocations" tone="muted" />
                        <Stat n={subscription ? subscription.status : '—'} k="Subscription" tone={subscription && subscription.status === 'active' ? 'ok' : 'warn'} />
                    </>
                }
            />

            <div style={{ padding: 28, maxWidth: 1120, margin: '0 auto', width: '100%', display: 'grid', gap: 20 }}>
                {/* Date range */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                    {dateInput('From', from, setFrom, { max: to })}
                    {dateInput('To', to, setTo, { min: from, max: isoDate(new Date()) })}
                    {loading && <span className="uk-mono" style={{ fontSize: 11, color: 'var(--ink-muted)', paddingBottom: 8 }}>Loading billing data…</span>}
                </div>

                {(subError || costError) && (
                    <div className="uk-panel" style={{ padding: 14, borderLeft: '2px solid var(--danger)', display: 'grid', gap: 4 }}>
                        {subError && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{subError}</span>}
                        {costError && <span style={{ color: 'var(--danger)', fontSize: 13 }}>{costError}</span>}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 20, alignItems: 'start' }}>
                    {/* Left column */}
                    <div style={{ display: 'grid', gap: 20 }}>
                        <Panel
                            title="Subscription"
                            action={subscription ? <Badge tone={subscription.status === 'active' ? 'ok' : 'warn'}>{subscription.status}</Badge> : undefined}
                        >
                            {subError ? (
                                <div style={{ color: 'var(--danger)', fontSize: 13 }}>{subError}</div>
                            ) : subLoading ? (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Loading…</div>
                            ) : subscription ? (
                                <>
                                    {subscription.expiresAt && <Kv k="Renews / expires">{new Date(subscription.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Kv>}
                                    {typeof subscription.gracePeriodDays === 'number' && <Kv k="Grace period">{subscription.gracePeriodDays} days</Kv>}
                                    {subscription.suspendedAt && <Kv k="Suspended">{new Date(subscription.suspendedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Kv>}
                                    {subscription.daysUntilSuspension != null && <Kv k="Days until suspension"><span style={{ color: subscription.daysUntilSuspension <= 3 ? 'var(--danger)' : 'var(--ink)' }}>{subscription.daysUntilSuspension}</span></Kv>}
                                </>
                            ) : (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No active subscription.</div>
                            )}
                        </Panel>

                        {metering && (
                            <Panel title="Metering breakdown" action={<Eyebrow>this period</Eyebrow>}>
                                <Kv k="Total tasks">{metering.taskCount.toLocaleString()}</Kv>
                                <Kv k="Billable tasks">{metering.billableTaskCount.toLocaleString()}</Kv>
                                <Kv k="Platform fee"><span className="uk-mono">${metering.platformFeeUsd.toFixed(2)}</span></Kv>
                                <Kv k="LLM inference"><span className="uk-mono">${metering.llmCostUsd.toFixed(4)}</span></Kv>
                                <Kv k="Total charge"><span className="uk-mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>${metering.totalChargeUsd.toFixed(2)}</span></Kv>
                            </Panel>
                        )}

                        <Panel
                            title="Cost by provider"
                            action={<Eyebrow>{costSummary ? costSummary.total_tokens.toLocaleString() : 0} tokens</Eyebrow>}
                        >
                            {costError ? (
                                <div style={{ color: 'var(--danger)', fontSize: 13 }}>{costError}</div>
                            ) : costLoading ? (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Loading usage…</div>
                            ) : costSummary && costSummary.by_provider.length > 0 ? (
                                <div style={{ display: 'grid', gap: 12, marginTop: 4 }}>
                                    {(() => {
                                        const maxC = Math.max(...costSummary.by_provider.map((p) => p.estimated_cost_usd), 0.0001);
                                        return costSummary.by_provider.map((p) => (
                                            <div key={p.provider} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 68px', alignItems: 'center', gap: 12 }}>
                                                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{p.provider}</span>
                                                <div style={{ height: 6, background: 'var(--bg-deep, var(--line))', overflow: 'hidden', borderRadius: 2 }}>
                                                    <div style={{ height: '100%', width: `${Math.max(2, (p.estimated_cost_usd / maxC) * 100)}%`, background: 'var(--accent)' }} />
                                                </div>
                                                <span className="uk-mono" style={{ fontSize: 12, color: 'var(--ink-muted)', textAlign: 'right' }}>${p.estimated_cost_usd.toFixed(2)}</span>
                                            </div>
                                        ));
                                    })()}
                                </div>
                            ) : (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No usage in this period.</div>
                            )}
                        </Panel>
                    </div>

                    {/* Right column */}
                    <div style={{ display: 'grid', gap: 20 }}>
                        <Panel title="Usage summary">
                            {costLoading ? (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>Loading usage…</div>
                            ) : costSummary ? (
                                <>
                                    <Kv k="Invocations">{costSummary.total_invocations.toLocaleString()}</Kv>
                                    <Kv k="Tokens">{costSummary.total_tokens.toLocaleString()}</Kv>
                                    <Kv k="Total cost"><span className="uk-mono" style={{ color: 'var(--ink)', fontWeight: 600 }}>${costSummary.total_cost_usd.toFixed(2)}</span></Kv>
                                    <Kv k="Success rate"><span style={{ color: costSummary.success_rate >= 0.95 ? 'var(--ok)' : costSummary.success_rate >= 0.8 ? 'var(--warn)' : 'var(--danger)' }}>{(costSummary.success_rate * 100).toFixed(1)}%</span></Kv>
                                    <Kv k="Period">{new Date(costSummary.period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — {new Date(costSummary.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Kv>
                                </>
                            ) : (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No usage data.</div>
                            )}
                        </Panel>

                        <Panel title="Invoices & orders">
                            {orders.length === 0 ? (
                                <div style={{ color: 'var(--ink-muted)', fontSize: 13 }}>No invoices yet.</div>
                            ) : (
                                <table className="uk-ledger">
                                    <thead><tr><th>Invoice</th><th>Status</th><th>Amount</th></tr></thead>
                                    <tbody>
                                        {orders.slice(0, 8).map((order) => {
                                            const inv = order.invoice;
                                            const label = inv?.number ? `INV-${inv.number}` : new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                                            const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: (inv?.currency ?? order.currency ?? 'usd').toUpperCase(), minimumFractionDigits: 2 }).format((inv?.amountCents ?? order.amountCents) / 100);
                                            const paid = inv?.paidAt ?? null;
                                            const tone: 'ok' | 'warn' | 'err' = paid || order.status === 'paid' || order.status === 'completed' ? 'ok' : order.status === 'failed' ? 'err' : 'warn';
                                            return (
                                                <tr key={order.id}>
                                                    <td>
                                                        {inv?.pdfUrl ? (
                                                            <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{label}</a>
                                                        ) : label}
                                                        {paid && <div className="uk-mono" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>paid {new Date(paid).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
                                                    </td>
                                                    <td><Badge tone={tone}>{paid ? 'paid' : order.status}</Badge></td>
                                                    <td className="uk-num" style={{ color: 'var(--ink)' }}>{amount}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </Panel>
                    </div>
                </div>
            </div>
        </UiKit>
    );
}
