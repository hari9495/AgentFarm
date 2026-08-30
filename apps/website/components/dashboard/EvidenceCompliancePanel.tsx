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
            <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Evidence & Compliance</h1>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            Approval SLA, audit freshness, and export-ready evidence pack.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void loadSummary()}
                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                        >
                            <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5" /> Refresh
                        </button>
                        <a
                            href="/api/evidence/export?format=json"
                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                        >
                            <PremiumIcon icon={FileArchive} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5" /> Export JSON
                        </a>
                        <a
                            href="/api/evidence/export?format=csv"
                            className="inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--accent)] dark:bg-[var(--bg-deep)] px-3 py-1.5 text-xs font-semibold text-white dark:text-[color:var(--ink)]"
                        >
                            <PremiumIcon icon={Download} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--card)] text-white border-[color:var(--line)] dark:bg-[var(--card)]/10 dark:text-[color:var(--ink)] dark:border-[color:var(--line)]/20" iconClassName="h-3.5 w-3.5" /> Export CSV
                        </a>
                    </div>
                </div>
            </div>

            {error ? (
                <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-5 dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/50 dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30">
                    <p className="text-sm font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)]">Unable to load evidence metrics</p>
                    <p className="mt-1 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</p>
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
                    <div key={card.label} className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-4">
                        <p className="text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{card.label}</p>
                        <p className="mt-2 text-2xl font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{loading ? "..." : card.value}</p>
                        <p className="mt-1 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{card.sub}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 p-4">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                    <PremiumIcon icon={ShieldCheck} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" /> Compliance pack ready
                </p>
                <p className="mt-1 text-xs text-[color:var(--ok)]/90 dark:text-[color:var(--ok)]/90">
                    Exports include approval decisions, decision latency, escalation markers, and append-only audit events for evidence review.
                </p>
            </div>

            <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Audit Event Query</h2>
                    <button
                        onClick={() => void loadAuditEvents()}
                        className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                    >
                        <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5" /> Refresh events
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <input
                        value={actionFilter}
                        onChange={(event) => setActionFilter(event.target.value)}
                        placeholder="Filter by event type (action)"
                        className="rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--bg)] px-3 py-2 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]"
                    />
                    <input
                        value={actorFilter}
                        onChange={(event) => setActorFilter(event.target.value)}
                        placeholder="Filter by actor email"
                        className="rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--bg)] px-3 py-2 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]"
                    />
                    <input
                        type="datetime-local"
                        value={fromFilter}
                        onChange={(event) => setFromFilter(event.target.value)}
                        className="rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--bg)] px-3 py-2 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]"
                    />
                    <input
                        type="datetime-local"
                        value={toFilter}
                        onChange={(event) => setToFilter(event.target.value)}
                        className="rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--bg)] px-3 py-2 text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]"
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-xs">
                        <thead>
                            <tr className="text-left text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
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
                                    <td colSpan={5} className="py-3 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                        Loading audit events...
                                    </td>
                                </tr>
                            ) : auditEvents.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-3 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                        No audit events match the current filters.
                                    </td>
                                </tr>
                            ) : (
                                auditEvents.map((event) => (
                                    <tr key={event.id} className="border-b border-[color:var(--line)] dark:border-[color:var(--line)]/80">
                                        <td className="py-2 pr-3 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                            {new Date(event.createdAt).toLocaleString()}
                                        </td>
                                        <td className="py-2 pr-3 text-[color:var(--ink-soft)] dark:text-[color:var(--ink)] font-medium">
                                            {event.action}
                                        </td>
                                        <td className="py-2 pr-3 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{event.actorEmail}</td>
                                        <td className="py-2 pr-3 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                            {event.targetType}:{event.targetId}
                                        </td>
                                        <td className="py-2 pr-3 text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{event.reason || "-"}</td>
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
