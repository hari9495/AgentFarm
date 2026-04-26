"use client";

import { useCallback, useEffect, useState, type ElementType } from "react";
import { Activity, CheckCircle2, GitPullRequest, RefreshCw, ShieldAlert, TestTube2, Zap } from "lucide-react";

type FeedEvent = {
    id: string;
    time: string;
    agent: string;
    action: string;
    detail: string;
    type: "code" | "security" | "qa" | "ops" | "approval";
    approvalOutcome?: "requested" | "approved" | "rejected";
};

const iconForType: Record<string, ElementType> = {
    code: GitPullRequest,
    security: ShieldAlert,
    qa: TestTube2,
    ops: Zap,
    approval: CheckCircle2,
};

const styleForType: Record<string, string> = {
    code: "text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/40",
    security: "text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40",
    qa: "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40",
    ops: "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40",
    approval: "text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/40",
};

const approvalBadgeStyle: Record<"requested" | "approved" | "rejected", string> = {
    requested: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const approvalDetailStyle: Record<"requested" | "approved" | "rejected", string> = {
    requested: "text-amber-700 dark:text-amber-300",
    approved: "text-emerald-700 dark:text-emerald-300",
    rejected: "text-rose-700 dark:text-rose-300",
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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 md:px-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Live Activity</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Team standup view across all active agents</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => void load()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Refresh
                        </button>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-3 py-1 text-xs font-semibold">
                            <Activity className="w-3.5 h-3.5" /> Streaming
                        </span>
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {error ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                        <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">Unable to load activity</p>
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
                        <button
                            onClick={() => void load()}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                        >
                            <RefreshCw className="h-3.5 w-3.5" /> Retry
                        </button>
                    </div>
                ) : null}

                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map((key) => (
                            <div
                                key={key}
                                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 animate-pulse"
                            >
                                <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                                <div className="mt-2 h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-700" />
                                <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
                            </div>
                        ))}
                    </div>
                ) : events.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No activity yet</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Agent events will appear here once tasks begin running.</p>
                    </div>
                ) : (
                    <div className="relative pl-8">
                        <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-800" />
                        <div className="space-y-4">
                            {events.map((item) => {
                                const Icon = iconForType[item.type] ?? CheckCircle2;
                                const outcome = item.type === "approval" ? (item.approvalOutcome ?? "requested") : null;
                                return (
                                    <div key={item.id} className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                                        <span className={`absolute -left-8 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full ${styleForType[item.type]}`}>
                                            <Icon className="w-3.5 h-3.5" />
                                        </span>
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{item.action}</p>
                                                {outcome ? (
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${approvalBadgeStyle[outcome]}`}>
                                                        {approvalLabel[outcome]}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                                                {item.time} · {item.id}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.agent}</p>
                                        <p className={`text-sm mt-2 ${outcome ? approvalDetailStyle[outcome] : "text-slate-700 dark:text-slate-300"}`}>
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
