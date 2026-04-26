"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, RefreshCw, Rocket } from "lucide-react";
import toast from "react-hot-toast";

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
    queued: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    running: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    succeeded: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    canceled: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Rocket className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        Deployment Status
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Latest marketplace deployment request</p>
                </div>
                <button
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {loading ? (
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading deployment...
                </p>
            ) : error ? (
                <p className="mt-4 text-xs text-rose-600 dark:text-rose-400">{error}</p>
            ) : !deployment ? (
                <div className="mt-4 space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300">{summary}</p>
                    <Link href="/dashboard/deployments" className="inline-flex text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                        View deployment history
                    </Link>
                </div>
            ) : (
                <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[deployment.status]}`}>
                            {deployment.status}
                        </span>
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{deployment.id}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{deployment.statusMessage}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{summary}</p>
                    {actionAudit ? (
                        <p className="inline-flex w-fit rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            Action: {actionAudit}
                        </p>
                    ) : null}
                    <div className="flex items-center gap-2 pt-1">
                        {deployment.status === "failed" ? (
                            <button
                                onClick={() => void mutateDeployment("retry")}
                                disabled={actionPending !== null}
                                className="inline-flex items-center rounded-lg border border-emerald-200 dark:border-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-60"
                            >
                                {actionPending === "retry" ? "Retrying..." : "Retry Deployment"}
                            </button>
                        ) : null}
                        {deployment.status === "queued" || deployment.status === "running" ? (
                            <button
                                onClick={() => void mutateDeployment("cancel")}
                                disabled={actionPending !== null}
                                className="inline-flex items-center rounded-lg border border-rose-200 dark:border-rose-700 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-60"
                            >
                                {actionPending === "cancel" ? "Canceling..." : "Cancel Deployment"}
                            </button>
                        ) : null}
                    </div>
                    <Link href="/dashboard/deployments" className="inline-flex text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                        View deployment history
                    </Link>
                </div>
            )}
        </div>
    );
}
