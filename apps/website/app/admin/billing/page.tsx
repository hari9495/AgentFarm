"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CreditCard, Download, TrendingUp, Users, Zap } from "lucide-react";
import Link from "next/link";
import ButtonLink from "@/components/shared/ButtonLink";
import PremiumIcon from "@/components/shared/PremiumIcon";

type ApiOrder = {
    id: string;
    tenantId: string;
    planId: string;
    amountCents: number;
    currency: string;
    status: string;
    customerEmail: string;
    createdAt: string;
    invoice: { id: string; number: string; pdfUrl?: string | null } | null;
};

type ProvisionState = 'idle' | 'loading' | 'done' | 'error';

const plans = [
    {
        id: "starter",
        name: "Starter+",
        seats: "Up to 10 seats",
        price: "$99",
        unit: "/ worker / mo",
        features: ["10 AI workers", "Basic approvals", "Community support"],
        current: false,
        isEnterprise: false,
    },
    {
        id: "pro",
        name: "Pro+",
        seats: "Up to 50 seats",
        price: "$249",
        unit: "/ worker / mo",
        features: ["50 AI workers", "Policy engine", "Priority support", "Audit logs"],
        current: true,
        isEnterprise: false,
    },
    {
        id: "enterprise",
        name: "Enterprise",
        seats: "Custom",
        price: "Custom",
        unit: "contract",
        features: ["Unlimited workers", "SSO + SAML", "SLA guarantee", "Dedicated CSM"],
        current: false,
        isEnterprise: true,
    },
];

const fallbackInvoices = [
    { id: "INV-2026-041", amount: "$6,920", status: "Paid", date: "Apr 01, 2026" },
    { id: "INV-2026-032", amount: "$6,340", status: "Paid", date: "Mar 01, 2026" },
    { id: "INV-2026-022", amount: "$5,980", status: "Paid", date: "Feb 01, 2026" },
];

const seatPct = Math.round((46 / 50) * 100);

function formatOrderAmount(amountCents: number, currency: string): string {
    const amount = amountCents / 100;
    if (currency.toUpperCase() === "INR") {
        return `₹${amount.toLocaleString("en-IN")}`;
    }
    return `$${amount.toLocaleString("en-US")}`;
}

function formatOrderDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
        });
    } catch {
        return iso;
    }
}

