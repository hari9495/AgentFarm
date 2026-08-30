"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Wrench } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type ProvisioningStatus =
    | "queued"
    | "validating"
    | "creating_resources"
    | "bootstrapping_vm"
    | "starting_container"
    | "registering_runtime"
    | "healthchecking"
    | "completed"
    | "failed"
    | "cleanup_pending"
    | "cleaned_up";

type ProvisioningStatusPayload = {
    tenant: { tenantStatus: string } | null;
    workspace: { workspaceStatus: string } | null;
    bot: { botStatus: string } | null;
    provisioningJob: {
        id: string;
        status: ProvisioningStatus;
        failureReason?: string | null;
        remediationHint?: string | null;
        updatedAt?: number;
    } | null;
    provisioningTimeline: Array<{
        status: ProvisioningStatus;
        at: number;
        reason: string | null;
    }>;
    estimatedSecondsRemaining: number | null;
    slaMetrics?: {
        elapsedSeconds: number;
        targetSeconds: number;
        timeoutSeconds: number;
        stuckThresholdSeconds: number;
        withinTarget: boolean;
        breachedTarget: boolean;
        isStuck: boolean;
        isTimedOut: boolean;
    } | null;
    provisioningAlerts?: Array<{
        level: "warning" | "critical";
        code: string;
        message: string;
    }>;
};

// Poll fast while a job is actively provisioning; back way off when there is
// no job or the job reached a terminal state (completed / failed / cleaned_up).
const ACTIVE_POLL_INTERVAL_MS = 3000;
const IDLE_POLL_INTERVAL_MS = 60_000;

const ACTIVE_JOB_STATUSES: ReadonlySet<string> = new Set([
    "queued",
    "validating",
    "creating_resources",
    "bootstrapping_vm",
    "starting_container",
    "registering_runtime",
    "healthchecking",
    "cleanup_pending",
]);

const statusPillClass: Record<ProvisioningStatus, string> = {
    queued: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink)]",
    validating: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    creating_resources: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    bootstrapping_vm: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    starting_container: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    registering_runtime: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    healthchecking: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    completed: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]",
    failed: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
    cleanup_pending: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    cleaned_up: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink)]",
};

const toLabel = (value: string): string => value.replaceAll("_", " ");

const formatEta = (seconds: number | null): string => {
    if (seconds === null) return "Unavailable";
    if (seconds <= 0) return "Complete";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes === 0) return `${remainingSeconds}s`;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
};

const formatMinutes = (seconds: number): string => `${Math.max(1, Math.floor(seconds / 60))}m`;

