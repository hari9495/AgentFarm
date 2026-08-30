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
        <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
            {error && (
                <p className="px-5 py-2.5 text-xs font-medium text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30">{error}</p>
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
                        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors text-left disabled:opacity-60"
                    >
                        <p className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{PREF_LABELS[key]}</p>
                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${enabled ? "text-[color:var(--ok)] dark:text-[color:var(--ok)]" : "text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]"}`}>
                            {enabled ? (
                                <>
                                    <PremiumIcon icon={ToggleRight} tone="emerald" containerClassName="w-5 h-5 rounded-[2px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]" iconClassName="w-4 h-4" />
                                    {isPending ? "Saving…" : "On"}
                                </>
                            ) : (
                                <>
                                    <PremiumIcon icon={ToggleLeft} tone="slate" containerClassName="w-5 h-5 rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-4 h-4" />
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
