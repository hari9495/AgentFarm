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
    if (outcome === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
    if (outcome === "failed" || outcome === "error") return <XCircle className="h-4 w-4 text-rose-500 shrink-0" />;
    if (outcome === "rejected") return <XCircle className="h-4 w-4 text-orange-400 shrink-0" />;
    if (outcome === "cancelled") return <XCircle className="h-4 w-4 text-slate-400 shrink-0" />;
    return <Clock className="h-4 w-4 text-amber-500 shrink-0" />;
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
                setTasks(data.tasks ?? []);
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
        const id = setInterval(() => void fetchTasks(selectedBotId), 2_000);
        return () => clearInterval(id);
    }, [tasks, selectedBotId, fetchTasks]);

    // After a successful submit, poll for a short window so the new task surfaces
    // even though the POST returns 202 before the task is queryable. Independent
    // of the pending-task guard above so it works from an empty list.
    useEffect(() => {
        if (submitNonce === 0) return;
        let count = 0;
        const id = setInterval(() => {
            count += 1;
            void fetchTasks(selectedBotId);
            if (count >= 8) clearInterval(id);
        }, 2_000);
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
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

                {/* Header */}
                <section className="relative overflow-hidden rounded-2xl bg-slate-950">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 py-6">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="flex items-center gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-sky-400">
                                <Play className="w-3.5 h-3.5" />
                                Tasks
                            </div>
                        </div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">Submit a Task</h1>
                        <p className="mt-2 text-slate-400 text-sm max-w-xl">
                            Run any AI agent on demand. Pick an agent, describe the goal, and optionally wire a connector action.
                        </p>
                    </div>
                </section>

                {agents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-16 text-center">
                        <Play className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                        <h2 className="mt-3 text-sm font-bold text-slate-900 dark:text-slate-100">No agents deployed</h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Deploy an agent first before submitting tasks.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                        {/* Submission form */}
                        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">New Task</h2>

                            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                                {/* Agent selector */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                                        Agent
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedBotId}
                                            onChange={(e) => setSelectedBotId(e.target.value)}
                                            className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 pr-8 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                        >
                                            {agents.map((a) => (
                                                <option key={a.id} value={a.id}>
                                                    {a.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                    </div>
                                    {selectedAgent && (
                                        <p className="mt-1 text-[11px] text-slate-400 truncate">
                                            {selectedAgent.workspace?.name} · {selectedAgent.id.slice(0, 12)}…
                                        </p>
                                    )}
                                </div>

                                {/* Prompt */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                                        Prompt / Goal
                                    </label>
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        rows={4}
                                        placeholder="Describe what you want the agent to do…"
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                                    />
                                </div>

                                {/* Connector type */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                                        Connector (optional)
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={connectorType}
                                            onChange={(e) => handleConnectorChange(e.target.value)}
                                            className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 pr-8 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                        >
                                            {CONNECTOR_OPTIONS.map((o) => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Action type */}
                                {connectorType && availableActions.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                                            Action
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={actionType}
                                                onChange={(e) => setActionType(e.target.value)}
                                                className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 pr-8 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                            >
                                                <option value="">Select action…</option>
                                                {availableActions.map((a) => (
                                                    <option key={a.value} value={a.value}>{a.label}</option>
                                                ))}
                                            </select>
                                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                        </div>
                                    </div>
                                )}

                                {/* Connector params */}
                                {connectorType && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                                            Params (JSON, optional)
                                        </label>
                                        <textarea
                                            value={connectorParams}
                                            onChange={(e) => setConnectorParams(e.target.value)}
                                            rows={3}
                                            placeholder={'{"owner":"org","repo":"repo-name"}'}
                                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                                        />
                                    </div>
                                )}

                                {/* Error / success */}
                                {submitError && (
                                    <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-3 py-2.5 text-xs text-rose-700 dark:text-rose-400">
                                        {submitError}
                                    </div>
                                )}
                                {lastSubmitted && (
                                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-400">
                                        Task queued — ID: <span className="font-mono">{lastSubmitted}</span>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={submitting || (!prompt.trim() && !actionType)}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors"
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
                        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Task History</h2>
                                <button
                                    onClick={() => void fetchTasks(selectedBotId)}
                                    disabled={loadingTasks}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${loadingTasks ? "animate-spin" : ""}`} />
                                    Refresh
                                </button>
                            </div>

                            {loadingTasks && tasks.length === 0 ? (
                                <div className="flex items-center justify-center py-16 text-slate-400">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                </div>
                            ) : tasks.length === 0 ? (
                                <div className="px-5 py-16 text-center">
                                    <Clock className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
                                    <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">No tasks yet</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Submit a task above to see results here.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {tasks.map((task) => {
                                        const key = task.taskId ?? task.id;
                                        const isExpanded = expandedTaskId === key;
                                        return (
                                            <div key={task.id}>
                                                <div
                                                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer select-none"
                                                    onClick={() => handleRowClick(task)}
                                                >
                                                    <div className="mt-0.5">{outcomeIcon(task.outcome)}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                                {key.slice(0, 16)}
                                                            </span>
                                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                                task.outcome === "success"
                                                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                                                    : task.outcome === "failed" || task.outcome === "error"
                                                                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                                                                        : task.outcome === "rejected"
                                                                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                                                                        : task.outcome === "cancelled"
                                                                            ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                                                            : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                                            }`}>
                                                                {task.outcome}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
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
                                                    </div>
                                                    <ChevronRight className={`h-3.5 w-3.5 shrink-0 mt-1 text-slate-300 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                                </div>

                                                {isExpanded && (
                                                    <div className="px-5 pb-4 pt-3 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 space-y-3">
                                                        {/* Prompt */}
                                                        {task.taskPrompt && (
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Your Request</p>
                                                                <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 whitespace-pre-wrap">{task.taskPrompt}</p>
                                                            </div>
                                                        )}
                                                        {/* Output */}
                                                        {task.outputSummary && (
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Agent Output</p>
                                                                <p className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 whitespace-pre-wrap max-h-48 overflow-y-auto">{formatAgentOutput(task.outputSummary)}</p>
                                                            </div>
                                                        )}
                                                        {(task.outcome === "cancelled" || task.outcome === "rejected") && (
                                                            <p className="text-xs text-slate-400 italic">
                                                                Task was {task.outcome} before execution — no output available.
                                                            </p>
                                                        )}
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-xs pt-1">
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Task ID</p>
                                                                <p className="font-mono text-slate-600 dark:text-slate-300 break-all">{task.taskId ?? task.id}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Provider</p>
                                                                <p className="text-slate-600 dark:text-slate-300">{task.modelProvider || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Model</p>
                                                                <p className="text-slate-600 dark:text-slate-300 truncate">{task.modelProfile || "—"}</p>
                                                            </div>
                                                            {task.modelTier && (
                                                                <div>
                                                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Tier</p>
                                                                    <p className="text-slate-600 dark:text-slate-300">{task.modelTier}</p>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Prompt tokens</p>
                                                                <p className="text-slate-600 dark:text-slate-300">{task.promptTokens ?? "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Completion tokens</p>
                                                                <p className="text-slate-600 dark:text-slate-300">{task.completionTokens ?? "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Total tokens</p>
                                                                <p className="text-slate-600 dark:text-slate-300">{task.totalTokens ?? "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Cost</p>
                                                                <p className="text-slate-600 dark:text-slate-300">{formatCost(task.estimatedCostUsd)}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">Duration</p>
                                                                <p className="text-slate-600 dark:text-slate-300">{formatLatency(task.latencyMs)}</p>
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
