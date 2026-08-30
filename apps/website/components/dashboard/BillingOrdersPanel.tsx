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
        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Invoice History</h2>
                {loadState === "ready" && (
                    <span className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        {orders.length} {orders.length === 1 ? "order" : "orders"}
                    </span>
                )}
            </div>
            <div className="overflow-x-auto">
                {loadState === "loading" ? (
                    <div className="px-5 py-6 animate-pulse space-y-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="h-4 bg-[var(--line)] dark:bg-[var(--card)] rounded w-full" />
                        ))}
                    </div>
                ) : loadState === "error" ? (
                    <p className="px-5 py-6 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        We couldn&apos;t load your invoice history right now. Try refreshing, or contact support if this persists.
                    </p>
                ) : orders.length > 0 ? (
                    <table className="w-full min-w-[520px] text-sm">
                        <thead>
                            <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                <th className="text-left px-5 py-3">Order ID</th>
                                <th className="text-left px-4 py-3">Date</th>
                                <th className="text-left px-4 py-3">Amount</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Invoice</th>
                                {canProvision && <th className="text-left px-4 py-3">Provision</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                            {orders.map((order) => (
                                <tr key={order.id} className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors">
                                    <td className="px-5 py-3.5 font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)] font-mono text-xs">
                                        {order.invoice?.number ?? order.id.slice(0, 12)}
                                    </td>
                                    <td className="px-4 py-3.5 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{formatOrderDate(order.createdAt)}</td>
                                    <td className="px-4 py-3.5 font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">
                                        {formatOrderAmount(order.amountCents, order.currency)}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 rounded-full px-2.5 py-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
                                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        {order.invoice?.pdfUrl ? (
                                            <a
                                                href={order.invoice.pdfUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:text-[color:var(--accent)] dark:hover:text-[color:var(--accent)] transition-colors"
                                            >
                                                <PremiumIcon icon={Download} tone="sky" containerClassName="w-5 h-5 rounded-[2px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3 h-3" />
                                                Download
                                            </a>
                                        ) : (
                                            <span className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Pending</span>
                                        )}
                                    </td>
                                    {canProvision && (
                                        <td className="px-4 py-3.5">
                                            {order.status === "paid" ? (
                                                provisionStates[order.id] === "done" ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 rounded-full px-2.5 py-1">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)]" />
                                                        Started
                                                    </span>
                                                ) : provisionStates[order.id] === "error" ? (
                                                    <span title={provisionErrors[order.id]} className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 rounded-full px-2.5 py-1 cursor-help">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" />
                                                        Error
                                                    </span>
                                                ) : (
                                                    <button
                                                        disabled={provisionStates[order.id] === "loading"}
                                                        onClick={() => provisionOrder(order)}
                                                        className="text-xs font-bold rounded-[3px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] text-[color:var(--ok)] dark:text-[color:var(--ok)] hover:bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 px-3 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {provisionStates[order.id] === "loading" ? "Starting…" : "Provision"}
                                                    </button>
                                                )
                                            ) : (
                                                <span className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">—</span>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="px-5 py-6 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        No invoices yet. Orders and receipts will appear here once your first payment is processed.
                    </p>
                )}
            </div>
        </div>
    );
}
