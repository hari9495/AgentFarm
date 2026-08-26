"use client";

import { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    LifeBuoy,
    Plus,
    RefreshCw,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type IssueStatus = "open" | "diagnosing" | "fixing" | "escalated" | "resolved";
type IssueSeverity = "critical" | "high" | "medium" | "low";

type ChatMessage = { id?: string; role: string; content: string; createdAt?: string };
type IssueStep = { id?: string; label?: string; status?: string; detail?: string };

type Issue = {
    id: string;
    title: string;
    description: string;
    status: IssueStatus;
    severity: IssueSeverity;
    tierReached: number | null;
    fixApplied: boolean;
    escalatedTo: string | null;
    prUrl: string | null;
    diagnosisReport?: string | null;
    resolutionNotes?: string | null;
    createdAt: string;
    resolvedAt: string | null;
    steps?: IssueStep[];
    messages?: ChatMessage[];
};

const STATUS_LABEL: Record<IssueStatus, string> = {
    open: "Open",
    diagnosing: "Diagnosing",
    fixing: "Fixing",
    escalated: "Escalated",
    resolved: "Resolved",
};

const STATUS_BADGE: Record<IssueStatus, string> = {
    open: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
    diagnosing: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
    fixing: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400",
    escalated: "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400",
    resolved: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
};

const SEVERITY_DOT: Record<IssueSeverity, string> = {
    critical: "bg-rose-500",
    high: "bg-amber-500",
    medium: "bg-amber-400",
    low: "bg-emerald-500",
};

const SEVERITIES: IssueSeverity[] = ["low", "medium", "high", "critical"];

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
}

const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40";

