import type { Metadata } from "next";
import Link from "next/link";
import {
    ArrowDownRight,
    ArrowUpRight,
    ChevronRight,
    CreditCard,
    TrendingUp,
    Users,
    Zap,
} from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import PremiumIcon from "@/components/shared/PremiumIcon";
import BillingOrdersPanel from "@/components/dashboard/BillingOrdersPanel";
import { getPortalUser, portalFetch } from "@/lib/portal-server";

export const metadata: Metadata = {
    title: "Billing & Plan - AgentFarms Dashboard",
    description: "View your plan, worker seats, spend trend, and invoice history.",
};

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

type GatewayPlan = {
    id: string;
    name: string;
    priceUsd: number;
    priceInr: number;
    agentSlots: number;
    features: string;
};

type PortalSubscription = {
    status?: string;
    expiresAt?: string;
    planId?: string;
};

type PortalOrder = {
    id: string;
    planId: string;
    status: string;
    createdAt: string;
};

type MeteringPeriodSummary = {
    totalChargeUsd: number;
};

async function fetchPlans(): Promise<GatewayPlan[]> {
    try {
        const res = await fetch(`${GATEWAY_URL}/v1/billing/plans`, { cache: "no-store" });
        if (!res.ok) return [];
        const data = (await res.json()) as { plans?: GatewayPlan[] };
        return data.plans ?? [];
    } catch {
        return [];
    }
}

function parsePlanFeatures(raw: string): string[] {
    try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
        // not JSON — treat as a delimited list
    }
    return raw.split(",").map((f) => f.trim()).filter(Boolean);
}

function formatUsd(amount: number): string {
    return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function monthRange(monthsAgo: number): { from: Date; to: Date; label: string } {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0, 23, 59, 59);
    return { from, to, label: from.toLocaleDateString("en-US", { month: "short" }) };
}

