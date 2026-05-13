import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CreditCard, AlertCircle, CheckCircle2, XCircle, Clock, FileText } from "lucide-react";

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

interface SubscriptionRecord {
    id: string;
    tenantId: string;
    planId: string;
    status: string;
    paymentProvider: string;
    startedAt: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}

interface InvoiceRecord {
    id: string;
    orderId: string;
    tenantId: string;
    number: string;
    amountCents: number;
    currency: string;
    pdfUrl: string | null;
    sentAt: string | null;
    paidAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface SubscriptionResponse {
    subscription: SubscriptionRecord | null;
}

interface InvoicesResponse {
    invoices: InvoiceRecord[];
}

const STATUS_CONFIG: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
    active: {
        label: "Active",
        icon: CheckCircle2,
        className: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
    },
    trial: {
        label: "Trial",
        icon: Clock,
        className: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40",
    },
    suspended: {
        label: "Suspended",
        icon: XCircle,
        className: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40",
    },
    canceled: {
        label: "Canceled",
        icon: XCircle,
        className: "text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800",
    },
};

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? {
        label: status,
        icon: Clock,
        className: "text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800",
    };
    const Icon = cfg.icon;
    return (
        <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}
        >
            <Icon className="h-3 w-3" />
            {cfg.label}
        </span>
    );
}

function formatCents(cents: number, currency: string): string {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
        minimumFractionDigits: 2,
    }).format(cents / 100);
}

export default async function PortalBillingPage() {
    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value;

    if (!token) {
        redirect("/portal/login");
    }

    let subscription: SubscriptionRecord | null = null;
    let invoices: InvoiceRecord[] = [];
    let fetchError = false;

    try {
        const [subRes, invRes] = await Promise.all([
            fetch(`${GATEWAY_URL}/portal/data/billing/subscription`, {
                headers: { cookie: `portal_session=${token}` },
                cache: "no-store",
            }),
            fetch(`${GATEWAY_URL}/portal/data/billing/invoices`, {
                headers: { cookie: `portal_session=${token}` },
                cache: "no-store",
            }),
        ]);

        if (subRes.status === 401 || invRes.status === 401) {
            redirect("/portal/login");
        }

        if (subRes.ok) {
            const data = (await subRes.json()) as SubscriptionResponse;
            subscription = data.subscription ?? null;
        } else {
            fetchError = true;
        }

        if (invRes.ok) {
            const data = (await invRes.json()) as InvoicesResponse;
            invoices = data.invoices ?? [];
        }
    } catch {
        fetchError = true;
    }

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Billing</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Subscription plan and invoice history
                </p>
            </div>

            {fetchError && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 mb-6">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Failed to load billing information. Please refresh the page.
                </div>
            )}

            {!fetchError && !subscription && invoices.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-16 px-4 text-center">
                    <CreditCard className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        No billing information available
                    </p>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                        Billing details will appear here once a subscription is active.
                    </p>
                </div>
            )}

            {/* Subscription plan card */}
            {subscription && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 mb-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                                Current Plan
                            </p>
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100 capitalize">
                                {subscription.planId}
                            </p>
                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 capitalize">
                                via {subscription.paymentProvider}
                            </p>
                        </div>
                        <StatusBadge status={subscription.status} />
                    </div>

                    {subscription.expiresAt && (
                        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                            <span className="font-medium text-slate-700 dark:text-slate-300">Next renewal: </span>
                            {new Date(subscription.expiresAt).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                            })}
                        </p>
                    )}
                </div>
            )}

            {/* Invoices table */}
            {invoices.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Invoices</h2>
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                    Invoice
                                </th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden sm:table-cell">
                                    Date
                                </th>
                                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                    Amount
                                </th>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">
                                    Status
                                </th>
                                <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">
                                    PDF
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {invoices.map((inv) => (
                                <tr
                                    key={inv.id}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                                                <FileText className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                                            </div>
                                            <span className="font-medium text-slate-900 dark:text-slate-100 font-mono text-xs">
                                                {inv.number}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400 tabular-nums hidden sm:table-cell">
                                        {new Date(inv.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                                        {formatCents(inv.amountCents, inv.currency)}
                                    </td>
                                    <td className="px-5 py-3 hidden md:table-cell">
                                        {inv.paidAt ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Paid
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
                                                <Clock className="h-3 w-3" />
                                                Pending
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-center hidden md:table-cell">
                                        {inv.pdfUrl ? (
                                            <a
                                                href={inv.pdfUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                                            >
                                                Download
                                            </a>
                                        ) : (
                                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
