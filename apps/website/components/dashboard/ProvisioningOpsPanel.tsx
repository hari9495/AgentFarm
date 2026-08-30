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
        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] inline-flex items-center gap-2">
                        <PremiumIcon icon={Wrench} tone="sky" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                        Provisioning Operations
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Tenant runtime provisioning controls and diagnostics.</p>
                </div>
                <button
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                >
                    <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3.5 h-3.5" /> Refresh
                </button>
            </div>

            {loading ? (
                <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] inline-flex items-center gap-2">
                    <PremiumIcon icon={LoaderCircle} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5 animate-spin" /> Loading provisioning status...
                </p>
            ) : error ? (
                <p className="text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</p>
            ) : !status?.tenant ? (
                <p className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">No tenant provisioning context found for this account.</p>
            ) : (
                <div className="space-y-2 text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]">
                    <p>Tenant status: <span className="font-semibold">{formatStatus(status.tenant.tenantStatus)}</span></p>
                    <p>Workspace status: <span className="font-semibold">{formatStatus(status.workspace?.workspaceStatus)}</span></p>
                    <p>Bot status: <span className="font-semibold">{formatStatus(status.bot?.botStatus)}</span></p>
                    <p>Provisioning job: <span className="font-semibold">{formatStatus(status.provisioningJob?.status)}</span></p>
                    {status.provisioningJob?.status === "failed" ? (
                        <p>Retry attempts: <span className="font-semibold">{retryAttemptCount} / {MAX_RETRY_ATTEMPTS}</span>{atRetryLimit ? <span className="ml-2 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)] font-semibold">(limit reached)</span> : null}</p>
                    ) : null}
                    <p>Last transition: <span className="font-semibold">{lastTransitionLabel}</span></p>
                    {status.provisioningJob?.failureReason ? (
                        <p>Failure reason: <span className="font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)]">{status.provisioningJob.failureReason}</span></p>
                    ) : null}
                    {status.provisioningJob?.remediationHint ? (
                        <p>Remediation hint: <span className="font-semibold">{status.provisioningJob.remediationHint}</span></p>
                    ) : null}
                    {status.autoProcessed ? (
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            Auto tick: processed {status.autoProcessed.processed}, completed {status.autoProcessed.completed}, failed {status.autoProcessed.failed}
                        </p>
                    ) : null}

                    {isOperator ? (
                        <div className="pt-2 flex flex-wrap gap-2">
                            <button
                                onClick={() => void processNow()}
                                disabled={actionPending !== null}
                                className="inline-flex rounded-[3px] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/20 disabled:opacity-60"
                            >
                                {actionPending === "process" ? "Processing..." : "Process queue now"}
                            </button>
                            <button
                                onClick={() => void retryFailed()}
                                disabled={!canRetry || actionPending !== null}
                                title={atRetryLimit ? `Maximum ${MAX_RETRY_ATTEMPTS} retry attempts allowed for this provisioning job` : undefined}
                                className="inline-flex rounded-[3px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)] hover:bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 disabled:opacity-60"
                            >
                                {actionPending === "retry" ? "Retrying..." : atRetryLimit ? "Retry limit reached" : "Retry failed job"}
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Operator actions require admin or superadmin role.</p>
                    )}
                </div>
            )}
        </div>
    );
}
