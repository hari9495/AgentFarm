"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ChevronDown, ChevronUp, ExternalLink, Star, CheckCircle2 } from "lucide-react";

type IssueStatus = "open" | "diagnosing" | "fixing" | "escalated" | "resolved";
type IssueSeverity = "critical" | "high" | "medium" | "low";

type ChatMessage = { id: string; role: string; content: string; createdAt: string };

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
    csatToken: string | null;
    csatRated: boolean;
    createdAt: string;
    resolvedAt: string | null;
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
    diagnosing: "bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400",
    fixing: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
    escalated: "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400",
    resolved: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
};

const SEVERITY_DOT: Record<IssueSeverity, string> = {
    critical: "bg-rose-500",
    high: "bg-amber-500",
    medium: "bg-amber-400",
    low: "bg-emerald-500",
};

const FILTERS = ["all", "open", "diagnosing", "fixing", "escalated", "resolved"] as const;

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function IssueHistoryPage() {
    const router = useRouter();
    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<IssueStatus | "all">("all");
    const [search, setSearch] = useState("");
    const [expanded, setExpanded] = useState<string | null>(null);
    const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        fetch("/api/portal/auth/me", { credentials: "same-origin" })
            .then((r) => { if (!r.ok) router.replace("/portal/login"); })
            .catch(() => router.replace("/portal/login"));
    }, [router]);

    const fetchIssues = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        const qs = filter !== "all" ? `?status=${filter}` : "";
        try {
            const r = await fetch(`/api/portal/support/issues${qs}`, { credentials: "same-origin" });
            if (r.status === 503) { setError("Issue history requires database connection."); return; }
            if (!r.ok) { setError("Failed to load issues."); return; }
            const data = (await r.json()) as { issues: Issue[] };
            setIssues(data.issues);
            setError(null);
        } catch {
            setError("Failed to load issues.");
        } finally {
            if (!silent) setLoading(false);
        }
    }, [filter]);

    useEffect(() => { void fetchIssues(); }, [fetchIssues]);

    // Auto-refresh every 20s while any issue is not yet resolved
    useEffect(() => {
        if (refreshRef.current) clearInterval(refreshRef.current);
        const hasActive = issues.some((i) => i.status !== "resolved");
        if (hasActive) {
            refreshRef.current = setInterval(() => { void fetchIssues(true); }, 20_000);
        }
        return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }, [issues, fetchIssues]);

    const q = search.trim().toLowerCase();
    const filtered = issues.filter((i) => {
        if (filter !== "all" && i.status !== filter) return false;
        if (q) return i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
        return true;
    });

    return (
        <div className="max-w-3xl space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Ticket history</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">All support tickets for your account</p>
                </div>
                <Link
                    href="/portal/support"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold shadow-sm transition-colors shrink-0"
                >
                    <Plus className="h-4 w-4" /> New ticket
                </Link>
            </div>

            {/* Search */}
            <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets by title or description…"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
            />

            {/* Filter tabs */}
            <div className="flex gap-1.5 flex-wrap">
                {FILTERS.map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setFilter(s)}
                        className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                            filter === s
                                ? "bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-600 text-white"
                                : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                        }`}
                    >
                        {s === "all" ? "All" : STATUS_LABEL[s as IssueStatus]}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading && <p className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">Loading…</p>}
            {error && (
                <div className="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-sm text-rose-700 dark:text-rose-400">
                    {error}
                </div>
            )}
            {!loading && !error && filtered.length === 0 && (
                <p className="text-center py-12 text-sm text-slate-400 dark:text-slate-500">
                    No tickets found.{" "}
                    <Link href="/portal/support" className="text-sky-600 hover:underline">Open a support chat</Link> to create one.
                </p>
            )}

            {!loading && !error && filtered.length > 0 && (
                <div className="flex flex-col gap-2.5">
                    {filtered.map((issue) => {
                        const isExpanded = expanded === issue.id;
                        const messageCount = issue.messages?.length ?? 0;
                        return (
                            <div key={issue.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                                <div className="p-4 flex items-start gap-3">
                                    <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${SEVERITY_DOT[issue.severity]}`} title={issue.severity} />

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{issue.title}</span>
                                            <span className={`px-2 py-0.5 rounded-full text-[0.7rem] font-semibold shrink-0 ${STATUS_BADGE[issue.status]}`}>
                                                {STATUS_LABEL[issue.status]}
                                            </span>
                                            {issue.fixApplied && (
                                                <span className="px-2 py-0.5 rounded-full text-[0.7rem] font-semibold shrink-0 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
                                                    <CheckCircle2 className="h-3 w-3" /> Fixed
                                                </span>
                                            )}
                                            {issue.escalatedTo && (
                                                <span className="px-2 py-0.5 rounded-full text-[0.7rem] font-semibold shrink-0 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400">
                                                    ↑ Tier {issue.tierReached ?? "?"} escalated
                                                </span>
                                            )}
                                            {issue.prUrl && (
                                                <a
                                                    href={issue.prUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-2 py-0.5 rounded-full text-[0.7rem] font-semibold shrink-0 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 hover:underline"
                                                >
                                                    <ExternalLink className="h-3 w-3" /> PR raised
                                                </a>
                                            )}
                                            {issue.csatToken && issue.csatRated && (
                                                <span className="px-2 py-0.5 rounded-full text-[0.7rem] font-semibold shrink-0 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Rated
                                                </span>
                                            )}
                                            {issue.csatToken && !issue.csatRated && issue.status === "resolved" && (
                                                <Link
                                                    href={`/portal/support/csat?token=${encodeURIComponent(issue.csatToken)}`}
                                                    className="px-2 py-0.5 rounded-full text-[0.7rem] font-semibold shrink-0 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 hover:underline inline-flex items-center gap-1"
                                                >
                                                    <Star className="h-3 w-3" /> Rate support
                                                </Link>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{issue.description}</p>
                                    </div>

                                    <div className="shrink-0 text-right text-xs text-slate-400 dark:text-slate-500 space-y-0.5">
                                        <div>{formatDate(issue.createdAt)}</div>
                                        {issue.resolvedAt && (
                                            <div className="text-emerald-600 dark:text-emerald-400">Resolved {formatDate(issue.resolvedAt)}</div>
                                        )}
                                        {issue.tierReached && <div>Tier {issue.tierReached}</div>}
                                        {messageCount > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setExpanded((prev) => (prev === issue.id ? null : issue.id))}
                                                className="inline-flex items-center gap-1 text-sky-600 hover:underline mt-0.5"
                                            >
                                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                {isExpanded ? "Hide chat" : `${messageCount} messages`}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isExpanded && issue.messages && issue.messages.length > 0 && (
                                    <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex flex-col gap-1.5 max-h-[300px] overflow-y-auto">
                                        {issue.messages.map((msg) => (
                                            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                                <div
                                                    className={`max-w-[80%] px-2.5 py-1.5 text-xs leading-relaxed ${
                                                        msg.role === "user"
                                                            ? "rounded-2xl rounded-br-sm bg-slate-900 dark:bg-sky-600 text-white"
                                                            : "rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                                    } ${msg.role === "step" || msg.role === "fix" ? "border border-slate-200 dark:border-slate-700 italic" : ""}`}
                                                >
                                                    {msg.role === "step" && <span className="text-emerald-500 mr-1">✓</span>}
                                                    {msg.role === "fix" && <span className="font-semibold text-emerald-500 mr-1">Fix:</span>}
                                                    {msg.content}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