export default function AdminBillingPage() {
    const [orders, setOrders] = useState<ApiOrder[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [provisionStates, setProvisionStates] = useState<Record<string, ProvisionState>>({});
    const [provisionErrors, setProvisionErrors] = useState<Record<string, string>>({});

    async function provisionOrder(order: ApiOrder) {
        setProvisionStates((s) => ({ ...s, [order.id]: 'loading' }));
        setProvisionErrors((e) => { const next = { ...e }; delete next[order.id]; return next; });
        try {
            const res = await fetch('/api/admin/provision', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: order.tenantId, orderId: order.id }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Request failed' }));
                throw new Error((err as { error?: string }).error ?? 'Request failed');
            }
            setProvisionStates((s) => ({ ...s, [order.id]: 'done' }));
        } catch (e) {
            setProvisionStates((s) => ({ ...s, [order.id]: 'error' }));
            setProvisionErrors((prev) => ({ ...prev, [order.id]: (e as Error).message ?? 'Unknown error' }));
        }
    }

    useEffect(() => {
        fetch("/api/billing/orders", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((data: { orders?: ApiOrder[] }) => {
                if (Array.isArray(data.orders) && data.orders.length > 0) {
                    setOrders(data.orders);
                }
            })
            .catch(() => {
                // Fall back to hardcoded invoices — no-op, orders stays empty
            })
            .finally(() => setOrdersLoading(false));
    }, []);
    return (
        <div className="site-shell min-h-screen">

            {/* Page header */}
            <section className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-700">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-200 mb-4">
                        <PremiumIcon icon={CreditCard} tone="emerald" containerClassName="w-5 h-5 rounded-md bg-emerald-300/15 text-emerald-200 border-emerald-200/30" iconClassName="w-3 h-3" />
                        Admin Billing
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight max-w-xl">
                        Plan, seats, and invoice management
                    </h1>
                    <p className="mt-2 text-emerald-200 max-w-lg">
                        Monitor spend, right-size worker seats, and keep procurement and finance aligned.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <ButtonLink href="/book-demo" size="sm" className="!bg-white !text-emerald-700 hover:!brightness-95">
                            Talk to Sales
                        </ButtonLink>
                        <ButtonLink href="/admin" variant="outline" size="sm" className="!bg-white/10 !text-white !border-white/30 hover:!bg-white/20">
                            Back to Admin
                        </ButtonLink>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

                {/* Spend KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <PremiumIcon icon={TrendingUp} tone="emerald" containerClassName="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" iconClassName="w-5 h-5" />
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 rounded-full px-2.5 py-1">
                                <PremiumIcon icon={ArrowUpRight} tone="rose" containerClassName="w-5 h-5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3 h-3" />
                                +9.1%
                            </span>
                        </div>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">$6,920</p>
                        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">Monthly Spend</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">vs last month</p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <PremiumIcon icon={Users} tone="sky" containerClassName="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400" iconClassName="w-5 h-5" />
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 rounded-full px-2.5 py-1">
                                {seatPct}% used
                            </span>
                        </div>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tabular-nums">46 / 50</p>
                        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">Worker Seats</p>
                        <div className="mt-2 w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                            <div className="h-1.5 rounded-full bg-amber-500" style={{ width: `${seatPct}%` }} />
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">4 seats remaining</p>
                    </div>

                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <PremiumIcon icon={Zap} tone="emerald" containerClassName="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" iconClassName="w-5 h-5" />
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 rounded-full px-2.5 py-1">
                                Active
                            </span>
                        </div>
                        <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Pro+</p>
                        <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">Current Plan</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Renews May 1, 2026</p>
                    </div>
                </div>

                {/* Plan comparison + Seat controls */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Plan options */}
                    <div className="xl:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Plan Options</h2>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Compare and switch plans at any time</p>
                        </div>
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {plans.map((plan) => (
                                <div key={plan.name} className={`rounded-xl border p-4 flex flex-col gap-3 transition-all ${plan.current ? "border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-200 dark:ring-emerald-900" : "border-slate-200 dark:border-slate-700"}`}>
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-slate-100">{plan.name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{plan.seats}</p>
                                        </div>
                                        {plan.current && (
                                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 rounded-full px-2 py-0.5 whitespace-nowrap">
                                                Current
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{plan.price}</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">{plan.unit}</span>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {plan.features.map((f) => (
                                            <li key={f} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                {f}
                                            </li>
                                        ))}
                                    </ul>
                                    {!plan.current && (
                                        plan.isEnterprise ? (
                                            <ButtonLink href="/book-demo" size="sm" className="mt-auto w-full justify-center text-xs">
                                                Talk to Sales
                                            </ButtonLink>
                                        ) : (
                                            <Link
                                                href={`/checkout/billing?planId=${plan.id}&country=IN`}
                                                className="mt-auto text-xs font-bold rounded-lg border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 py-1.5 transition-colors text-center block"
                                            >
                                                Upgrade Plan
                                            </Link>
                                        )
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Seat controls */}
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Seat Controls</h2>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Manage capacity settings</p>
                        </div>
                        <div className="p-4 space-y-3">
                            {[
                                { label: "Seats remaining", value: "4 of 50", icon: Users, warn: false },
                                { label: "Auto-scale on overload", value: "Disabled", icon: Zap, warn: true },
                                { label: "Cost anomaly alert", value: "+20% threshold", icon: TrendingUp, warn: false },
                            ].map(({ label, value, icon: Icon, warn }) => (
                                <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3 gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <PremiumIcon icon={Icon} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0" iconClassName="w-4 h-4" />
                                        <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{label}</p>
                                    </div>
                                    <span className={`text-xs font-bold shrink-0 ${warn ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-300"}`}>{value}</span>
                                </div>
                            ))}
                            <div className="pt-1">
                                <ButtonLink href="/book-demo" size="sm" className="w-full justify-center">Upgrade Seats</ButtonLink>
                            </div>
                        </div>
                    </div>
                </div>

                {/* A1: 6-month spend sparkline */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <PremiumIcon icon={TrendingUp} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" />
                            6-Month Spend Trend
                        </h2>
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">+69% over 6 months</span>
                    </div>
                    <div className="flex items-end gap-2 h-16">
                        {[
                            { month: "Nov", amount: 4200 },
                            { month: "Dec", amount: 5100 },
                            { month: "Jan", amount: 5980 },
                            { month: "Feb", amount: 6340 },
                            { month: "Mar", amount: 6920 },
                            { month: "Apr", amount: 7100 },
                        ].map(({ month, amount }) => {
                            const pct = Math.round((amount / 7100) * 100);
                            return (
                                <div key={month} className="flex-1 flex flex-col items-center gap-1.5">
                                    <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">${(amount / 1000).toFixed(1)}k</span>
                                    <div className="w-full relative flex items-end justify-center" style={{ height: "36px" }}>
                                        <div
                                            className="w-full rounded-t-sm bg-emerald-400 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors"
                                            style={{ height: `${pct}%` }}
                                        />
                                    </div>
                                    <span className="text-[9px] text-slate-400">{month}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Invoice / Orders table */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Invoice History</h2>
                        {!ordersLoading && (
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                                {orders.length > 0 ? `${orders.length} orders` : `${fallbackInvoices.length} invoices`}
                            </span>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        {ordersLoading ? (
                            <div className="px-5 py-6 animate-pulse space-y-3">
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                                ))}
                            </div>
                        ) : orders.length > 0 ? (
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Order ID</th>
                                        <th className="text-left px-4 py-3">Date</th>
                                        <th className="text-left px-4 py-3">Amount</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Invoice</th>
                                        <th className="text-left px-4 py-3">Provision</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {orders.map((order) => (
                                        <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">
                                                {order.invoice?.number ?? order.id.slice(0, 12)}
                                            </td>
                                            <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{formatOrderDate(order.createdAt)}</td>
                                            <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">
                                                {formatOrderAmount(order.amountCents, order.currency)}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 rounded-full px-2.5 py-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {order.invoice?.pdfUrl ? (
                                                    <a
                                                        href={order.invoice.pdfUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200 transition-colors"
                                                    >
                                                        <PremiumIcon icon={Download} tone="sky" containerClassName="w-5 h-5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3 h-3" />
                                                        Download
                                                    </a>
                                                ) : (
                                                    <span className="text-xs text-slate-400 dark:text-slate-500">Pending</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5">
                                                {order.status === 'paid' ? (
                                                    provisionStates[order.id] === 'done' ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 rounded-full px-2.5 py-1">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                            Started
                                                        </span>
                                                    ) : provisionStates[order.id] === 'error' ? (
                                                        <span title={provisionErrors[order.id]} className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 rounded-full px-2.5 py-1 cursor-help">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                            Error
                                                        </span>
                                                    ) : (
                                                        <button
                                                            disabled={provisionStates[order.id] === 'loading'}
                                                            onClick={() => provisionOrder(order)}
                                                            className="text-xs font-bold rounded-lg border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {provisionStates[order.id] === 'loading' ? 'Starting…' : 'Provision'}
                                                        </button>
                                                    )
                                                ) : (
                                                    <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full min-w-[520px] text-sm">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        <th className="text-left px-5 py-3">Invoice</th>
                                        <th className="text-left px-4 py-3">Date</th>
                                        <th className="text-left px-4 py-3">Amount</th>
                                        <th className="text-left px-4 py-3">Status</th>
                                        <th className="text-left px-4 py-3">Receipt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                                    {fallbackInvoices.map((inv) => (
                                        <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-slate-100 font-mono text-xs">{inv.id}</td>
                                            <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{inv.date}</td>
                                            <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-slate-100">{inv.amount}</td>
                                            <td className="px-4 py-3.5">
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 rounded-full px-2.5 py-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200 transition-colors">
                                                    <PremiumIcon icon={Download} tone="sky" containerClassName="w-5 h-5 rounded-md bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3 h-3" />
                                                    Download
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
}
