"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, LoaderCircle, RefreshCw, ShieldAlert, X } from "lucide-react";

type Risk = "low" | "medium" | "high";

type Approval = {
    id: string;
    title: string;
    agentSlug: string;
    agent: string;
    requestedBy: string;
    channel: string;
    reason: string;
    risk: Risk;
    status: "pending" | "approved" | "rejected";
    createdAt: number;
    decidedAt: number | null;
    decisionReason: string | null;
    decisionLatencySeconds: number | null;
    escalationTimeoutSeconds: number;
    escalatedAt: number | null;
};

type Props = {
    scope: "org" | "agent";
    agentSlug?: string;
    headerTitle: string;
    headerSubtitle: string;
    backHref?: string;
};

const riskClass: Record<Risk, string> = {
    low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    high: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const fromNow = (timestamp: number): string => {
    const delta = Date.now() - timestamp;
    const mins = Math.max(1, Math.floor(delta / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export default function ApprovalsQueue({ scope, agentSlug, headerTitle, headerSubtitle, backHref }: Props) {
    const [items, setItems] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);
    const [reasonById, setReasonById] = useState<Record<string, string>>({});

    const pendingCount = useMemo(() => items.length, [items.length]);

    const loadApprovals = useCallback(async () => {
        setLoading(true);
        setError(null);

        const query = new URLSearchParams({ status: "pending" });
        if (scope === "agent" && agentSlug) {
            query.set("agentSlug", agentSlug);
        }

        try {
            const response = await fetch(`/api/approvals?${query.toString()}`, {
                method: "GET",
                credentials: "include",
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Failed to fetch approval queue.");
            }

            const body = (await response.json()) as { approvals: Approval[] };
            setItems(body.approvals);
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Unable to load approvals right now.";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [agentSlug, scope]);

    useEffect(() => {
        void loadApprovals();
    }, [loadApprovals]);

    const mutateApproval = async (id: string, action: "approve" | "reject") => {
        setActiveId(id);
        setError(null);
        const reason = reasonById[id]?.trim();

        if (action === "reject" && (!reason || reason.length < 8)) {
            setError("Rejection reason must be at least 8 characters.");
            setActiveId(null);
            return;
        }

        try {
            const response = await fetch(`/api/approvals/${id}`, {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ action, reason }),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to update approval.");
            }

            const body = (await response.json()) as { approval?: Approval };
            setItems((current) => current.filter((item) => item.id !== id));
            const latency = body.approval?.decisionLatencySeconds;
            setFlash(
                action === "approve"
                    ? `Approval request approved${typeof latency === "number" ? ` in ${latency}s` : ""}.`
                    : `Approval request rejected${typeof latency === "number" ? ` in ${latency}s` : ""}.`,
            );
            setReasonById((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
            setTimeout(() => setFlash(null), 2200);
        } catch (mutationError) {
            const message = mutationError instanceof Error ? mutationError.message : "Could not update approval request.";
            setError(message);
        } finally {
            setActiveId(null);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{headerTitle}</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{headerSubtitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void loadApprovals()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                        </button>
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 px-2 py-1 text-xs font-bold">
                            {pendingCount} pending
                        </span>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-3">
                {flash ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {flash}
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Unable to load approval queue</p>
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
                        <button
                            onClick={() => void loadApprovals()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((key) => (
                            <div
                                key={key}
                                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 animate-pulse"
                            >
                                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                                <div className="mt-3 h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                                <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Inbox clear</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">No pending approval requests right now.</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{item.id}</span>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskClass[item.risk]}`}>
                                            {item.risk}
                                        </span>
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            Pending {fromNow(item.createdAt)}
                                        </span>
                                        {Date.now() - item.createdAt > item.escalationTimeoutSeconds * 1000 ? (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                                SLA overdue
                                            </span>
                                        ) : null}
                                        {item.escalatedAt ? (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                                Escalated
                                            </span>
                                        ) : null}
                                    </div>
                                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.title}</h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.reason}</p>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                        <span>
                                            <strong className="text-slate-700 dark:text-slate-300">Agent:</strong> {item.agent}
                                        </span>
                                        <span>
                                            <strong className="text-slate-700 dark:text-slate-300">Channel:</strong> {item.channel}
                                        </span>
                                        <span>
                                            <strong className="text-slate-700 dark:text-slate-300">Requested by:</strong> {item.requestedBy}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Clock3 className="w-3.5 h-3.5" />
                                            {fromNow(item.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <input
                                        value={reasonById[item.id] ?? ""}
                                        onChange={(event) =>
                                            setReasonById((current) => ({
                                                ...current,
                                                [item.id]: event.target.value,
                                            }))
                                        }
                                        placeholder="Decision reason (required for reject)"
                                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                                    />
                                    <button
                                        disabled={activeId === item.id}
                                        onClick={() => void mutateApproval(item.id, "approve")}
                                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                        {activeId === item.id ? (
                                            <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Check className="w-3.5 h-3.5" />
                                        )}
                                        {activeId === item.id ? "Processing..." : "Approve"}
                                    </button>
                                    <button
                                        disabled={activeId === item.id}
                                        onClick={() => void mutateApproval(item.id, "reject")}
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
                                    >
                                        {activeId === item.id ? (
                                            <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <X className="w-3.5 h-3.5" />
                                        )}
                                        {activeId === item.id ? "Processing..." : "Reject"}
                                    </button>
                                    <Link
                                        href="/admin/audit"
                                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                    >
                                        <ShieldAlert className="w-3.5 h-3.5" /> Audit trail
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {backHref ? (
                    <Link
                        href={backHref}
                        className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                        Back to agent details
                    </Link>
                ) : null}
            </div>
        </div>
    );
}