const relative = (timestamp: number): string => {
    const deltaMs = Math.max(0, Date.now() - timestamp);
    const seconds = Math.max(1, Math.floor(deltaMs / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

export function ProvisioningProgressCardContent(props: {
    loading: boolean;
    error: string | null;
    payload: ProvisioningStatusPayload | null;
    onRefresh: () => void;
}) {
    const job = props.payload?.provisioningJob ?? null;
    const timeline = props.payload?.provisioningTimeline ?? [];
    const slaMetrics = props.payload?.slaMetrics ?? null;
    const alerts = props.payload?.provisioningAlerts ?? [];

    return (
        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] flex items-center gap-2">
                        <PremiumIcon icon={Clock3} tone="sky" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]" iconClassName="w-3.5 h-3.5" />
                        Provisioning Progress
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Live runtime bootstrap state for your tenant workspace</p>
                </div>
                <button
                    onClick={props.onRefresh}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-2.5 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                >
                    <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5" /> Refresh
                </button>
            </div>

            {props.loading && !props.payload ? (
                <p className="mt-4 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] inline-flex items-center gap-2">
                    <PremiumIcon icon={LoaderCircle} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5 animate-spin" /> Loading provisioning status...
                </p>
            ) : props.error ? (
                <p className="mt-4 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{props.error}</p>
            ) : !job ? (
                <p className="mt-4 text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">No active provisioning job for this workspace.</p>
            ) : (
                <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusPillClass[job.status]}`}>
                            {toLabel(job.status)}
                        </span>
                        <span className="text-xs font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{job.id}</span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                        <p className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Estimated time remaining: <span className="font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{formatEta(props.payload?.estimatedSecondsRemaining ?? null)}</span>
                        </p>
                        <p className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Last transition: <span className="font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{job.updatedAt ? relative(job.updatedAt) : "Unknown"}</span>
                        </p>
                    </div>

                    {slaMetrics ? (
                        <div className="grid gap-2 sm:grid-cols-3 text-xs">
                            <p className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                Elapsed: <span className="font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{formatEta(slaMetrics.elapsedSeconds)}</span>
                            </p>
                            <p className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                SLA target: <span className="font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{formatMinutes(slaMetrics.targetSeconds)}</span>
                            </p>
                            <p className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                SLA status: <span className={`font-semibold ${slaMetrics.breachedTarget ? "text-[color:var(--danger)] dark:text-[color:var(--danger)]" : "text-[color:var(--ok)] dark:text-[color:var(--ok)]"}`}>{slaMetrics.breachedTarget ? "Breached" : "Within target"}</span>
                            </p>
                        </div>
                    ) : null}

                    {alerts.length > 0 ? (
                        <div className="rounded-[3px] border border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/20 p-3.5">
                            <p className="text-sm font-semibold text-[color:var(--warn)] dark:text-[color:var(--warn)] inline-flex items-center gap-1.5">
                                <PremiumIcon icon={AlertTriangle} tone="amber" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 text-[color:var(--warn)] dark:text-[color:var(--warn)]" iconClassName="w-3.5 h-3.5" /> Provisioning alert
                            </p>
                            {alerts.map((alert) => (
                                <p key={alert.code} className="mt-1 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                    {alert.level === "critical" ? "Critical" : "Warning"}: {alert.message}
                                </p>
                            ))}
                        </div>
                    ) : null}

                    <div className="rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Step history</p>
                        <ul className="mt-2 space-y-1.5">
                            {timeline.map((step) => (
                                <li key={`${step.status}-${step.at}`} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="inline-flex items-center gap-1.5 text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]">
                                        <PremiumIcon icon={CheckCircle2} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="h-3.5 w-3.5" />
                                        {toLabel(step.status)}
                                    </span>
                                    <span className="text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{relative(step.at)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {job.status === "failed" ? (
                        <div className="rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 p-3.5">
                            <p className="text-sm font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)] inline-flex items-center gap-1.5">
                                <PremiumIcon icon={AlertTriangle} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="w-3.5 h-3.5" /> Provisioning failed
                            </p>
                            {job.failureReason ? (
                                <p className="mt-1 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">Failure reason: {job.failureReason}</p>
                            ) : null}
                            {job.remediationHint ? (
                                <p className="mt-1 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] inline-flex items-start gap-1.5">
                                    <PremiumIcon icon={Wrench} tone="slate" containerClassName="w-6 h-6 mt-0.5 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5" />
                                    Remediation: {job.remediationHint}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

export default function ProvisioningProgressCard() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [payload, setPayload] = useState<ProvisioningStatusPayload | null>(null);

    const load = useCallback(async (): Promise<ProvisioningStatusPayload | null> => {
        setError(null);

        try {
            const response = await fetch("/api/provisioning/status", {
                method: "GET",
                cache: "no-store",
                credentials: "include",
            });

            const body = (await response.json().catch(() => null)) as (ProvisioningStatusPayload & { error?: string }) | null;
            if (!response.ok) {
                throw new Error(body?.error ?? "Unable to load provisioning progress.");
            }

            setPayload(body);
            return body;
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load provisioning progress.");
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const tick = async () => {
            const body = await load();
            if (cancelled) return;
            const jobStatus = body?.provisioningJob?.status;
            const interval = jobStatus && ACTIVE_JOB_STATUSES.has(jobStatus)
                ? ACTIVE_POLL_INTERVAL_MS
                : IDLE_POLL_INTERVAL_MS;
            timer = setTimeout(() => void tick(), interval);
        };

        void tick();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [load]);

    const stableRefresh = useMemo(() => () => {
        void load();
    }, [load]);

    return (
        <ProvisioningProgressCardContent
            loading={loading}
            error={error}
            payload={payload}
            onRefresh={stableRefresh}
        />
    );
}
