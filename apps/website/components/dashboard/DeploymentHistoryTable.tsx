"use client";

import React from "react";
import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, RefreshCw, Rocket } from "lucide-react";
import toast from "react-hot-toast";
import PremiumIcon from "@/components/shared/PremiumIcon";

export type DeploymentStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export type DeploymentJob = {
    id: string;
    botSlug: string;
    botName: string;
    status: DeploymentStatus;
    statusMessage: string;
    createdAt: number;
    updatedAt: number;
    lastActionType: "requested" | "retried" | "canceled" | null;
    lastActionBy: string | null;
    lastActionAt: number | null;
};

const statusClass: Record<DeploymentStatus, string> = {
    queued: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    running: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    succeeded: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]",
    failed: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
    canceled: "bg-[var(--line)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink)]",
};

const relative = (timestamp: number): string => {
    const deltaMs = Math.max(0, Date.now() - timestamp);
    const minutes = Math.max(1, Math.floor(deltaMs / 60000));
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

type DeploymentHistoryContentProps = {
    loading: boolean;
    error: string | null;
    items: DeploymentJob[];
    actionPendingById: Record<string, "retry" | "cancel" | undefined>;
    openDetailsId: string | null;
    onToggleDetails: (jobId: string) => void;
    onAction: (jobId: string, action: "retry" | "cancel") => void;
    onRefresh: () => void;
};

export function DeploymentHistoryContent({
    loading,
    error,
    items,
    actionPendingById,
    openDetailsId,
    onToggleDetails,
    onAction,
    onRefresh,
}: DeploymentHistoryContentProps) {
    return (
        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
                <p className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-2">
                    <PremiumIcon icon={Rocket} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" />
                    Deployment History
                </p>
                <button
                    onClick={onRefresh}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                >
                    <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {loading ? (
                <div className="p-5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] inline-flex items-center gap-2">
                    <PremiumIcon icon={LoaderCircle} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5 animate-spin" /> Loading deployment history...
                </div>
            ) : error ? (
                <div className="p-5 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</div>
            ) : items.length === 0 ? (
                <div className="p-8 text-center text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                    No deployments found yet. Trigger one from marketplace.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead>
                            <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                <th className="text-left px-4 py-3">Deployment</th>
                                <th className="text-left px-4 py-3">Agent</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Message</th>
                                <th className="text-left px-4 py-3">Updated</th>
                                <th className="text-left px-4 py-3">Actions</th>
                                <th className="text-left px-4 py-3">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                            {items.map((job) => {
                                const pendingAction = actionPendingById[job.id];
                                const showDetails = openDetailsId === job.id;

                                return (
                                    <React.Fragment key={job.id}>
                                        <tr className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors">
                                            <td className="px-4 py-3 text-xs font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{job.id}</td>
                                            <td className="px-4 py-3 font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{job.botName}</td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[job.status]}`}>
                                                    {job.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{job.statusMessage}</td>
                                            <td className="px-4 py-3 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{relative(job.updatedAt)}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {job.status === "failed" ? (
                                                        <button
                                                            onClick={() => onAction(job.id, "retry")}
                                                            disabled={Boolean(pendingAction)}
                                                            className="inline-flex items-center rounded-[3px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] px-2 py-1 text-xs font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)] hover:bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 disabled:opacity-60"
                                                        >
                                                            {pendingAction === "retry" ? "Retrying..." : "Retry"}
                                                        </button>
                                                    ) : null}
                                                    {job.status === "queued" || job.status === "running" ? (
                                                        <button
                                                            onClick={() => onAction(job.id, "cancel")}
                                                            disabled={Boolean(pendingAction)}
                                                            className="inline-flex items-center rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-2 py-1 text-xs font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 disabled:opacity-60"
                                                        >
                                                            {pendingAction === "cancel" ? "Canceling..." : "Cancel"}
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => onToggleDetails(job.id)}
                                                    className="inline-flex items-center rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2 py-1 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                                                >
                                                    {showDetails ? "Hide" : "View"}
                                                </button>
                                            </td>
                                        </tr>
                                        {showDetails ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 pb-4 pt-1">
                                                    <div className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 p-3 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] space-y-1">
                                                        <p><span className="font-semibold">Deployment:</span> {job.id}</p>
                                                        <p><span className="font-semibold">Reason / Message:</span> {job.statusMessage}</p>
                                                        <p><span className="font-semibold">Created:</span> {new Date(job.createdAt).toLocaleString()}</p>
                                                        <p><span className="font-semibold">Updated:</span> {new Date(job.updatedAt).toLocaleString()}</p>
                                                        <p>
                                                            <span className="font-semibold">Action audit:</span>{" "}
                                                            {job.lastActionType && job.lastActionBy && job.lastActionAt
                                                                ? (() => {
                                                                    const actionTypeLabel: Record<"requested" | "retried" | "canceled", string> = {
                                                                        requested: "Requested",
                                                                        retried: "Retried",
                                                                        canceled: "Canceled",
                                                                    };
                                                                    return `${actionTypeLabel[job.lastActionType]} by ${job.lastActionBy} at ${new Date(job.lastActionAt).toLocaleString()}`;
                                                                })()
                                                                : "not captured"}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default function DeploymentHistoryTable() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<DeploymentJob[]>([]);
    const [actionPendingById, setActionPendingById] = useState<Record<string, "retry" | "cancel" | undefined>>({});
    const [openDetailsId, setOpenDetailsId] = useState<string | null>(null);

    const load = useCallback(async () => {
        setError(null);

        try {
            const response = await fetch("/api/deployments?limit=40", {
                method: "GET",
                credentials: "include",
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to load deployment history.");
            }

            const body = (await response.json()) as { deployments: DeploymentJob[] };
            setItems(body.deployments);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load deployment history.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const mutateDeployment = useCallback(async (jobId: string, action: "retry" | "cancel") => {
        const target = items.find((job) => job.id === jobId);
        if (!target) {
            return;
        }

        if (action === "cancel") {
            const confirmed = window.confirm(`Cancel deployment ${target.id}? This stops current rollout progress.`);
            if (!confirmed) {
                return;
            }
        }

        if (action === "retry") {
            const confirmed = window.confirm(`Retry deployment for ${target.botName}? A new deployment request will be created.`);
            if (!confirmed) {
                return;
            }
        }

        setError(null);
        setActionPendingById((prev) => ({ ...prev, [jobId]: action }));

        try {
            const response = await fetch(`/api/deployments/${encodeURIComponent(jobId)}`, {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ action }),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to update deployment.");
            }

            await load();
            toast.success(action === "cancel" ? "Deployment canceled." : "Deployment retry requested.");
        } catch (mutateError) {
            const message = mutateError instanceof Error ? mutateError.message : "Unable to update deployment.";
            setError(message);
            toast.error(message);
        } finally {
            setActionPendingById((prev) => {
                const next = { ...prev };
                delete next[jobId];
                return next;
            });
        }
    }, [items, load]);

    const toggleDetails = useCallback((jobId: string) => {
        setOpenDetailsId((current) => (current === jobId ? null : jobId));
    }, []);

    return (
        <DeploymentHistoryContent
            loading={loading}
            error={error}
            items={items}
            actionPendingById={actionPendingById}
            openDetailsId={openDetailsId}
            onToggleDetails={toggleDetails}
            onAction={mutateDeployment}
            onRefresh={() => void load()}
        />
    );
}
