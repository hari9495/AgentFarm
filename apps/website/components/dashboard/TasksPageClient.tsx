"use client";

import { useState, useEffect, useCallback } from "react";
import { Play, RefreshCw, CheckCircle2, XCircle, Clock, Loader2, ChevronDown, ChevronRight } from "lucide-react";

interface Agent {
    id: string;
    role: string;
    status: string;
    workspace: { name: string } | null;
}

interface TaskRecord {
    id: string;
    taskId: string;
    outcome: string;
    latencyMs: number;
    estimatedCostUsd: number | null;
    createdAt: string;
    modelProfile: string;
    modelProvider: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    modelTier: string | null;
    taskPrompt: string | null;
    outputSummary: string | null;
    /** Client-only: a placeholder row shown instantly on submit until the server returns the real record. */
    __optimistic?: boolean;
}

const CONNECTOR_OPTIONS = [
    { value: "", label: "None (LLM only)" },
    { value: "github", label: "GitHub" },
    { value: "jira", label: "Jira" },
    { value: "slack", label: "Slack" },
    { value: "linear", label: "Linear" },
];

const ACTION_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
    github: [
        { value: "list_prs", label: "List Pull Requests" },
        { value: "create_pr", label: "Create Pull Request" },
        { value: "create_pr_comment", label: "Comment on PR" },
        { value: "read_task", label: "Read Issue" },
    ],
    jira: [
        { value: "read_task", label: "Read Task" },
        { value: "update_status", label: "Update Status" },
        { value: "create_comment", label: "Add Comment" },
    ],
    slack: [
        { value: "send_message", label: "Send Message" },
    ],
    linear: [
        { value: "read_task", label: "Read Issue" },
        { value: "update_status", label: "Update Status" },
    ],
};

const outcomeIcon = (outcome: string) => {
    if (outcome === "success") return <CheckCircle2 className="h-4 w-4 text-[color:var(--ok)] shrink-0" />;
    if (outcome === "failed" || outcome === "error") return <XCircle className="h-4 w-4 text-[color:var(--danger)] shrink-0" />;
    if (outcome === "rejected") return <XCircle className="h-4 w-4 text-[color:var(--warn)] shrink-0" />;
    if (outcome === "cancelled") return <XCircle className="h-4 w-4 text-[color:var(--ink-muted)] shrink-0" />;
    return <Clock className="h-4 w-4 text-[color:var(--warn)] shrink-0" />;
};

const formatLatency = (ms: number) =>
    ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

const formatCost = (usd: number | null) =>
    usd == null ? "—" : usd < 0.001 ? "<$0.001" : `$${usd.toFixed(3)}`;

const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
};

function formatAgentOutput(raw: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return raw;
    }

    if (typeof parsed !== "object" || parsed === null) return raw;
    const obj = parsed as Record<string, unknown>;
    const lines: string[] = [];

    if (typeof obj["log"] === "string") {
        for (const line of obj["log"].split("\n").filter(Boolean)) {
            const parts = line.split(":");
            const type = parts[1];
            if (type === "step") {
                lines.push(`Step ${parts[2]}: ${parts.slice(3).join(":")}`);
            } else if (type === "action") {
                const name = (parts[2] ?? "").replace(/_/g, " ");
                const status = parts[3];
                const detail = parts.slice(4).join(":").trim();
                if (status === "skipped") {
                    lines.push(`  Skipped ${name}${detail ? ` — ${detail}` : ""}`);
                } else if (status === "success") {
                    lines.push(`  Completed: ${name}`);
                } else {
                    lines.push(`  ${name}${detail ? `: ${detail}` : ""}`);
                }
            } else if (type === "attempt") {
                const what = parts[3];
                if (what === "success") lines.push(`Verification passed`);
                else if (what === "tests") lines.push(`Running tests…`);
                else if (what === "build") lines.push(`Building…`);
                else lines.push(`${what}`);
            } else {
                lines.push(line);
            }
        }
    }

    if (Array.isArray(obj["attempts"])) {
        const last = obj["attempts"][obj["attempts"].length - 1] as Record<string, unknown> | undefined;
        if (last) {
            lines.push("");
            lines.push(last["passed"] ? "Result: All checks passed ✓" : "Result: Some checks failed ✗");
            if (typeof last["test_output"] === "string" && last["test_output"].trim()) {
                const excerpt = last["test_output"].trim().slice(0, 300);
                lines.push(`Output: ${excerpt}${last["test_output"].trim().length > 300 ? "…" : ""}`);
            }
        }
    }

    if (typeof obj["summary"] === "string") return obj["summary"];
    if (typeof obj["result"] === "string") return obj["result"];
    if (typeof obj["message"] === "string") return obj["message"];

    return lines.length > 0 ? lines.join("\n") : JSON.stringify(parsed, null, 2);
}

