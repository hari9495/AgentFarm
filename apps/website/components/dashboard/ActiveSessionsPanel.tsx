"use client";

import { useState } from "react";
import { Monitor, X } from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

export type OwnSessionView = {
    sessionId: string;
    createdAt: number;
    expiresAt: number;
    lastSeenAt: number;
    isCurrent: boolean;
};

function formatRelativeOrDate(ts: number): string {
    const diffMs = Date.now() - ts;
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ActiveSessionsPanel({ sessions: initialSessions }: { sessions: OwnSessionView[] }) {
    const [sessions, setSessions] = useState(initialSessions);
    const [revoking, setRevoking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function revoke(sessionId: string) {
        setRevoking(sessionId);
        setError(null);
        try {
            const res = await fetch(`/api/security/sessions/${encodeURIComponent(sessionId)}`, {
                method: "DELETE",
                credentials: "include",
            });
            if (!res.ok) {
                const data = await (res.json() as Promise<any>).catch(() => ({}));
                throw new Error(data.error ?? "Unable to revoke session.");
            }
            setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        } catch (e) {
            setError((e as Error).message ?? "Unable to revoke session.");
        } finally {
            setRevoking(null);
        }
    }

    return (
        <div className="rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <PremiumIcon icon={Monitor} tone="slate" containerClassName="w-6 h-6 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]" iconClassName="w-3.5 h-3.5" />
                    <h2 className="text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Active Sessions</h2>
                </div>
                <span className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{sessions.length} active</span>
            </div>

            {error && (
                <div className="mx-5 mt-4 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 px-3 py-2 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                    {error}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                    <thead>
                        <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                            <th className="text-left px-5 py-3">Session</th>
                            <th className="text-left px-4 py-3">Started</th>
                            <th className="text-left px-4 py-3">Last active</th>
                            <th className="text-left px-4 py-3">Expires</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                        {sessions.map((s) => (
                            <tr key={s.sessionId} className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors">
                                <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)] shrink-0">
                                            <Monitor className="w-3.5 h-3.5" />
                                        </span>
                                        <span className="font-mono text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{s.sessionId.slice(0, 14)}…</span>
                                        {s.isCurrent && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                                                This device
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{formatDate(s.createdAt)}</td>
                                <td className="px-4 py-3.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{formatRelativeOrDate(s.lastSeenAt)}</td>
                                <td className="px-4 py-3.5 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">{formatDate(s.expiresAt)}</td>
                                <td className="px-4 py-3.5">
                                    {!s.isCurrent && (
                                        <button
                                            disabled={revoking === s.sessionId}
                                            onClick={() => revoke(s.sessionId)}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--danger)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <PremiumIcon icon={X} tone="rose" containerClassName="w-5 h-5 rounded-[2px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 text-[color:var(--danger)] dark:text-[color:var(--danger)]" iconClassName="w-3 h-3" />
                                            {revoking === s.sessionId ? "Revoking…" : "Revoke"}
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
