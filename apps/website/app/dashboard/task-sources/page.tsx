"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Clock, AlertCircle } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type Tracker = "jira" | "linear" | "github" | "custom";

type PollSource = {
    id: string;
    agentId: string | null;
    tracker: Tracker;
    baseUrl: string | null;
    assignee: string;
    projectFilter: string | null;
    hasSecret: boolean;
    enabled: boolean;
    intervalSec: number;
    lastPolledAt: string | null;
    lastError: string | null;
};

const TRACKERS: Tracker[] = ["jira", "linear", "github", "custom"];

const EMPTY = {
    tracker: "jira" as Tracker,
    assignee: "",
    agentId: "",
    baseUrl: "",
    projectFilter: "",
    secretRef: "",
    intervalSec: 300,
    customConfig: "",
};

const inputCls =
    "mt-1 w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-2 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]";

export default function TaskSourcesPage() {
    const [sources, setSources] = useState<PollSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({ ...EMPTY });
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/tracker-poll-sources", { cache: "no-store" });
            const data = await res.json();
            setSources(Array.isArray(data.sources) ? data.sources : []);
            setError(res.ok ? null : data.message ?? data.error ?? "Failed to load");
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    async function create() {
        setSaving(true);
        setError(null);
        try {
            const payload: Record<string, unknown> = {
                tracker: form.tracker,
                assignee: form.assignee.trim(),
                agentId: form.agentId.trim() || undefined,
                baseUrl: form.baseUrl.trim() || undefined,
                projectFilter: form.projectFilter.trim() || undefined,
                secretRef: form.secretRef.trim() || undefined,
                intervalSec: Number(form.intervalSec) || 300,
            };
            if (form.tracker === "custom" && form.customConfig.trim()) {
                try {
                    payload.customConfig = JSON.parse(form.customConfig);
                } catch {
                    setError("Custom config must be valid JSON");
                    setSaving(false);
                    return;
                }
            }
            const res = await fetch("/api/tracker-poll-sources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message ?? data.error ?? "Create failed");
            } else {
                setForm({ ...EMPTY });
                setShowForm(false);
                await load();
            }
        } finally {
            setSaving(false);
        }
    }

    async function toggle(s: PollSource) {
        await fetch(`/api/tracker-poll-sources/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: !s.enabled }),
        });
        await load();
    }

    async function remove(s: PollSource) {
        if (!confirm(`Delete ${s.tracker} task source for "${s.assignee}"?`)) return;
        await fetch(`/api/tracker-poll-sources/${s.id}`, { method: "DELETE" });
        await load();
    }

    return (
        <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-start justify-between mb-2">
                <div>
                    <h1 className="text-2xl font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Task Sources</h1>
                    <p className="text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1 max-w-2xl">
                        Have an agent pull tickets assigned to it. Use Jira, Linear, or GitHub out of the box, or any
                        other tracker via a custom REST mapping. Tickets that arrive outside the agent&apos;s shift are
                        deferred to its next working window.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => void load()}
                        className="flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:border-[color:var(--line)]"
                    >
                        <RefreshCw className="w-4 h-4" /> Refresh
                    </button>
                    <button
                        onClick={() => setShowForm((v) => !v)}
                        className="flex items-center gap-1.5 rounded-[3px] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--accent)]"
                    >
                        <Plus className="w-4 h-4" /> Add source
                    </button>
                </div>
            </div>

            {error && (
                <div className="my-4 flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 px-3 py-2 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                    <AlertCircle className="w-4 h-4" /> {error}
                </div>
            )}

            {showForm && (
                <div className="my-5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)]/40 p-5">
                    <div className="grid grid-cols-2 gap-4">
                        <label className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Tracker
                            <select
                                className={inputCls}
                                value={form.tracker}
                                onChange={(e) => setForm({ ...form, tracker: e.target.value as Tracker })}
                            >
                                {TRACKERS.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Assignee
                            <input
                                className={inputCls}
                                placeholder="email / username / id"
                                value={form.assignee}
                                onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                            />
                        </label>
                        <label className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Agent / Bot ID (optional)
                            <input
                                className={inputCls}
                                placeholder="bot_..."
                                value={form.agentId}
                                onChange={(e) => setForm({ ...form, agentId: e.target.value })}
                            />
                        </label>
                        <label className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Base URL {form.tracker === "github" ? "(optional)" : ""}
                            <input
                                className={inputCls}
                                placeholder="https://acme.atlassian.net"
                                value={form.baseUrl}
                                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                            />
                        </label>
                        <label className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Project filter {form.tracker === "github" ? "(owner/repo)" : "(optional)"}
                            <input
                                className={inputCls}
                                placeholder={form.tracker === "github" ? "owner/repo" : "PROJ"}
                                value={form.projectFilter}
                                onChange={(e) => setForm({ ...form, projectFilter: e.target.value })}
                            />
                        </label>
                        <label className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            API token / secret ref
                            <input
                                className={inputCls}
                                type="password"
                                placeholder="token or env://VAR"
                                value={form.secretRef}
                                onChange={(e) => setForm({ ...form, secretRef: e.target.value })}
                            />
                        </label>
                        <label className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                            Poll interval (seconds)
                            <input
                                className={inputCls}
                                type="number"
                                min={30}
                                value={form.intervalSec}
                                onChange={(e) => setForm({ ...form, intervalSec: Number(e.target.value) })}
                            />
                        </label>
                        {form.tracker === "custom" && (
                            <label className="col-span-2 text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                Custom config (JSON)
                                <textarea
                                    className={`${inputCls} font-mono text-xs`}
                                    rows={6}
                                    placeholder={'{\n  "url": "/tasks?assignee={{assignee}}",\n  "auth": "bearer",\n  "itemsPath": "data",\n  "idField": "gid",\n  "titleField": "name"\n}'}
                                    value={form.customConfig}
                                    onChange={(e) => setForm({ ...form, customConfig: e.target.value })}
                                />
                            </label>
                        )}
                    </div>
                    <button
                        onClick={() => void create()}
                        disabled={saving || !form.assignee.trim()}
                        className="mt-4 rounded-[3px] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent)] disabled:opacity-50"
                    >
                        {saving ? "Adding…" : "Save source"}
                    </button>
                </div>
            )}

            <div className="mt-6 space-y-3">
                {loading ? (
                    <p className="text-sm text-[color:var(--ink-muted)]">Loading…</p>
                ) : sources.length === 0 ? (
                    <p className="text-sm text-[color:var(--ink-muted)]">No task sources configured yet.</p>
                ) : (
                    sources.map((s) => (
                        <div
                            key={s.id}
                            className="flex items-center justify-between rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-4 py-3"
                        >
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-[2px] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-2 py-0.5 text-xs font-semibold uppercase text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                        {s.tracker}
                                    </span>
                                    <span className="font-medium text-[color:var(--ink)] dark:text-[color:var(--ink)]">{s.assignee}</span>
                                    {s.projectFilter && (
                                        <span className="text-xs text-[color:var(--ink-muted)]">· {s.projectFilter}</span>
                                    )}
                                </div>
                                <div className="mt-1 flex items-center gap-3 text-xs text-[color:var(--ink-muted)]">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> every {s.intervalSec}s
                                    </span>
                                    <span>
                                        last poll: {s.lastPolledAt ? new Date(s.lastPolledAt).toLocaleString() : "never"}
                                    </span>
                                    {!s.hasSecret && <span className="text-[color:var(--warn)]">no credentials</span>}
                                </div>
                                {s.lastError && <p className="mt-1 text-xs text-[color:var(--danger)]">{s.lastError}</p>}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => void toggle(s)}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                        s.enabled
                                            ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 text-[color:var(--ok)] dark:text-[color:var(--ok)]"
                                            : "bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)]"
                                    }`}
                                >
                                    {s.enabled ? "enabled" : "disabled"}
                                </button>
                                <button
                                    onClick={() => void remove(s)}
                                    className="text-[color:var(--ink-muted)] hover:text-[color:var(--danger)]"
                                    aria-label="delete"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