export default function SupportPage() {
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [detailCache, setDetailCache] = useState<Record<string, Issue>>({});
    const [detailLoading, setDetailLoading] = useState<string | null>(null);

    const [showForm, setShowForm] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [severity, setSeverity] = useState<IssueSeverity>("medium");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadState("loading");
        try {
            const res = await fetch("/api/support/issues", { credentials: "include" });
            if (!res.ok) throw new Error("failed");
            const data = (await res.json()) as { issues?: Issue[] };
            setIssues(data.issues ?? []);
            setLoadState("ready");
        } catch {
            setLoadState("error");
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function toggleExpand(issue: Issue) {
        if (expanded === issue.id) {
            setExpanded(null);
            return;
        }
        setExpanded(issue.id);
        if (!detailCache[issue.id]) {
            setDetailLoading(issue.id);
            try {
                const res = await fetch(`/api/support/issues/${encodeURIComponent(issue.id)}`, { credentials: "include" });
                if (res.ok) {
                    const data = (await res.json()) as Issue;
                    setDetailCache((prev) => ({ ...prev, [issue.id]: data }));
                }
            } finally {
                setDetailLoading(null);
            }
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!description.trim()) {
            setSubmitError("A description is required.");
            return;
        }
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await fetch("/api/support/issues", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: title.trim() || undefined, description: description.trim(), severity }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(typeof data?.error === "string" ? data.error : "Unable to file this issue right now.");
            }
            setTitle("");
            setDescription("");
            setSeverity("medium");
            setShowForm(false);
            await load();
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : "Unable to file this issue right now.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(56,189,248,0.16)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                        <div>
                            <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-blue-300 w-fit mb-4">
                                <PremiumIcon icon={LifeBuoy} tone="sky" containerClassName="w-4 h-4 rounded bg-blue-400/20 text-blue-300" iconClassName="w-2.5 h-2.5" />
                                Support
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">Support &amp; issues</h1>
                            <p className="mt-2 text-slate-600 text-base max-w-lg">
                                File an issue and our support agent will diagnose it, attempt a fix, and keep you posted here — escalating to a human when needed.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowForm((v) => !v)}
                            className="inline-flex items-center gap-2 rounded-xl bg-white text-slate-900 text-sm font-bold px-4 py-2.5 hover:bg-slate-100 transition-colors shrink-0"
                        >
                            <Plus className="w-4 h-4" />
                            New issue
                        </button>
                    </div>
                </section>

                {showForm && (
                    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Describe what's going wrong</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Title (optional)</label>
                                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Outreach emails aren't sending" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">What's happening? *</label>
                                <textarea className={`${inputClass} min-h-[110px]`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Include what you expected, what happened instead, and any error messages." required />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Severity</label>
                                <select className={inputClass} value={severity} onChange={(e) => setSeverity(e.target.value as IssueSeverity)}>
                                    {SEVERITIES.map((s) => (
                                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {submitError && (
                            <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> {submitError}
                            </p>
                        )}
                        <div className="flex items-center gap-3">
                            <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 dark:bg-white text-white dark:text-slate-900 text-sm font-bold px-4 py-2 disabled:opacity-60">
                                {submitting ? "Filing…" : "File issue"}
                            </button>
                            <button type="button" onClick={() => setShowForm(false)} className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                                Cancel
                            </button>
                        </div>
                    </form>
                )}

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Your issues</h2>
                        <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                        </button>
                    </div>

                    {loadState === "loading" && (
                        <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">Loading your issues…</div>
                    )}
                    {loadState === "error" && (
                        <div className="px-5 py-10 text-center text-sm text-rose-600 dark:text-rose-400">
                            We couldn't load your support issues right now. Try refreshing, or use "New issue" to reach us directly.
                        </div>
                    )}
                    {loadState === "ready" && issues.length === 0 && (
                        <div className="px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                            No support issues on file. If something's not working, click "New issue" and we'll take a look.
                        </div>
                    )}
                    {loadState === "ready" && issues.length > 0 && (
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800/70">
                            {issues.map((issue) => {
                                const detail = detailCache[issue.id];
                                const isOpen = expanded === issue.id;
                                return (
                                    <li key={issue.id}>
                                        <button
                                            type="button"
                                            onClick={() => void toggleExpand(issue)}
                                            className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                                        >
                                            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[issue.severity]}`} title={`${issue.severity} severity`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{issue.title || "Untitled issue"}</span>
                                                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${STATUS_BADGE[issue.status]}`}>{STATUS_LABEL[issue.status]}</span>
                                                    {issue.prUrl && (
                                                        <a href={issue.prUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                                            View fix PR →
                                                        </a>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">{issue.description}</p>
                                                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Filed {formatDate(issue.createdAt)}{issue.resolvedAt ? ` · resolved ${formatDate(issue.resolvedAt)}` : ""}</p>
                                            </div>
                                            {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400 mt-1 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 mt-1 shrink-0" />}
                                        </button>
                                        {isOpen && (
                                            <div className="px-5 pb-5 pl-[2.1rem] space-y-3">
                                                {detailLoading === issue.id && !detail && (
                                                    <p className="text-xs text-slate-400 dark:text-slate-500">Loading details…</p>
                                                )}
                                                {detail?.diagnosisReport && (
                                                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
                                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Diagnosis</p>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{detail.diagnosisReport}</p>
                                                    </div>
                                                )}
                                                {detail?.resolutionNotes && (
                                                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2.5">
                                                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Resolution notes</p>
                                                        <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 whitespace-pre-wrap">{detail.resolutionNotes}</p>
                                                    </div>
                                                )}
                                                {detail?.escalatedTo && (
                                                    <p className="text-xs text-rose-600 dark:text-rose-400">Escalated to {detail.escalatedTo}</p>
                                                )}
                                                {detail?.steps && detail.steps.length > 0 && (
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Progress</p>
                                                        <ul className="space-y-1">
                                                            {detail.steps.map((step, idx) => (
                                                                <li key={step.id ?? idx} className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                                                                    {step.label ?? "Step"}{step.status ? ` — ${step.status}` : ""}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {detail?.messages && detail.messages.length > 0 && (
                                                    <div>
                                                        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Conversation</p>
                                                        <ul className="space-y-1.5">
                                                            {detail.messages.map((msg, idx) => (
                                                                <li key={msg.id ?? idx} className="text-xs text-slate-500 dark:text-slate-400">
                                                                    <span className="font-semibold text-slate-600 dark:text-slate-300">{msg.role}: </span>
                                                                    {msg.content}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {detail && !detail.diagnosisReport && !detail.resolutionNotes && (!detail.steps || detail.steps.length === 0) && (!detail.messages || detail.messages.length === 0) && (
                                                    <p className="text-xs text-slate-400 dark:text-slate-500">No further activity yet — we'll update this issue as our support agent investigates.</p>
                                                )}
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
