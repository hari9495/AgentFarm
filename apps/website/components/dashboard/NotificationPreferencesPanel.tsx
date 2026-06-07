"use client";

import { useState } from "react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";
import type { NotificationPrefKey } from "@/lib/auth-store";

const PREF_LABELS: Record<NotificationPrefKey, string> = {
    agent_pause: "Agent pauses for approval",
    high_risk: "Agent detects high-risk action",
    daily_summary: "Agent completes daily summary",
    weekly_report: "Weekly quality report",
    agent_error: "Agent encounters error (non-critical)",
    new_task: "New task assigned to agent",
};

const PREF_ORDER: NotificationPrefKey[] = [
    "agent_pause",
    "high_risk",
    "daily_summary",
    "weekly_report",
    "agent_error",
    "new_task",
];

type Props = {
    initialPrefs: Record<NotificationPrefKey, boolean>;
};

export default function NotificationPreferencesPanel({ initialPrefs }: Props) {
    const [prefs, setPrefs] = useState(initialPrefs);
    const [pending, setPending] = useState<NotificationPrefKey | null>(null);
    const [error, setError] = useState<string | null>(null);

    const toggle = async (key: NotificationPrefKey) => {
        const next = !prefs[key];
        setPending(key);
        setError(null);
        // Optimistic update
        setPrefs((prev) => ({ ...prev, [key]: next }));

        try {
            const res = await fetch("/api/notifications/preferences", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ [key]: next }),
            });
            if (!res.ok) {
                // Roll back on failure
                setPrefs((prev) => ({ ...prev, [key]: !next }));
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                setError(body?.error ?? "Could not save preference. Please try again.");
            }
        } catch {
            setPrefs((prev) => ({ ...prev, [key]: !next }));
            setError("Could not save preference. Please try again.");
        } finally {
            setPending(null);
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
            {error && (
                <p className="px-5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30">{error}</p>
            )}
            {PREF_ORDER.map((key) => {
                const enabled = prefs[key];
                const isPending = pending === key;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => toggle(key)}
                        disabled={isPending}
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left disabled:opacity-60"
                    >
                        <p className="text-sm text-slate-700 dark:text-slate-300">{PREF_LABELS[key]}</p>
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${enabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>
                            {enabled ? (
                                <>
                                    <PremiumIcon icon={ToggleRight} tone="emerald" containerClassName="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400" iconClassName="w-4 h-4" />
                                    {isPending ? "Saving…" : "On"}
                                </>
                            ) : (
                                <>
                                    <PremiumIcon icon={ToggleLeft} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-4 h-4" />
                                    {isPending ? "Saving…" : "Off"}
                                </>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
