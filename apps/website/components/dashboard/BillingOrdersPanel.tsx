"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
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

type ProvisionState = "idle" | "loading" | "done" | "error";
type LoadState = "loading" | "ready" | "error";

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

export default function BillingOrdersPanel({ canProvision }: { canProvision: boolean }) {
    const [orders, setOrders] = useState<ApiOrder[]>([]);
    const [loadState, setLoadState] = useState<LoadState>("loading");
    const [provisionStates, setProvisionStates] = useState<Record<string, ProvisionState>>({});
    const [provisionErrors, setProvisionErrors] = useState<Record<string, string>>({});

    async function provisionOrder(order: ApiOrder) {
        setProvisionStates((s) => ({ ...s, [order.id]: "loading" }));
        setProvisionErrors((e) => { const next = { ...e }; delete next[order.id]; return next; });
        try {
            const res = await fetch("/api/admin/provision", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tenantId: order.tenantId, orderId: order.id }),
            });
            if (!res.ok) {
                const err = await (res.json() as Promise<any>).catch(() => ({ error: "Request failed" }));
                throw new Error((err as { error?: string }).error ?? "Request failed");
            }
            setProvisionStates((s) => ({ ...s, [order.id]: "done" }));
        } catch (e) {
            setProvisionStates((s) => ({ ...s, [order.id]: "error" }));
            setProvisionErrors((prev) => ({ ...prev, [order.id]: (e as Error).message ?? "Unknown error" }));
        }
    }

    useEffect(() => {
        fetch("/api/billing/orders", { credentials: "include" })
            .then((r) => (r.ok ? (r.json() as any) : Promise.reject(r.status)))
            .then((data: any) => {
                setOrders(Array.isArray(data.orders) ? data.orders : []);
                setLoadState("ready");
            })
            .catch(() => {
                setLoadState("error");
            });
    }, []);

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Invoice History</h2>
                {loadState === "ready" && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                        {orders.length} {orders.length === 1 ? "order" : "orders"}
                    </span>
                )}
            </div>
            <div className="overflow-x-auto">
                {loadState === "loading" ? (
                    <div className="px-5 py-6 animate-pulse space-y-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full" />
                        ))}
                    </div>
                ) : loadState === "error" ? (
                    <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500">
                        We couldn&apos;t load your invoice history right now. Try refreshing, or contact support if this persists.
                    </p>
                ) : orders.length > 0 ? (
                    <table className="w-full min-w-[520px] text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                <th className="text-left px-5 py-3">Order ID</th>
                                <th className="text-left px-4 py-3">Date</th>
                                <th className="text-left px-4 py-3">Amount</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Invoice</th>
                                {canProvision && <th className="text-left px-4 py-3">Provision</th>}
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
                                    {canProvision && (
                                        <td className="px-4 py-3.5">
                                            {order.status === "paid" ? (
                                                provisionStates[order.id] === "done" ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 rounded-full px-2.5 py-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                        Started
                                                    </span>
                                                ) : provisionStates[order.id] === "error" ? (
                                                    <span title={provisionErrors[order.id]} className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40 rounded-full px-2.5 py-1 cursor-help">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                        Error
                                                    </span>
                                                ) : (
                                                    <button
                                                        disabled={provisionStates[order.id] === "loading"}
                                                        onClick={() => provisionOrder(order)}
                                                        className="text-xs font-bold rounded-lg border border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {provisionStates[order.id] === "loading" ? "Starting…" : "Provision"}
                                                    </button>
                                                )
                                            ) : (
                                                <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500">
                        No invoices yet. Orders and receipts will appear here once your first payment is processed.
                    </p>
                )}
            </div>
        </div>
    );
}
