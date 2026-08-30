"use client";
import { useState, useEffect, useCallback } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Download,
    RefreshCw,
    KeyRound,
    Settings2,
    Shield,
    UserCheck,
    type LucideIcon,
} from "lucide-react";
import PremiumIcon from "@/components/shared/PremiumIcon";

type AuditEventRecord = {
    id: string;
    actorId: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    tenantId: string;
    beforeState: string;
    afterState: string;
    reason: string;
    createdAt: number;
};

const ACTION_CONFIG: Record<string, { icon: LucideIcon; badge: string; category: string }> = {
    "user.role_change": { icon: UserCheck, badge: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]", category: "User Change" },
    "user.signup": { icon: UserCheck, badge: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]", category: "User Change" },
    "user.login": { icon: UserCheck, badge: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]", category: "User Change" },
    "user.logout": { icon: UserCheck, badge: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]", category: "User Change" },
    "session.revoked": { icon: KeyRound, badge: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]", category: "Security" },
    "bot.status_change": { icon: Settings2, badge: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]", category: "Agent Action" },
    "bot.config_change": { icon: Settings2, badge: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]", category: "Agent Action" },
    "incident.resolved": { icon: CheckCircle2, badge: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] text-[color:var(--ok)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 dark:text-[color:var(--ok)]", category: "System" },
    "incident.assigned": { icon: AlertTriangle, badge: "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]", category: "System" },
    "tenant.created": { icon: Shield, badge: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]", category: "System" },
};

const DEFAULT_CONFIG = { icon: Settings2, badge: "bg-[var(--bg-deep)] text-[color:var(--ink-soft)] dark:bg-[var(--card)] dark:text-[color:var(--ink-muted)]", category: "System" };

const CATEGORIES = ["All", "User Change", "Agent Action", "Security", "System"] as const;
type Category = (typeof CATEGORIES)[number];

function formatTs(ts: number): string {
    return new Date(ts).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    });
}

function relativeTime(ts: number): string {
    const delta = Date.now() - ts;
    if (delta < 60_000) return "just now";
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
    return `${Math.floor(delta / 86_400_000)}d ago`;
}

