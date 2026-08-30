"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, GitPullRequest, RefreshCw, ShieldAlert, TestTube2, Zap, type LucideIcon } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type FeedEvent = {
    id: string;
    time: string;
    agent: string;
    action: string;
    detail: string;
    type: "code" | "security" | "qa" | "ops" | "approval";
    approvalOutcome?: "requested" | "approved" | "rejected";
};

const iconForType: Record<string, LucideIcon> = {
    code: GitPullRequest,
    security: ShieldAlert,
    qa: TestTube2,
    ops: Zap,
    approval: CheckCircle2,
};

const styleForType: Record<string, string> = {
    code: "text-[color:var(--accent)] dark:text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40",
    security: "text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40",
    qa: "text-[color:var(--ok)] dark:text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40",
    ops: "text-[color:var(--warn)] dark:text-[color:var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40",
    approval: "text-[color:var(--accent)] dark:text-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40",
};

const approvalBadgeStyle: Record<"requested" | "approved" | "rejected", string> = {
    requested: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    approved: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]",
    rejected: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
};

const approvalDetailStyle: Record<"requested" | "approved" | "rejected", string> = {
    requested: "text-[color:var(--warn)] dark:text-[color:var(--warn)]",
    approved: "text-[color:var(--ok)] dark:text-[color:var(--ok)]",
    rejected: "text-[color:var(--danger)] dark:text-[color:var(--danger)]",
};

const approvalLabel: Record<"requested" | "approved" | "rejected", string> = {
    requested: "Pending",
    approved: "Approved",
    rejected: "Rejected",
};

export default function ActivityFeed() {
    const [events, setEvents] = useState<FeedEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<"all" | FeedEvent["type"]>("all");

    const filterTypes = [
        { key: "all" as const, label: "All" },
        { key: "code" as const, label: "Code" },
        { key: "security" as const, label: "Security" },
        { key: "qa" as const, label: "QA" },
        { key: "ops" as const, label: "Ops" },
        { key: "approval" as const, label: "Approvals" },
    ];

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch("/api/activity", {
                method: "GET",
                credentials: "include",
            });

            if (!response.ok) {
                const body = (await response.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Unable to fetch activity feed.");
            }

            const body = (await response.json()) as { events: FeedEvent[] };
            setEvents(body.events);
        } catch (loadError) {
            const message = loadError instanceof Error ? loadError.message : "Unable to load activity feed.";
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="bg-[var(--card)] dark:bg-[var(--card)] border-b border-[color:var(--line)] dark:border-[color:var(--line)] px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Live Activity</h1>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Team standup view across all active agents</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void load()}
                            className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                        >
                            <PremiumIcon icon={RefreshCw} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="h-3.5 w-3.5" /> Refresh
                        </button>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)] px-3 py-1 text-xs font-semibold">
                            <PremiumIcon icon={Activity} tone="emerald" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/50 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-3.5 h-3.5" /> Streaming
                        </span>
                    </div>
                </div>

                {/* X3: Filter chips */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {filterTypes.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setActiveFilter(f.key)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${activeFilter === f.key
                                    ? "bg-[var(--accent)] text-white"
                                    : "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--line)] dark:hover:bg-[var(--card)]"
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {error ? (
                    <div className="rounded-[4px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-5 dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/50 dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30">
                        <p className="text-sm font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)]">Unable to load activity</p>
                        <p className="mt-1 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</p>
                        <button
                            onClick={() => void load()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-3 py-1.5 text-xs font-semibold text-[color:var(--danger)] dark:text-[color:var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:hover:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30"
                        >
                            <PremiumIcon icon={RefreshCw} tone="rose" containerClassName="w-6 h-6 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map((key) => (
                            <div
                                key={key}
                                className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-4 animate-pulse"
                            >
                                <div className="h-4 w-2/3 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                                <div className="mt-2 h-3 w-1/3 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--line)] dark:bg-[var(--card)]" />
                            </div>
                        ))}
                    </div>
                ) : events.length === 0 ? (
                    <div className="rounded-[4px] border border-dashed border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-10 text-center">
                        <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]">No activity yet</p>
                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">Agent events will appear here once tasks begin running.</p>
                    </div>
                ) : (
                    <div className="relative pl-8">
                        <div className="absolute left-3 top-0 bottom-0 w-px bg-[var(--line)] dark:bg-[var(--card)]" />
                        <div className="space-y-4">
                            {(activeFilter === "all" ? events : events.filter((e) => e.type === activeFilter)).map((item) => {
                                const Icon = iconForType[item.type] ?? CheckCircle2;
                                const outcome = item.type === "approval" ? (item.approvalOutcome ?? "requested") : null;
                                return (
                                    <div key={item.id} className="relative rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-4">
                                        <span className={`absolute -left-8 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full ${styleForType[item.type]}`}>
                                            <PremiumIcon icon={Icon} tone="slate" containerClassName="w-6 h-6 rounded-full bg-transparent text-current" iconClassName="w-3.5 h-3.5" />
                                        </span>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{item.action}</p>
                                                {outcome ? (
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${approvalBadgeStyle[outcome]}`}>
                                                        {approvalLabel[outcome]}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <span className="text-[11px] font-mono text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                {item.time} · {item.id}
                                            </span>
                                        </div>
                                        <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">{item.agent}</p>
                                        <p className={`text-sm mt-2 ${outcome ? approvalDetailStyle[outcome] : "text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]"}`}>
                                            {item.detail}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
