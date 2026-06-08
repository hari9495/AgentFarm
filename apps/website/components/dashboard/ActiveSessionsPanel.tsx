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
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <PremiumIcon icon={Monitor} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Active Sessions</h2>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">{sessions.length} active</span>
            </div>

            {error && (
                <div className="mx-5 mt-4 rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                    {error}
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <th className="text-left px-5 py-3">Session</th>
                            <th className="text-left px-4 py-3">Started</th>
                            <th className="text-left px-4 py-3">Last active</th>
                            <th className="text-left px-4 py-3">Expires</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                        {sessions.map((s) => (
                            <tr key={s.sessionId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="px-5 py-3.5">
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 shrink-0">
                                            <Monitor className="w-3.5 h-3.5" />
                                        </span>
                                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{s.sessionId.slice(0, 14)}…</span>
                                        {s.isCurrent && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                                                This device
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatDate(s.createdAt)}</td>
                                <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatRelativeOrDate(s.lastSeenAt)}</td>
                                <td className="px-4 py-3.5 text-xs text-slate-400 dark:text-slate-500">{formatDate(s.expiresAt)}</td>
                                <td className="px-4 py-3.5">
                                    {!s.isCurrent && (
                                        <button
                                            disabled={revoking === s.sessionId}
                                            onClick={() => revoke(s.sessionId)}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <PremiumIcon icon={X} tone="rose" containerClassName="w-5 h-5 rounded-md bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400" iconClassName="w-3 h-3" />
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
