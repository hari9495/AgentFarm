"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw, Rocket } from "lucide-react";
import toast from "react-hot-toast";
import PremiumIcon from "@/components/shared/PremiumIcon";

type DeploymentStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

type DeploymentJob = {
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

export default function DeploymentStatusPanel() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deployment, setDeployment] = useState<DeploymentJob | null>(null);
    const [actionPending, setActionPending] = useState<"retry" | "cancel" | null>(null);

    const load = useCallback(async () => {
        setError(null);

        try {
            const response = await fetch("/api/deployments/latest", {
                method: "GET",
                credentials: "include",
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to load deployment status.");
            }

            const body = (await response.json()) as { deployment: DeploymentJob | null };
            setDeployment(body.deployment);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load deployment status.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const timer = setInterval(() => {
            void load();
        }, 6000);

        return () => clearInterval(timer);
    }, [load]);

    const summary = useMemo(() => {
        if (!deployment) {
            return "No deployment requests yet. Start one from marketplace.";
        }

        return `${deployment.botName} • updated ${relative(deployment.updatedAt)}`;
    }, [deployment]);

    const actionAudit = useMemo(() => {
        if (!deployment?.lastActionType || !deployment.lastActionBy || !deployment.lastActionAt) {
            return null;
        }

        const actionTypeLabel: Record<"requested" | "retried" | "canceled", string> = {
            requested: "Requested",
            retried: "Retried",
            canceled: "Canceled",
        };

        return `${actionTypeLabel[deployment.lastActionType]} by ${deployment.lastActionBy} • ${relative(deployment.lastActionAt)}`;
    }, [deployment]);

    const mutateDeployment = useCallback(async (action: "retry" | "cancel") => {
        if (!deployment || actionPending) {
            return;
        }

        if (action === "cancel") {
            const confirmed = window.confirm(`Cancel deployment ${deployment.id}? This stops current rollout progress.`);
            if (!confirmed) {
                return;
            }
        }

        if (action === "retry") {
            const confirmed = window.confirm(`Retry deployment for ${deployment.botName}? A new deployment request will be created.`);
            if (!confirmed) {
                return;
            }
        }

        setError(null);
        setActionPending(action);

        try {
            const response = await fetch(`/api/deployments/${encodeURIComponent(deployment.id)}`, {
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
            setActionPending(null);
        }
    }, [actionPending, deployment, load]);

    return (
        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-2">
                        <PremiumIcon icon={Rocket} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" />
                        Deployment Status
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Latest marketplace deployment request</p>
                </div>
                <button
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                >
                    <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {loading ? (
                <p className="mt-4 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] inline-flex items-center gap-2">
                    <PremiumIcon icon={LoaderCircle} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5 animate-spin" /> Loading deployment...
                </p>
            ) : error ? (
                <p className="mt-4 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</p>
            ) : !deployment ? (
                <div className="mt-4 space-y-2">
                    <p className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{summary}</p>
                    <Link href="/dashboard/deployments" className="inline-flex text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:underline">
                        View deployment history
                    </Link>
                </div>
            ) : (
                <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[deployment.status]}`}>
                            {deployment.status}
                        </span>
                        <span className="text-xs font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{deployment.id}</span>
                    </div>
                    <p className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{deployment.statusMessage}</p>
                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{summary}</p>
                    {actionAudit ? (
                        <p className="inline-flex w-fit rounded-full border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)]/60 px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Action: {actionAudit}
                        </p>
                    ) : null}
                    <div className="flex items-center gap-2 pt-1">
                        {deployment.status === "failed" ? (
                            <button
                                onClick={() => void mutateDeployment("retry")}
                                disabled={actionPending !== null}
                                className="inline-flex items-center rounded-[3px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)] hover:bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 disabled:opacity-60"
                            >
                                {actionPending === "retry" ? "Retrying..." : "Retry Deployment"}
                            </button>
                        ) : null}
                        {deployment.status === "queued" || deployment.status === "running" ? (
                            <button
                                onClick={() => void mutateDeployment("cancel")}
                                disabled={actionPending !== null}
                                className="inline-flex items-center rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 disabled:opacity-60"
                            >
                                {actionPending === "cancel" ? "Canceling..." : "Cancel Deployment"}
                            </button>
                        ) : null}
                    </div>
                    <Link href="/dashboard/deployments" className="inline-flex text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:underline">
                        View deployment history
                    </Link>
                </div>
            )}
        </div>
    );
}
