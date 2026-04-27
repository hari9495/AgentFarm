"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Wrench } from "lucide-react";

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

const POLL_INTERVAL_MS = 2000;

const statusPillClass: Record<ProvisioningStatus, string> = {
    queued: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    validating: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    creating_resources: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
    bootstrapping_vm: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
    starting_container: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    registering_runtime: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    healthchecking: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    cleanup_pending: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    cleaned_up: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        Provisioning Progress
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Live runtime bootstrap state for your tenant workspace</p>
                </div>
                <button
                    onClick={props.onRefresh}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
            </div>

            {props.loading && !props.payload ? (
                <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading provisioning status...
                </p>
            ) : props.error ? (
                <p className="mt-4 text-xs text-rose-600 dark:text-rose-400">{props.error}</p>
            ) : !job ? (
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">No active provisioning job for this workspace.</p>
            ) : (
                <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusPillClass[job.status]}`}>
                            {toLabel(job.status)}
                        </span>
                        <span className="text-xs font-mono text-slate-400 dark:text-slate-500">{job.id}</span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 text-xs">
                        <p className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-600 dark:text-slate-300">
                            Estimated time remaining: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatEta(props.payload?.estimatedSecondsRemaining ?? null)}</span>
                        </p>
                        <p className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-600 dark:text-slate-300">
                            Last transition: <span className="font-semibold text-slate-900 dark:text-slate-100">{job.updatedAt ? relative(job.updatedAt) : "Unknown"}</span>
                        </p>
                    </div>

                    {slaMetrics ? (
                        <div className="grid gap-2 sm:grid-cols-3 text-xs">
                            <p className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-600 dark:text-slate-300">
                                Elapsed: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatEta(slaMetrics.elapsedSeconds)}</span>
                            </p>
                            <p className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-600 dark:text-slate-300">
                                SLA target: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatMinutes(slaMetrics.targetSeconds)}</span>
                            </p>
                            <p className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-600 dark:text-slate-300">
                                SLA status: <span className={`font-semibold ${slaMetrics.breachedTarget ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{slaMetrics.breachedTarget ? "Breached" : "Within target"}</span>
                            </p>
                        </div>
                    ) : null}

                    {alerts.length > 0 ? (
                        <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 p-3.5">
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 inline-flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4" /> Provisioning alert
                            </p>
                            {alerts.map((alert) => (
                                <p key={alert.code} className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                                    {alert.level === "critical" ? "Critical" : "Warning"}: {alert.message}
                                </p>
                            ))}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Step history</p>
                        <ul className="mt-2 space-y-1.5">
                            {timeline.map((step) => (
                                <li key={`${step.status}-${step.at}`} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                        {toLabel(step.status)}
                                    </span>
                                    <span className="text-slate-400 dark:text-slate-500">{relative(step.at)}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {job.status === "failed" ? (
                        <div className="rounded-xl border border-rose-200 dark:border-rose-700/40 bg-rose-50 dark:bg-rose-950/20 p-3.5">
                            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4" /> Provisioning failed
                            </p>
                            {job.failureReason ? (
                                <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">Failure reason: {job.failureReason}</p>
                            ) : null}
                            {job.remediationHint ? (
                                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 inline-flex items-start gap-1.5">
                                    <Wrench className="mt-0.5 h-3.5 w-3.5" />
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

    const load = useCallback(async () => {
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
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Unable to load provisioning progress.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
        const timer = setInterval(() => {
            void load();
        }, POLL_INTERVAL_MS);

        return () => clearInterval(timer);
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
