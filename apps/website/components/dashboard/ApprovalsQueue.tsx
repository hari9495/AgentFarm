"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, LoaderCircle, RefreshCw, ShieldAlert, X } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

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
    userRole?: string;
};

const riskClass: Record<Risk, string> = {
    low: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]",
    medium: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    high: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
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

export default function ApprovalsQueue({ scope, agentSlug, headerTitle, headerSubtitle, backHref, userRole = "member" }: Props) {
    const canAudit = userRole === "admin" || userRole === "superadmin";
    const [items, setItems] = useState<Approval[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);
    const [reasonById, setReasonById] = useState<Record<string, string>>({});
    const [actionErrorById, setActionErrorById] = useState<Record<string, string>>({});

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
        setActionErrorById((current) => {
            const next = { ...current };
            delete next[id];
            return next;
        });
        const reason = reasonById[id]?.trim();

        if (action === "reject" && (!reason || reason.length < 8)) {
            setActionErrorById((current) => ({
                ...current,
                [id]: "Rejection reason must be at least 8 characters.",
            }));
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
            setActionErrorById((current) => ({ ...current, [id]: message }));
        } finally {
            setActiveId(null);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="bg-[var(--card)] dark:bg-[var(--card)] border-b border-[color:var(--line)] dark:border-[color:var(--line)] px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{headerTitle}</h1>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{headerSubtitle}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void loadApprovals()}
                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                        >
                            <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3.5 h-3.5" /> Refresh
                        </button>
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)] px-2 py-1 text-xs font-bold">
                            {pendingCount} pending
                        </span>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-3">
                {flash ? (
                    <div className="rounded-[3px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] px-4 py-3 text-xs font-medium text-[color:var(--ok)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/50 dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]">
                        {flash}
                    </div>
                ) : null}

                {error ? (
                    <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-5 dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/50 dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30">
                        <p className="text-sm font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)]">Unable to load approval queue</p>
                        <p className="mt-1 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</p>
                        <button
                            onClick={() => void loadApprovals()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30"
                        >
                            <PremiumIcon icon={RefreshCw} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map((key) => (
                            <div
                                key={key}
                                className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5 animate-pulse"
                            >
                                <div className="h-3 w-20 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                                <div className="mt-3 h-4 w-2/3 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="rounded-[4px] border border-dashed border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-10 text-center">
                        <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]">Inbox clear</p>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">No pending approval requests right now.</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <div key={item.id} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{item.id}</span>
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${riskClass[item.risk]}`}>
                                            {item.risk}
                                        </span>
                                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]">
                                            Pending {fromNow(item.createdAt)}
                                        </span>
                                        {Date.now() - item.createdAt > item.escalationTimeoutSeconds * 1000 ? (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]">
                                                SLA overdue
                                            </span>
                                        ) : null}
                                        {item.escalatedAt ? (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]">
                                                Escalated
                                            </span>
                                        ) : null}
                                    </div>
                                    <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/60 border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2">
                                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-0.5">Customer asked</p>
                                        <p className="text-sm font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)]">{item.title}</p>
                                    </div>
                                    {item.reason && (
                                        <p className="text-xs text-[color:var(--warn)] dark:text-[color:var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/20 border border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] rounded-[3px] px-3 py-1.5">
                                            <span className="font-semibold">Why approval needed: </span>{item.reason}
                                        </p>
                                    )}
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                        <span>
                                            <strong className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Agent:</strong> {item.agent}
                                        </span>
                                        <span>
                                            <strong className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Channel:</strong> {item.channel}
                                        </span>
                                        <span>
                                            <strong className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">Requested by:</strong> {item.requestedBy}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <PremiumIcon icon={Clock3} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3" />
                                            {fromNow(item.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <input
                                        value={reasonById[item.id] ?? ""}
                                        onChange={(event) => {
                                            const value = event.target.value;
                                            setReasonById((current) => ({
                                                ...current,
                                                [item.id]: value,
                                            }));
                                            if (actionErrorById[item.id]) {
                                                setActionErrorById((current) => {
                                                    const next = { ...current };
                                                    delete next[item.id];
                                                    return next;
                                                });
                                            }
                                        }}
                                        placeholder="Decision reason (required for reject)"
                                        aria-invalid={Boolean(actionErrorById[item.id])}
                                        className={`w-full rounded-[3px] border bg-[var(--card)] dark:bg-[var(--bg)] px-3 py-2 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink)] ${actionErrorById[item.id] ? "border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]" : "border-[color:var(--line-strong)] dark:border-[color:var(--line)]"}`}
                                    />
                                    {actionErrorById[item.id] ? (
                                        <p className="w-full text-xs font-medium text-[color:var(--danger)] dark:text-[color:var(--danger)]">{actionErrorById[item.id]}</p>
                                    ) : null}
                                    <button
                                        disabled={activeId === item.id}
                                        onClick={() => void mutateApproval(item.id, "approve")}
                                        className="inline-flex items-center gap-1 rounded-[3px] bg-[var(--ok)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--ok)] disabled:opacity-60"
                                    >
                                        {activeId === item.id ? (
                                            <PremiumIcon icon={LoaderCircle} tone="emerald" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--card)] text-white border-[color:var(--line)]" iconClassName="w-3 h-3 animate-spin" />
                                        ) : (
                                            <PremiumIcon icon={Check} tone="emerald" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--card)] text-white border-[color:var(--line)]" iconClassName="w-3 h-3" />
                                        )}
                                        {activeId === item.id ? "Processing..." : "Approve"}
                                    </button>
                                    <button
                                        disabled={activeId === item.id}
                                        onClick={() => void mutateApproval(item.id, "reject")}
                                        className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] px-3 py-2 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] disabled:opacity-60"
                                    >
                                        {activeId === item.id ? (
                                            <PremiumIcon icon={LoaderCircle} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3 animate-spin" />
                                        ) : (
                                            <PremiumIcon icon={X} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3" />
                                        )}
                                        {activeId === item.id ? "Processing..." : "Reject"}
                                    </button>
                                    {canAudit ? (
                                        <Link
                                            href={`/dashboard/activity?ref=${item.id}`}
                                            className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] px-3 py-2 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                                        >
                                            <PremiumIcon icon={ShieldAlert} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3 h-3" /> Audit trail
                                        </Link>
                                    ) : (
                                        <span
                                            title="Audit trail requires admin access"
                                            className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] cursor-not-allowed select-none"
                                        >
                                            <PremiumIcon icon={ShieldAlert} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]" iconClassName="w-3 h-3" /> Audit trail
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {backHref ? (
                    <Link
                        href={backHref}
                        className="inline-flex rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] px-3 py-2 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                    >
                        Back to agent details
                    </Link>
                ) : null}
            </div>
        </div>
    );
}