export default function TasksPageClient({ agents }: { agents: Agent[] }) {
    const [selectedBotId, setSelectedBotId] = useState<string>(agents[0]?.id ?? "");
    const [prompt, setPrompt] = useState("");
    const [connectorType, setConnectorType] = useState("");
    const [actionType, setActionType] = useState("");
    const [connectorParams, setConnectorParams] = useState("");
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    // Bumped on every successful submit to drive a short polling window — the
    // POST returns 202 before the task is queryable, so a single delayed fetch
    // can miss it and (with no pending task loaded) the 10s auto-refresh never starts.
    const [submitNonce, setSubmitNonce] = useState(0);

    const handleRowClick = (task: TaskRecord) => {
        const key = task.taskId ?? task.id;
        setExpandedTaskId((prev) => (prev === key ? null : key));
    };

    const availableActions = ACTION_OPTIONS[connectorType] ?? [];

    const fetchTasks = useCallback(async (botId: string) => {
        if (!botId) return;
        setLoadingTasks(true);
        try {
            const res = await fetch(`/api/portal/agents/${encodeURIComponent(botId)}/tasks?limit=20`);
            if (res.ok) {
                const data = (await res.json()) as { tasks?: TaskRecord[] };
                const serverTasks = data.tasks ?? [];
                // Merge: keep any optimistic placeholder rows the server hasn't returned yet,
                // so a just-submitted task never flickers out before it's queryable.
                setTasks((prev) => {
                    const serverIds = new Set(serverTasks.map((t) => t.taskId ?? t.id));
                    const stillPending = prev.filter((t) => t.__optimistic && !serverIds.has(t.taskId ?? t.id));
                    return [...stillPending, ...serverTasks];
                });
            }
        } finally {
            setLoadingTasks(false);
        }
    }, []);

    useEffect(() => {
        void fetchTasks(selectedBotId);
    }, [selectedBotId, fetchTasks]);

    // Auto-refresh every 5s while any task is in a non-terminal state
    useEffect(() => {
        const hasLive = tasks.some((t) =>
            t.outcome === "pending" || t.outcome === "running" || t.outcome === "approval_queued"
        );
        if (!hasLive) return;
        const id = setInterval(() => void fetchTasks(selectedBotId), 1_500);
        return () => clearInterval(id);
    }, [tasks, selectedBotId, fetchTasks]);

    // After a successful submit, poll for a short window so the new task surfaces
    // even though the POST returns 202 before the task is queryable. Independent
    // of the pending-task guard above so it works from an empty list.
    useEffect(() => {
        if (submitNonce === 0) return;
        void fetchTasks(selectedBotId); // fetch immediately, don't wait for the first interval tick
        let count = 0;
        const id = setInterval(() => {
            count += 1;
            void fetchTasks(selectedBotId);
            if (count >= 15) clearInterval(id);
        }, 1_000);
        return () => clearInterval(id);
    }, [submitNonce, selectedBotId, fetchTasks]);

    const handleConnectorChange = (val: string) => {
        setConnectorType(val);
        setActionType("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedBotId) return;
        setSubmitting(true);
        setSubmitError(null);
        setLastSubmitted(null);

        let parsedParams: Record<string, unknown> | undefined;
        if (connectorParams.trim()) {
            try {
                parsedParams = JSON.parse(connectorParams) as Record<string, unknown>;
            } catch {
                setSubmitError("Connector params must be valid JSON.");
                setSubmitting(false);
                return;
            }
        }

        try {
            const body: Record<string, unknown> = { prompt };
            if (connectorType) body["connector_type"] = connectorType;
            if (actionType) body["action_type"] = actionType;
            if (parsedParams) body["connector_params"] = parsedParams;

            const res = await fetch(`/api/portal/agents/${encodeURIComponent(selectedBotId)}/tasks`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });

            const data = (await res.json()) as { task_id?: string; error?: string; detail?: string };

            if (!res.ok) {
                setSubmitError(data.error ?? data.detail ?? `Error ${res.status}`);
            } else {
                setLastSubmitted(data.task_id ?? null);
                // Optimistically show the new task instantly (POST returns 202 before
                // it's queryable). The merge in fetchTasks reconciles it with the real row.
                if (data.task_id) {
                    const submittedPrompt = prompt;
                    setTasks((prev) => [
                        {
                            id: data.task_id!,
                            taskId: data.task_id!,
                            outcome: "pending",
                            latencyMs: 0,
                            estimatedCostUsd: null,
                            createdAt: new Date().toISOString(),
                            modelProfile: "",
                            modelProvider: "",
                            promptTokens: null,
                            completionTokens: null,
                            totalTokens: null,
                            modelTier: null,
                            taskPrompt: submittedPrompt,
                            outputSummary: null,
                            __optimistic: true,
                        },
                        ...prev.filter((t) => (t.taskId ?? t.id) !== data.task_id),
                    ]);
                }
                setPrompt("");
                // Kick off the post-submit polling window (see effect above).
                setSubmitNonce((n) => n + 1);
            }
        } catch (err) {
            setSubmitError(String(err));
        } finally {
            setSubmitting(false);
        }
    };

    const selectedAgent = agents.find((a) => a.id === selectedBotId);

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

                {/* Header */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 py-6">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <Play className="w-3.5 h-3.5" />
                                Tasks
                            </div>
                        </div>
                        <h1 className="text-3xl font-extrabold text-[color:var(--ink)] tracking-tight">Submit a Task</h1>
                        <p className="mt-2 text-[color:var(--ink-muted)] text-sm max-w-xl">
                            Run any AI agent on demand. Pick an agent, describe the goal, and optionally wire a connector action.
                        </p>
                    </div>
                </section>

                {agents.length === 0 ? (
                    <div className="rounded-[4px] border border-dashed border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-6 py-16 text-center">
                        <Play className="mx-auto h-8 w-8 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]" />
                        <h2 className="mt-3 text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">No agents deployed</h2>
                        <p className="mt-1 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">Deploy an agent first before submitting tasks.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                        {/* Submission form */}
                        <div className="lg:col-span-2 bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] shadow-sm p-5 space-y-4">
                            <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">New Task</h2>

                            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                                {/* Agent selector */}
                                <div>
                                    <label className="block text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1.5 uppercase tracking-wide">
                                        Agent
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedBotId}
                                            onChange={(e) => setSelectedBotId(e.target.value)}
                                            className="w-full appearance-none rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 pr-8 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] focus:border-transparent"
                                        >
                                            {agents.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)] pointer-events-none" />
                                    </div>
                                    {selectedAgent && (
                                        <p className="mt-1 text-[11px] text-[color:var(--ink-muted)] truncate">
                                            {selectedAgent.workspace?.name} · {selectedAgent.id.slice(0, 12)}…
                                        </p>
                                    )}
                                </div>

                                {/* Prompt */}
                                <div>
                                    <label className="block text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1.5 uppercase tracking-wide">
                                        Prompt / Goal
                                    </label>
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        rows={4}
                                        placeholder="Describe what you want the agent to do…"
                                        className="w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] resize-none"
                                    />
                                </div>

                                {/* Connector type */}
                                <div>
                                    <label className="block text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1.5 uppercase tracking-wide">
                                        Connector (optional)
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={connectorType}
                                            onChange={(e) => handleConnectorChange(e.target.value)}
                                            className="w-full appearance-none rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 pr-8 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                                        >
                                            {CONNECTOR_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)] pointer-events-none" />
                                    </div>
                                </div>

                                {/* Action type */}
                                {connectorType && availableActions.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1.5 uppercase tracking-wide">
                                            Action
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={actionType}
                                                onChange={(e) => setActionType(e.target.value)}
                                                className="w-full appearance-none rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 pr-8 text-sm text-[color:var(--ink)] dark:text-[color:var(--ink)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                                            >
                                                <option value="">Select action…</option>
                                                {availableActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--ink-muted)] pointer-events-none" />
                                        </div>
                                    </div>
                                )}

                                {/* Connector params */}
                                {connectorType && (
                                    <div>
                                        <label className="block text-xs font-semibold text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mb-1.5 uppercase tracking-wide">
                                            Params (JSON, optional)
                                        </label>
                                        <textarea
                                            value={connectorParams}
                                            onChange={(e) => setConnectorParams(e.target.value)}
                                            rows={3}
                                            placeholder={'{"owner":"org","repo":"repo-name"}'}
                                            className="w-full rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--bg-deep)] dark:bg-[var(--card)] px-3 py-2.5 text-sm font-mono text-[color:var(--ink)] dark:text-[color:var(--ink)] placeholder:text-[color:var(--ink-muted)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] resize-none"
                                        />
                                    </div>
                                )}

                                {/* Error / success */}
                                {submitError && (
                                    <div className="rounded-[3px] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-3 py-2.5 text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                                        {submitError}
                                    </div>
                                )}
                                {lastSubmitted && (
                                    <div className="rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)] px-3 py-2.5 text-xs text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                                        Task queued — ID: <span className="font-mono">{lastSubmitted}</span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={submitting || (!prompt.trim() && !actionType)}
                                    className="w-full flex items-center justify-center gap-2 rounded-[3px] bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                                >
                                    {submitting ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
                                    ) : (
                                        <><Play className="h-4 w-4" /> Run Task</>
                                    )}
                                </button>
                            </form>
                        </div>

                        {/* Task history */}
                        <div className="lg:col-span-3 bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--line)] dark:border-[color:var(--line)]">
                                <h2 className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">Task History</h2>
                                <button
                                    onClick={() => void fetchTasks(selectedBotId)}
                                    disabled={loadingTasks}
                                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-1.5 text-xs font-medium text-[color:var(--ink-muted)] hover:text-[color:var(--ink-soft)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] disabled:opacity-50 transition-colors"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${loadingTasks ? "animate-spin" : ""}`} />
                                    Refresh
                                </button>
                            </div>

                            {loadingTasks && tasks.length === 0 ? (
                                <div className="flex items-center justify-center py-16 text-[color:var(--ink-muted)]">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                            ) : tasks.length === 0 ? (
                                <div className="px-5 py-16 text-center">
                                    <Clock className="mx-auto h-8 w-8 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]" />
                                    <p className="mt-3 text-sm font-medium text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">No tasks yet</p>
                                    <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">Submit a task above to see results here.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[color:var(--line)] dark:divide-[color:var(--line)]">
                                    {tasks.map((task) => {
                                        const key = task.taskId ?? task.id;
                                        const isExpanded = expandedTaskId === key;
                                        return (
                                            <div key={task.id}>
                                                <div
                                                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/50 transition-colors cursor-pointer select-none"
                                                    onClick={() => handleRowClick(task)}
                                                >
                                                    <div className="mt-0.5">{outcomeIcon(task.outcome)}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-mono text-[11px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] truncate">
                                                                {key.slice(0, 16)}
                                                            </span>
                                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                                task.outcome === "success"
                                                                    ? "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]"
                                                                    : task.outcome === "failed" || task.outcome === "error"
                                                                        ? "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]"
                                                                        : task.outcome === "rejected"
                                                                        ? "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]"
                                                                        : task.outcome === "cancelled"
                                                                            ? "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]"
                                                                            : "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]"
                                                            }`}>
                                                                {task.outcome}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1 text-[11px] text-[color:var(--ink-muted)]">
                                                            <span>{formatDate(task.createdAt)}</span>
                                                            <span>·</span>
                                                            <span>{formatLatency(task.latencyMs)}</span>
                                                            <span>·</span>
                                                            <span>{formatCost(task.estimatedCostUsd)}</span>
                                                            {task.modelProfile && (
                                                                <>
                                                                    <span>·</span>
                                                                    <span className="truncate max-w-[100px]">{task.modelProfile}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        {/* Inline failure reason so customers see WHY without expanding */}
                                                        {(task.outcome === "failed" || task.outcome === "error") && task.outputSummary && !isExpanded && (
                                                            <p className="mt-1 text-[11px] text-[color:var(--danger)] dark:text-[color:var(--danger)] truncate">
                                                                {task.outputSummary}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 mt-1 text-[color:var(--ink-muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                                </div>

                                                {isExpanded && (
                                                    <div className="px-5 pb-4 pt-3 bg-[var(--bg-deep)] dark:bg-[var(--card)]/30 border-t border-[color:var(--line)] dark:border-[color:var(--line)] space-y-3">
                                                        {/* Prompt */}
                                                        {task.taskPrompt && (
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-1">Your Request</p>
                                                                <p className="text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink)] bg-[var(--card)] dark:bg-[var(--card)] rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 whitespace-pre-wrap">{task.taskPrompt}</p>
                                                            </div>
                                                        )}
                                                        {/* Failure reason — shown prominently so the customer knows WHY it failed */}
                                                        {(task.outcome === "failed" || task.outcome === "error") && task.outputSummary && (
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--danger)] mb-1">Why it failed</p>
                                                                <p className="text-xs text-[color:var(--danger)] dark:text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] px-3 py-2 whitespace-pre-wrap max-h-48 overflow-y-auto">{formatAgentOutput(task.outputSummary)}</p>
                                                            </div>
                                                        )}
                                                        {/* Output (success / other non-failure outcomes) */}
                                                        {task.outcome !== "failed" && task.outcome !== "error" && task.outputSummary && (
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-1">Agent Output</p>
                                                                <p className="text-xs text-[color:var(--ink-soft)] dark:text-[color:var(--ink)] bg-[var(--card)] dark:bg-[var(--card)] rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2 whitespace-pre-wrap max-h-48 overflow-y-auto">{formatAgentOutput(task.outputSummary)}</p>
                                                            </div>
                                                        )}
                                                        {(task.outcome === "failed" || task.outcome === "error") && !task.outputSummary && (
                                                            <p className="text-xs text-[color:var(--ink-muted)] italic">No failure detail was recorded for this task.</p>
                                                        )}
                                                        {(task.outcome === "cancelled" || task.outcome === "rejected") && (
                                                            <p className="text-xs text-[color:var(--ink-muted)] italic">
                                                                Task was {task.outcome} before execution — no output available.
                                                            </p>
                                                        )}
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs pt-1">
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Task ID</p>
                                                                <p className="font-mono text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] break-all">{task.taskId ?? task.id}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Provider</p>
                                                                <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{task.modelProvider || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Model</p>
                                                                <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] truncate">{task.modelProfile || "—"}</p>
                                                            </div>
                                                            {task.modelTier && (
                                                                <div>
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Tier</p>
                                                                    <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{task.modelTier}</p>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Prompt tokens</p>
                                                                <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{task.promptTokens ?? "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Completion tokens</p>
                                                                <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{task.completionTokens ?? "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Total tokens</p>
                                                                <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{task.totalTokens ?? "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Cost</p>
                                                                <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{formatCost(task.estimatedCostUsd)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ink-muted)] mb-0.5">Duration</p>
                                                                <p className="text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">{formatLatency(task.latencyMs)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}