function clientDownloadCsv(events: AuditEventRecord[]) {
    const header = "id,actor_email,action,target_type,target_id,reason,before_state,after_state,created_at";
    const esc = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = events.map((e) =>
        [e.id, esc(e.actorEmail), esc(e.action), esc(e.targetType), esc(e.targetId), esc(e.reason), esc(e.beforeState), esc(e.afterState), String(e.createdAt)].join(","),
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function CustomerAuditPage() {
    const [events, setEvents] = useState<AuditEventRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [category, setCategory] = useState<Category>("All");
    const [search, setSearch] = useState("");

    const loadEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/audit/events?limit=200", { cache: "no-store", credentials: "include" });
            if (!res.ok) {
                const body = (await res.json()) as { error?: string };
                throw new Error(body.error ?? "Failed to load audit log");
            }
            const data = (await res.json()) as { events: AuditEventRecord[] };
            setEvents(data.events ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadEvents();
    }, [loadEvents]);

    const filtered = events.filter((evt) => {
        const cfg = ACTION_CONFIG[evt.action] ?? DEFAULT_CONFIG;
        const catMatch = category === "All" || cfg.category === category;
        const q = search.trim().toLowerCase();
        const textMatch =
            !q ||
            evt.actorEmail.toLowerCase().includes(q) ||
            evt.action.toLowerCase().includes(q) ||
            evt.targetId.toLowerCase().includes(q) ||
            evt.reason.toLowerCase().includes(q);
        return catMatch && textMatch;
    });

    return (
        <div className="min-h-screen bg-[var(--bg-deep)] dark:bg-[var(--bg)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* ── Hero header ─────────────────────────────────────── */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(139,92,246,0.16)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>

                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-5">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <PremiumIcon icon={ClipboardList} tone="violet" containerClassName="w-4 h-4 rounded bg-[var(--accent)]/20 text-[color:var(--accent)]" iconClassName="w-2.5 h-2.5" />
                                Audit Log
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">
                                    Activity &amp; audit log
                                </h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">
                                    A record of who did what across your workspace — sign-ins, agent actions, and security events.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 shrink-0">
                                <button
                                    onClick={() => void loadEvents()}
                                    disabled={loading}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[3px] bg-[var(--card)] border border-[color:var(--line)] text-xs font-semibold text-[color:var(--ink)] hover:bg-[var(--card)] hover:border-[color:var(--line)] transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                                </button>
                                <button
                                    onClick={() => clientDownloadCsv(filtered)}
                                    disabled={loading || filtered.length === 0}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[3px] bg-[var(--card)] border border-[color:var(--line)] text-xs font-semibold text-[color:var(--ink)] hover:bg-[var(--card)] hover:border-[color:var(--line)] transition-colors disabled:opacity-50"
                                >
                                    <Download className="w-3.5 h-3.5" /> Export CSV
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-6 border-t border-[color:var(--line)] pt-4">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-[color:var(--ink-muted)]">
                                <span className="text-[color:var(--ink)] font-bold">{filtered.length}</span>
                                {filtered.length === 1 ? "event" : "events"}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Filters ─────────────────────────────────────────── */}
                <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-4 space-y-3">
                    <input
                        type="search"
                        placeholder="Search by actor, action, target, or reason…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full max-w-sm rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-3 py-1.5 text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink)] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]"
                    />
                    <div className="flex gap-1 flex-wrap">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`px-3 py-1.5 rounded-[3px] text-xs font-medium transition-colors ${category === cat
                                        ? "bg-[var(--accent)] dark:bg-[var(--bg-deep)] text-[color:var(--ink)] dark:text-[color:var(--ink)]"
                                        : "text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Timeline ────────────────────────────────────────── */}
                <div className="bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] p-2 sm:p-4">
                    {loading ? (
                        <div className="space-y-3 animate-pulse p-3">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="h-16 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)]" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="m-3 rounded-[3px] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]/40 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 px-4 py-4 text-sm text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                            <strong>Error:</strong> {error}
                            <button onClick={() => void loadEvents()} className="ml-3 underline text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                                Retry
                            </button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-[4px] border border-dashed border-[color:var(--line-strong)] dark:border-[color:var(--line)] p-12 text-center">
                            <PremiumIcon
                                icon={ClipboardList}
                                tone="slate"
                                containerClassName="mx-auto mb-3 w-10 h-10 rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]"
                                iconClassName="w-5 h-5"
                            />
                            <p className="text-sm font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink)]">No audit events found</p>
                            <p className="text-xs text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] mt-1">
                                {search ? "Try adjusting your search." : "Activity in your workspace will appear here as it happens."}
                            </p>
                        </div>
                    ) : (
                        <div className="relative px-2 py-2">
                            <div className="absolute left-7 top-0 bottom-0 w-px bg-[var(--line)] dark:bg-[var(--card)]" />
                            <div className="space-y-1">
                                {filtered.map((evt) => {
                                    const cfg = ACTION_CONFIG[evt.action] ?? DEFAULT_CONFIG;
                                    const Icon = cfg.icon;
                                    let beforeObj: Record<string, unknown> = {};
                                    let afterObj: Record<string, unknown> = {};
                                    try { beforeObj = JSON.parse(evt.beforeState) as Record<string, unknown>; } catch { /* ignore */ }
                                    try { afterObj = JSON.parse(evt.afterState) as Record<string, unknown>; } catch { /* ignore */ }
                                    const hasDiff = Object.keys(beforeObj).length > 0 || Object.keys(afterObj).length > 0;

                                    return (
                                        <div
                                            key={evt.id}
                                            className="relative flex gap-4 pl-14 pr-4 py-4 rounded-[3px] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]/40 transition-colors"
                                        >
                                            <div className="absolute left-3 top-3.5">
                                                <PremiumIcon
                                                    icon={Icon}
                                                    tone="slate"
                                                    containerClassName={`h-6 w-6 rounded-full ${cfg.badge} ring-2 ring-white dark:ring-[color:var(--line)]`}
                                                    iconClassName="w-3 h-3"
                                                />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <span className="text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)]">
                                                        {evt.actorEmail}
                                                    </span>
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
                                                        {evt.action}
                                                    </span>
                                                    {evt.targetType && (
                                                        <span className="text-[10px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                            {evt.targetType}:{evt.targetId}
                                                        </span>
                                                    )}
                                                </div>
                                                {evt.reason && (
                                                    <p className="text-sm text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] leading-snug">
                                                        {evt.reason}
                                                    </p>
                                                )}
                                                {hasDiff && (
                                                    <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-mono">
                                                        {Object.keys(beforeObj).length > 0 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/20 text-[color:var(--danger)] dark:text-[color:var(--danger)]">
                                                                before: {JSON.stringify(beforeObj)}
                                                            </span>
                                                        )}
                                                        {Object.keys(afterObj).length > 0 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/20 text-[color:var(--ok)] dark:text-[color:var(--ok)]">
                                                                after: {JSON.stringify(afterObj)}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="mt-1 text-[11px] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]">
                                                    {formatTs(evt.createdAt)} · {relativeTime(evt.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
