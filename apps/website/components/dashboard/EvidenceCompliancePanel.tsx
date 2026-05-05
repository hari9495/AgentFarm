"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileArchive, RefreshCw, ShieldCheck } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type EvidenceSummary = {
    generatedAt: number;
    windowHours: number;
    approvalsRequested: number;
    approvalsPending: number;
    approvalsApproved: number;
    approvalsRejected: number;
    escalatedApprovals: number;
    auditEventsCaptured: number;
    approvalDecisionLatencyP95Seconds: number | null;
    evidenceFreshnessSeconds: number | null;
};

type AuditEvent = {
    id: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    createdAt: number;
};

const fmtSeconds = (value: number | null): string => {
    if (value === null) return "n/a";
    if (value < 60) return `${value}s`;
    const mins = Math.floor(value / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
};

export default function EvidenceCompliancePanel() {
    const [summary, setSummary] = useState<EvidenceSummary | null>(null);
    const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [auditLoading, setAuditLoading] = useState(true);
    const [actorFilter, setActorFilter] = useState("");
    const [actionFilter, setActionFilter] = useState("");
    const [fromFilter, setFromFilter] = useState("");
    const [toFilter, setToFilter] = useState("");

    const loadSummary = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/evidence/summary", {
                method: "GET",
                credentials: "include",
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to load evidence summary.");
            }

            const body = (await response.json()) as { summary: EvidenceSummary };
            setSummary(body.summary);
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Unable to load evidence summary.";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSummary();
    }, [loadSummary]);

    const loadAuditEvents = useCallback(async () => {
        setAuditLoading(true);
        setError(null);

        try {
            const query = new URLSearchParams();
            if (actorFilter.trim()) {
                query.set("actorEmail", actorFilter.trim());
            }
            if (actionFilter.trim()) {
                query.set("action", actionFilter.trim());
            }
            if (fromFilter.trim()) {
                query.set("from", new Date(fromFilter).toISOString());
            }
            if (toFilter.trim()) {
                query.set("to", new Date(toFilter).toISOString());
            }
            query.set("limit", "50");

            const response = await fetch(`/api/audit/events?${query.toString()}`, {
                method: "GET",
                credentials: "include",
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to load audit events.");
            }

            const body = (await response.json()) as { events: AuditEvent[] };
            setAuditEvents(body.events);
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Unable to load audit events.";
            setError(message);
        } finally {
            setAuditLoading(false);
        }
    }, [actionFilter, actorFilter, fromFilter, toFilter]);

    useEffect(() => {
        void loadAuditEvents();
    }, [loadAuditEvents]);

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Evidence & Compliance</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Approval SLA, audit freshness, and export-ready evidence pack.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void loadSummary()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="h-3.5 w-3.5" /> Refresh
                        </button>
                        <a
                            href="/api/evidence/export?format=json"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <PremiumIcon icon={FileArchive} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="h-3.5 w-3.5" /> Export JSON
                        </a>
                        <a
                            href="/api/evidence/export?format=csv"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900"
                        >
                            <PremiumIcon icon={Download} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30 dark:bg-slate-900/10 dark:text-slate-900 dark:border-slate-900/20" iconClassName="h-3.5 w-3.5" /> Export CSV
                        </a>
                    </div>
                </div>
            </div>

            {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                    <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Unable to load evidence metrics</p>
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
                </div>
            ) : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                    {
                        label: "Approvals (24h)",
                        value: summary ? String(summary.approvalsRequested) : "-",
                        sub: summary ? `${summary.approvalsPending} pending` : "loading",
                    },
                    {
                        label: "Escalations (24h)",
                        value: summary ? String(summary.escalatedApprovals) : "-",
                        sub: "Auto escalation monitor",
                    },
                    {
                        label: "Decision Latency P95",
                        value: summary ? fmtSeconds(summary.approvalDecisionLatencyP95Seconds) : "-",
                        sub: "Approved/rejected actions",
                    },
                    {
                        label: "Evidence Freshness",
                        value: summary ? fmtSeconds(summary.evidenceFreshnessSeconds) : "-",
                        sub: "Since latest audit/approval event",
                    },
                ].map((card) => (
                    <div key={card.label} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{card.label}</p>
                        <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{loading ? "..." : card.value}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{card.sub}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    <PremiumIcon icon={ShieldCheck} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-3.5 h-3.5" /> Compliance pack ready
                </p>
                <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">
                    Exports include approval decisions, decision latency, escalation markers, and append-only audit events for evidence review.
                </p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Audit Event Query</h2>
                    <button
                        onClick={() => void loadAuditEvents()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                        <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="h-3.5 w-3.5" /> Refresh events
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <input
                        value={actionFilter}
                        onChange={(event) => setActionFilter(event.target.value)}
                        placeholder="Filter by event type (action)"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                    />
                    <input
                        value={actorFilter}
                        onChange={(event) => setActorFilter(event.target.value)}
                        placeholder="Filter by actor email"
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                    />
                    <input
                        type="datetime-local"
                        value={fromFilter}
                        onChange={(event) => setFromFilter(event.target.value)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                    />
                    <input
                        type="datetime-local"
                        value={toFilter}
                        onChange={(event) => setToFilter(event.target.value)}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-xs">
                        <thead>
                            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                                <th className="py-2 pr-3">Time</th>
                                <th className="py-2 pr-3">Event Type</th>
                                <th className="py-2 pr-3">Actor</th>
                                <th className="py-2 pr-3">Target</th>
                                <th className="py-2 pr-3">Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLoading ? (
                                <tr>
                                    <td colSpan={5} className="py-3 text-slate-500 dark:text-slate-400">
                                        Loading audit events...
                                    </td>
                                </tr>
                            ) : auditEvents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-3 text-slate-500 dark:text-slate-400">
                                        No audit events match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                auditEvents.map((event) => (
                                    <tr key={event.id} className="border-b border-slate-100 dark:border-slate-800/80">
                                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                                            {new Date(event.createdAt).toLocaleString()}
                                        </td>
                                        <td className="py-2 pr-3 text-slate-700 dark:text-slate-200 font-medium">
                                            {event.action}
                                        </td>
                                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{event.actorEmail}</td>
                                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">
                                            {event.targetType}:{event.targetId}
                                        </td>
                                        <td className="py-2 pr-3 text-slate-600 dark:text-slate-300">{event.reason || "-"}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
