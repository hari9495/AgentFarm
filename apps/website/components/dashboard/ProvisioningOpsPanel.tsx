"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Wrench } from "lucide-react";
import toast from "react-hot-toast";
import PremiumIcon from "@/components/shared/PremiumIcon";

type Role = "superadmin" | "admin" | "member";

type SessionPayload = {
    authenticated: boolean;
    user?: {
        role: Role;
    };
};

type ProvisioningStatusPayload = {
    tenant: { id: string; tenantStatus: string } | null;
    workspace: { workspaceStatus: string } | null;
    bot: { botStatus: string } | null;
    provisioningJob: {
        id: string;
        status: string;
        failureReason?: string | null;
        remediationHint?: string | null;
        retryAttemptCount?: number;
        updatedAt?: number;
    } | null;
    autoProcessed?: { processed: number; completed: number; failed: number };
};

const formatStatus = (value: string | null | undefined): string => {
    if (!value) return "unknown";
    return value.replaceAll("_", " ");
};

export default function ProvisioningOpsPanel() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<ProvisioningStatusPayload | null>(null);
    const [role, setRole] = useState<Role>("member");
    const [actionPending, setActionPending] = useState<"process" | "retry" | null>(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const [sessionResponse, statusResponse] = await Promise.all([
                fetch("/api/auth/session", { method: "GET", credentials: "include" }),
                fetch("/api/provisioning/status", { method: "GET", credentials: "include" }),
            ]);

            if (sessionResponse.ok) {
                const session = (await sessionResponse.json()) as SessionPayload;
                if (session.user?.role) {
                    setRole(session.user.role);
                }
            }

            if (!statusResponse.ok) {
                const body = (await statusResponse.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to load provisioning status.");
            }

            const body = (await statusResponse.json()) as ProvisioningStatusPayload;
            setStatus(body);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load provisioning status.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const interval = setInterval(() => void load(), 5000);
        return () => clearInterval(interval);
    }, [load]);

    const isOperator = role === "admin" || role === "superadmin";
    const MAX_RETRY_ATTEMPTS = 3;
    const retryAttemptCount = status?.provisioningJob?.retryAttemptCount ?? 0;
    const atRetryLimit = retryAttemptCount >= MAX_RETRY_ATTEMPTS;
    const canRetry = isOperator && status?.provisioningJob?.status === "failed" && !atRetryLimit;

    const lastTransitionLabel = useMemo(() => {
        const updatedAt = status?.provisioningJob?.updatedAt;
        if (!updatedAt) return "not captured";
        return new Date(updatedAt).toLocaleString();
    }, [status?.provisioningJob?.updatedAt]);

    const processNow = useCallback(async () => {
        if (!isOperator || actionPending) return;
        setActionPending("process");
        setError(null);

        try {
            const response = await fetch("/api/provisioning/process", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ limit: 1 }),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to process provisioning queue.");
            }

            toast.success("Provisioning queue tick executed.");
            await load();
        } catch (actionError) {
            const message = actionError instanceof Error ? actionError.message : "Unable to process provisioning queue.";
            setError(message);
            toast.error(message);
        } finally {
            setActionPending(null);
        }
    }, [actionPending, isOperator, load]);

    const retryFailed = useCallback(async () => {
        const jobId = status?.provisioningJob?.id;
        if (!isOperator || !jobId || actionPending) return;

        setActionPending("retry");
        setError(null);

        try {
            const response = await fetch("/api/provisioning/retry", {
                method: "POST",
                credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ jobId }),
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to retry provisioning job.");
            }

            toast.success("Provisioning retry queued.");
            await load();
        } catch (actionError) {
            const message = actionError instanceof Error ? actionError.message : "Unable to retry provisioning job.";
            setError(message);
            toast.error(message);
        } finally {
            setActionPending(null);
        }
    }, [actionPending, isOperator, load, status?.provisioningJob?.id]);

    return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2">
                        <PremiumIcon icon={Wrench} tone="sky" containerClassName="w-6 h-6 rounded-lg bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400" iconClassName="w-3.5 h-3.5" />
                        Provisioning Operations
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tenant runtime provisioning controls and diagnostics.</p>
                </div>
                <button
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                    <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {loading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
                    <PremiumIcon icon={LoaderCircle} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="h-3.5 w-3.5 animate-spin" /> Loading provisioning status...
                </p>
            ) : error ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
            ) : !status?.tenant ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">No tenant provisioning context found for this account.</p>
            ) : (
                <div className="space-y-2 text-sm text-slate-700 dark:text-slate-200">
                    <p>Tenant status: <span className="font-semibold">{formatStatus(status.tenant.tenantStatus)}</span></p>
                    <p>Workspace status: <span className="font-semibold">{formatStatus(status.workspace?.workspaceStatus)}</span></p>
                    <p>Bot status: <span className="font-semibold">{formatStatus(status.bot?.botStatus)}</span></p>
                    <p>Provisioning job: <span className="font-semibold">{formatStatus(status.provisioningJob?.status)}</span></p>
                    {status.provisioningJob?.status === "failed" ? (
                        <p>Retry attempts: <span className="font-semibold">{retryAttemptCount} / {MAX_RETRY_ATTEMPTS}</span>{atRetryLimit ? <span className="ml-2 text-xs text-rose-600 dark:text-rose-400 font-semibold">(limit reached)</span> : null}</p>
                    ) : null}
                    <p>Last transition: <span className="font-semibold">{lastTransitionLabel}</span></p>
                    {status.provisioningJob?.failureReason ? (
                        <p>Failure reason: <span className="font-semibold text-rose-700 dark:text-rose-300">{status.provisioningJob.failureReason}</span></p>
                    ) : null}
                    {status.provisioningJob?.remediationHint ? (
                        <p>Remediation hint: <span className="font-semibold">{status.provisioningJob.remediationHint}</span></p>
                    ) : null}
                    {status.autoProcessed ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Auto tick: processed {status.autoProcessed.processed}, completed {status.autoProcessed.completed}, failed {status.autoProcessed.failed}
                        </p>
                    ) : null}

                    {isOperator ? (
                        <div className="pt-2 flex flex-wrap gap-2">
                            <button
                                onClick={() => void processNow()}
                                disabled={actionPending !== null}
                                className="inline-flex rounded-lg border border-sky-200 dark:border-sky-700 px-2.5 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-60"
                            >
                                {actionPending === "process" ? "Processing..." : "Process queue now"}
                            </button>
                            <button
                                onClick={() => void retryFailed()}
                                disabled={!canRetry || actionPending !== null}
                                title={atRetryLimit ? `Maximum ${MAX_RETRY_ATTEMPTS} retry attempts allowed for this provisioning job` : undefined}
                                className="inline-flex rounded-lg border border-emerald-200 dark:border-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-60"
                            >
                                {actionPending === "retry" ? "Retrying..." : atRetryLimit ? "Retry limit reached" : "Retry failed job"}
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Operator actions require admin or superadmin role.</p>
                    )}
                </div>
            )}
        </div>
    );
}
