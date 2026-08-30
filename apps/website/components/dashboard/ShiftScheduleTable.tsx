"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "??";
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export type ShiftScheduleAgent = {
    slug: string;
    name: string;
    tone: string;
    start: string;
    end: string;
    days: string[];
};

const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const toneAccent: Record<string, { bg: string; text: string }> = {
    sky: { bg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40", text: "text-[color:var(--accent)] dark:text-[color:var(--accent)]" },
    violet: { bg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40", text: "text-[color:var(--accent)] dark:text-[color:var(--accent)]" },
    amber: { bg: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40", text: "text-[color:var(--warn)] dark:text-[color:var(--warn)]" },
    rose: { bg: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40", text: "text-[color:var(--danger)] dark:text-[color:var(--danger)]" },
};

function EditRow({ agent, onCancel, onSaved }: { agent: ShiftScheduleAgent; onCancel: () => void; onSaved: () => void }) {
    const [start, setStart] = useState(agent.start);
    const [end, setEnd] = useState(agent.end);
    const [days, setDays] = useState<string[]>(agent.days);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleDay = (d: string) => {
        setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/api/bots/${encodeURIComponent(agent.slug)}/config`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    shiftStart: start,
                    shiftEnd: end,
                    activeDays: days.map((d) => d.toLowerCase()),
                }),
            });
            if (!res.ok) {
                const body = (await res.json().catch(() => null)) as { error?: string } | null;
                throw new Error(body?.error ?? "Could not save schedule.");
            }
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save schedule.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <tr className="bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]/60 dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/20">
            <td className="px-5 py-3" colSpan={6}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Start</label>
                        <input
                            type="time"
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                            className="text-xs font-mono rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-2 py-1.5 text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]"
                        />
                        <label className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">End</label>
                        <input
                            type="time"
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                            className="text-xs font-mono rounded-[3px] border border-[color:var(--line-strong)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-2 py-1.5 text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]"
                        />
                    </div>
                    <div className="flex gap-1">
                        {allDays.map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => toggleDay(d)}
                                className={`inline-flex items-center justify-center h-6 w-7 rounded text-[9px] font-semibold transition-colors ${days.includes(d)
                                    ? "bg-[var(--accent)] text-white"
                                    : "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--line)] dark:hover:bg-[var(--card)]"
                                    }`}
                            >
                                {d[0]}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 lg:ml-auto">
                        {error && <span className="text-[11px] text-[color:var(--danger)] dark:text-[color:var(--danger)]">{error}</span>}
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={saving}
                            className="text-xs font-medium text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] hover:underline disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-60 rounded-[3px] px-3 py-1.5 transition-colors"
                        >
                            {saving && <LoaderCircle className="w-3 h-3 animate-spin" />}
                            Save
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    );
}

export default function ShiftScheduleTable({ agents }: { agents: ShiftScheduleAgent[] }) {
    const router = useRouter();
    const [editingSlug, setEditingSlug] = useState<string | null>(null);

    if (agents.length === 0) {
        return (
            <div className="px-5 py-12 text-center">
                <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">No agents deployed yet</p>
                <p className="text-xs text-[color:var(--ink-muted)] mt-1">Deploy an agent to configure its working hours and active days.</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
                <thead>
                    <tr className="bg-[var(--bg-deep)] dark:bg-[var(--card)]/50 text-xs font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                        <th className="text-left px-5 py-3">Agent</th>
                        <th className="text-left px-5 py-3">Start</th>
                        <th className="text-left px-5 py-3">End</th>
                        <th className="text-left px-5 py-3">Timezone</th>
                        <th className="text-left px-5 py-3">Active days</th>
                        <th className="px-5 py-3" />
                    </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]/70">
                    {agents.map((agent) => {
                        const accent = toneAccent[agent.tone] ?? toneAccent.sky!;
                        if (editingSlug === agent.slug) {
                            return (
                                <EditRow
                                    key={agent.slug}
                                    agent={agent}
                                    onCancel={() => setEditingSlug(null)}
                                    onSaved={() => {
                                        setEditingSlug(null);
                                        router.refresh();
                                    }}
                                />
                            );
                        }
                        return (
                            <tr key={agent.slug} className="hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors">
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className={`h-7 w-7 rounded-[3px] ${accent.bg} flex items-center justify-center text-[10px] font-bold ${accent.text} shrink-0`}>
                                            {initialsFromName(agent.name)}
                                        </div>
                                        <span className="font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)] text-xs">{agent.name}</span>
                                    </div>
                                </td>
                                <td className="px-5 py-3 font-mono text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{agent.start}</td>
                                <td className="px-5 py-3 font-mono text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{agent.end}</td>
                                <td className="px-5 py-3 text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Workspace local time</td>
                                <td className="px-5 py-3">
                                    <div className="flex gap-0.5">
                                        {allDays.map((d) => (
                                            <span
                                                key={d}
                                                className={`inline-flex items-center justify-center h-5 w-6 rounded text-[9px] font-semibold ${agent.days.includes(d)
                                                    ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 text-[color:var(--accent)] dark:text-[color:var(--accent)]"
                                                    : "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]"
                                                    }`}
                                            >
                                                {d[0]}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-5 py-3">
                                    <button
                                        type="button"
                                        onClick={() => setEditingSlug(agent.slug)}
                                        className="text-xs font-medium text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:underline"
                                    >
                                        Edit
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