export default async function BillingPage() {
    const user = await getPortalUser();

    const canManagePlan = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin";

    const sixMonths = Array.from({ length: 6 }, (_, i) => monthRange(5 - i));

    const [plansData, subscriptionData, ordersData, currentPeriod, agentsData, ...trendPeriods] = await Promise.all([
        fetchPlans().then((p) => ({ plans: p })),
        portalFetch<{ subscription: PortalSubscription | null }>("/portal/data/billing/subscription"),
        portalFetch<{ orders: PortalOrder[] }>("/portal/data/billing/orders"),
        portalFetch<MeteringPeriodSummary>("/portal/data/usage"),
        portalFetch<{ total?: number }>("/portal/data/agents?limit=1"),
        ...sixMonths.map(() =>
            // Trend data not yet supported via portal API — fill with null
            Promise.resolve(null as MeteringPeriodSummary | null),
        ),
    ]);

    const plans = plansData?.plans ?? [];
    const subscription = subscriptionData?.subscription ?? null;
    const orders = ordersData?.orders ?? [];

    // The subscription is the source of truth for the current plan (free plans
    // never produce a paid order); fall back to the latest paid order.
    const latestPaidOrder = [...orders]
        .filter((o) => o.status === "paid")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const currentPlanId =
        (subscription?.status === "active" ? subscription.planId : null) ?? latestPaidOrder?.planId ?? null;
    const currentPlan = currentPlanId ? plans.find((p) => p.id === currentPlanId) ?? null : null;

    const seatsUsed = agentsData?.total ?? 0;
    const seatLimit = currentPlan?.agentSlots ?? null;
    const seatPct = seatLimit ? Math.min(100, Math.round((seatsUsed / seatLimit) * 100)) : null;
    const seatsRemaining = seatLimit !== null ? Math.max(0, seatLimit - seatsUsed) : null;

    const monthlySpend = (currentPeriod as unknown as { totalChargeUsd?: number } | null)?.totalChargeUsd ?? null;

    const trend = sixMonths.map(({ label }, i) => ({
        month: label,
        amount: (trendPeriods[i] as MeteringPeriodSummary | null)?.totalChargeUsd ?? null,
    }));
    const knownAmounts = trend.map((t) => t.amount).filter((a): a is number => a !== null);
    const trendMax = Math.max(1, ...knownAmounts);
    const trendChangePct =
        knownAmounts.length >= 2 && knownAmounts[0]! > 0
            ? Math.round(((knownAmounts[knownAmounts.length - 1]! - knownAmounts[0]!) / knownAmounts[0]!) * 100)
            : null;

    const renewalLabel = subscription?.expiresAt
        ? new Date(subscription.expiresAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
          })
        : null;

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Hero header */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(16,185,129,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(14,165,233,0.12)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[var(--ok)]/10 border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--ok)]">
                                <CreditCard className="w-3.5 h-3.5" />
                                Billing
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">Plan & Invoices</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">Billing & plan</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">
                                    See your current plan, worker seat usage, spend trend, and invoice history.
                                </p>
                            </div>
                            {canManagePlan && (
                                <div className="flex flex-wrap gap-3">
                                    <ButtonLink href="/book-demo" size="sm" className="!bg-[var(--card)] !text-[color:var(--ink)] hover:!brightness-95">
                                        Talk to Sales
                                    </ButtonLink>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Spend / seats / plan KPI cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                        <div className="flex items-center justify-between mb-4">
                            <PremiumIcon icon={TrendingUp} tone="emerald" containerClassName="w-10 h-10 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/50 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-5 h-5" />
                            {trendChangePct !== null && (
                                <span className={`inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 ${trendChangePct >= 0 ? "text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30" : "text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30"}`}>
                                    <PremiumIcon icon={trendChangePct >= 0 ? ArrowUpRight : ArrowDownRight} tone={trendChangePct >= 0 ? "rose" : "emerald"} containerClassName={`w-5 h-5 rounded-[2px] ${trendChangePct >= 0 ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" : "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]"}`} iconClassName="w-3 h-3" />
                                    {trendChangePct >= 0 ? "+" : ""}{trendChangePct}%
                                </span>
                            )}
                        </div>
                        <p className="text-2xl font-extrabold text-[color:var(--ink)] dark:text-[color:var(--ink)] tabular-nums">
                            {monthlySpend !== null ? formatUsd(monthlySpend) : "—"}
                        </p>
                        <p className="mt-1 text-sm font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Spend (last 30 days)</p>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                            {trendChangePct !== null ? "vs 6 months ago" : "Live metering data"}
                        </p>
                    </div>

                    <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                        <div className="flex items-center justify-between mb-4">
                            <PremiumIcon icon={Users} tone="sky" containerClassName="w-10 h-10 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/50 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-5 h-5" />
                            {seatPct !== null && (
                                <span className="text-xs font-bold text-[color:var(--warn)] dark:text-[color:var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/30 rounded-full px-2.5 py-1">
                                    {seatPct}% used
                                </span>
                            )}
                        </div>
                        <p className="text-2xl font-extrabold text-[color:var(--ink)] dark:text-[color:var(--ink)] tabular-nums">
                            {seatLimit !== null ? `${seatsUsed} / ${seatLimit}` : seatsUsed}
                        </p>
                        <p className="mt-1 text-sm font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Worker Seats</p>
                        {seatLimit !== null ? (
                            <>
                                <div className="mt-2 w-full h-1.5 rounded-full bg-[var(--line)] dark:bg-[var(--card)]">
                                    <div className="h-1.5 rounded-full bg-[var(--warn)]" style={{ width: `${seatPct}%` }} />
                                </div>
                                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">{seatsRemaining} seats remaining</p>
                            </>
                        ) : (
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">No active plan on file</p>
                        )}
                    </div>

                    <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/50 bg-gradient-to-br from-[color-mix(in_srgb,var(--ok)_8%,transparent)] to-[color-mix(in_srgb,var(--accent)_8%,transparent)] dark:from-[color-mix(in_srgb,var(--ok)_14%,transparent)]/30 dark:to-[color-mix(in_srgb,var(--accent)_14%,transparent)]/20 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <PremiumIcon icon={Zap} tone="emerald" containerClassName="w-10 h-10 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/50 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-5 h-5" />
                            {subscription && subscription.status && subscription.status !== "none" && (
                                <span className="text-xs font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 rounded-full px-2.5 py-1 capitalize">
                                    {subscription.status}
                                </span>
                            )}
                        </div>
                        <p className="text-2xl font-extrabold text-[color:var(--ink)] dark:text-[color:var(--ink)]">
                            {currentPlan?.name ?? "No active plan"}
                        </p>
                        <p className="mt-1 text-sm font-medium text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Current Plan</p>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">
                            {renewalLabel ? `Renews ${renewalLabel}` : "No renewal date on file"}
                        </p>
                    </div>
                </div>

                {/* Plan comparison + seat controls */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-2 rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
                        <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
                            <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Plan Options</h2>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">Compare plans available on your account</p>
                        </div>
                        {plans.length > 0 ? (
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {plans.map((plan) => {
                                    const isCurrent = currentPlan?.id === plan.id;
                                    const features = parsePlanFeatures(plan.features);
                                    return (
                                        <div key={plan.id} className={`rounded-[3px] border p-4 flex flex-col gap-3 transition-all ${isCurrent ? "border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 ring-2 ring-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:ring-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]" : "border-[color:var(--line)] dark:border-[color:var(--line)]"}`}>
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{plan.name}</p>
                                                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">{plan.agentSlots} agent slots</p>
                                                </div>
                                                {isCurrent && (
                                                    <span className="text-xs font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/50 rounded-full px-2 py-0.5 whitespace-nowrap">
                                                        Current
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <span className="text-2xl font-extrabold text-[color:var(--ink)] dark:text-[color:var(--ink)]">${plan.priceUsd}</span>
                                                <span className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] ml-1">/ worker / mo</span>
                                            </div>
                                            {features.length > 0 && (
                                                <ul className="space-y-1.5">
                                                    {features.map((f) => (
                                                        <li key={f} className="flex items-center gap-1.5 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] shrink-0" />
                                                            {f}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                            {!isCurrent && canManagePlan && (
                                                <Link
                                                    href={`/checkout/billing?planId=${plan.id}&country=IN`}
                                                    className="mt-auto text-xs font-bold rounded-[3px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] text-[color:var(--ok)] dark:text-[color:var(--ok)] hover:bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 py-1.5 transition-colors text-center block"
                                                >
                                                    {currentPlan ? "Switch Plan" : "Choose Plan"}
                                                </Link>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="px-5 py-6 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                Plan options are unavailable right now. Try refreshing, or contact support if this persists.
                            </p>
                        )}
                        {!canManagePlan && (
                            <p className="px-5 pb-4 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                Ask an org admin to change plans or seat counts.
                            </p>
                        )}
                    </div>

                    <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
                        <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
                            <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Seat Usage</h2>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-0.5">Current capacity on your plan</p>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                {
                                    label: "Seats remaining",
                                    value: seatLimit !== null ? `${seatsRemaining ?? 0} of ${seatLimit}` : "No plan on file",
                                    icon: Users,
                                },
                                {
                                    label: "Active workers",
                                    value: String(seatsUsed),
                                    icon: Zap,
                                },
                                {
                                    label: "Spend (last 30 days)",
                                    value: monthlySpend !== null ? formatUsd(monthlySpend) : "—",
                                    icon: TrendingUp,
                                },
                            ].map(({ label, value, icon: Icon }) => (
                                <div key={label} className="flex items-center justify-between rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 px-4 py-3 gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <PremiumIcon icon={Icon} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] shrink-0" iconClassName="w-4 h-4" />
                                        <p className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] truncate">{label}</p>
                                    </div>
                                    <span className="text-xs font-bold shrink-0 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{value}</span>
                                </div>
                            ))}
                            {canManagePlan && (
                                <div className="pt-1">
                                    <ButtonLink href="/book-demo" size="sm" className="w-full justify-center">Upgrade Seats</ButtonLink>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 6-month spend trend */}
                <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-2">
                            <PremiumIcon icon={TrendingUp} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" />
                            6-Month Spend Trend
                        </h2>
                        {trendChangePct !== null && (
                            <span className={`text-xs font-semibold ${trendChangePct >= 0 ? "text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "text-[color:var(--danger)] dark:text-[color:var(--danger)]"}`}>
                                {trendChangePct >= 0 ? "+" : ""}{trendChangePct}% over 6 months
                            </span>
                        )}
                    </div>
                    {knownAmounts.length > 0 ? (
                        <div className="flex items-end gap-2 h-16">
                            {trend.map(({ month, amount }) => {
                                const pct = amount !== null ? Math.round((amount / trendMax) * 100) : 0;
                                return (
                                    <div key={month} className="flex-1 flex flex-col items-center gap-1.5">
                                        <span className="text-[9px] font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                            {amount !== null ? `$${(amount / 1000).toFixed(1)}k` : "—"}
                                        </span>
                                        <div className="w-full relative flex items-end justify-center" style={{ height: "36px" }}>
                                            <div
                                                className={`w-full rounded-t-sm transition-colors ${amount !== null ? "bg-[var(--ok)] dark:bg-[var(--ok)] hover:bg-[var(--ok)] dark:hover:bg-[var(--ok)]" : "bg-[var(--line)] dark:bg-[var(--card)]"}`}
                                                style={{ height: `${Math.max(pct, amount !== null ? 4 : 0)}%` }}
                                            />
                                        </div>
                                        <span className="text-[9px] text-[color:var(--ink-muted)]">{month}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            Spend history is unavailable right now. This chart populates from live task-metering records once usage data is reachable.
                        </p>
                    )}
                </div>

                {/* Invoice history */}
                <BillingOrdersPanel canProvision={canManagePlan} />

            </div>
        </div>
    );
}
