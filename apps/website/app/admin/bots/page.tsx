"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Activity,
    AlertTriangle,
    Bot,
    ChevronDown,
    ChevronUp,
    Clock,
    Pause,
    Play,
    Settings2,
    ShieldCheck,
    Wrench,
    Zap,
} from "lucide-react";
import Link from "next/link";
import PremiumIcon from "@/components/shared/PremiumIcon";

type BotStatus = "active" | "paused" | "error" | "maintenance";
type AutonomyLevel = "low" | "medium" | "high";
type ApprovalPolicy = "all" | "medium-high" | "high-only";

type BotRecord = {
    slug: string;
    name: string;
    role: string;
    tone: string;
    status: BotStatus;
    autonomyLevel: AutonomyLevel;
    approvalPolicy: ApprovalPolicy;
    tasksCompleted: number;
    reliabilityPct: number;
    shiftStart: string;
    shiftEnd: string;
    activeDays: string;
    notes: string;
    lastActivityAt: number;
};

const statusMeta: Record<BotStatus, { label: string; dot: string; badge: string }> = {
    active: { label: "Active", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
    paused: { label: "Paused", dot: "bg-amber-400", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    error: { label: "Error", dot: "bg-rose-500", badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
    maintenance: { label: "Maintenance", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const toneClass: Record<string, string> = {
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const dayLabels = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export default function AdminBotsPage() {
    const [bots, setBots] = useState<BotRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Partial<BotRecord>>>({});
    const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

    const fetchBots = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/bots");
            const data = await res.json() as any;
            if (res.ok) setBots(data.bots ?? []);
            else setError(data.error ?? "Failed to load bots");
        } catch {
            setError("Network error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBots();
    }, [fetchBots]);

    const showToast = (message: string, ok: boolean) => {
        setToast({ message, ok });
        setTimeout(() => setToast(null), 3500);
    };

    const patchBot = async (slug: string, body: Record<string, string>) => {
        setSaving(slug);
        try {
            const res = await fetch(`/api/admin/bots/${slug}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json() as any;
            if (res.ok) {
                await fetchBots();
                showToast("Bot updated.", true);
            } else {
                showToast(data.error ?? "Update failed.", false);
            }
        } catch {
            showToast("Network error.", false);
        } finally {
            setSaving(null);
        }
    };

    const toggleStatus = (bot: BotRecord) => {
        const next: BotStatus = bot.status === "active" ? "paused" : "active";
        patchBot(bot.slug, { status: next });
    };

    const setMaintenance = (bot: BotRecord) => {
        patchBot(bot.slug, { status: "maintenance" });
    };

    const getDraft = (slug: string, bot: BotRecord): Partial<BotRecord> => drafts[slug] ?? bot;

    const setDraft = (slug: string, patch: Partial<BotRecord>) => {
        setDrafts((prev) => ({ ...prev, [slug]: { ...(prev[slug] ?? {}), ...patch } }));
    };

    const saveDraft = (slug: string) => {
        const draft = drafts[slug];
        if (!draft) return;
        const body: Record<string, string> = {};
        if (draft.autonomyLevel) body.autonomyLevel = draft.autonomyLevel;
        if (draft.approvalPolicy) body.approvalPolicy = draft.approvalPolicy;
        if (draft.shiftStart) body.shiftStart = draft.shiftStart;
        if (draft.shiftEnd) body.shiftEnd = draft.shiftEnd;
        if (draft.activeDays !== undefined) body.activeDays = draft.activeDays;
        if (draft.notes !== undefined) body.notes = draft.notes;
        patchBot(slug, body).then(() => {
            setDrafts((prev) => { const n = { ...prev }; delete n[slug]; return n; });
        });
    };

    const toggleDay = (slug: string, bot: BotRecord, day: string) => {
        const current = (getDraft(slug, bot).activeDays ?? bot.activeDays).split(",").filter(Boolean);
        const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
        setDraft(slug, { activeDays: next.join(",") });
    };

    return (
        <div className="site-shell min-h-screen">

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${toast.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                    {toast.ok
                        ? <PremiumIcon icon={ShieldCheck} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" />
                        : <PremiumIcon icon={AlertTriangle} tone="rose" containerClassName="w-6 h-6 rounded-lg bg-white/15 text-white border-white/30" iconClassName="w-3.5 h-3.5" />}
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <section className="border-b border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300 mb-4">
                        <PremiumIcon icon={Bot} tone="amber" containerClassName="w-5 h-5 rounded-md bg-amber-300/15 text-amber-200 border-amber-200/30" iconClassName="w-3 h-3" />
                        Bot Control Panel
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight max-w-xl">
                        Configure and control AI workers
                    </h1>
                    <p className="mt-2 text-slate-400 max-w-lg">
                        Pause, resume, and configure each bot's autonomy level, approval policy, and working hours.
                    </p>
                    <div className="mt-5 flex gap-3">
                        <Link href="/admin" className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 border border-white/20 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors">
                            Back to Admin
                        </Link>
                    </div>
                </div>
            </section>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

                {/* Status summary */}
                {!loading && !error && (
                    <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {(["active", "paused", "error", "maintenance"] as BotStatus[]).map((s) => {
                            const count = bots.filter((b) => b.status === s).length;
                            const m = statusMeta[s];
                            return (
                                <div key={s} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
                                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot}`} />
                                    <div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{m.label}</p>
                                        <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 leading-none mt-0.5">{count}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {loading ? (
                    <p className="text-slate-400 text-sm py-12 text-center">Loading bots…</p>
                ) : error ? (
                    <p className="text-rose-500 text-sm py-12 text-center">{error}</p>
                ) : (
                    <div className="space-y-4">
                        {bots.map((bot) => {
                            const m = statusMeta[bot.status];
                            const isExpanded = expanded === bot.slug;
                            const isSaving = saving === bot.slug;
                            const draft = getDraft(bot.slug, bot);
                            const hasDraft = !!drafts[bot.slug];
                            const activeDaysList = (draft.activeDays ?? bot.activeDays).split(",").filter(Boolean);

                            return (
                                <div key={bot.slug} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">

                                    {/* Bot row */}
                                    <div className="px-5 py-4 flex items-center gap-4 flex-wrap sm:flex-nowrap">
                                        {/* Status dot + name */}
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.dot} ${bot.status === "active" ? "animate-pulse" : ""}`} />
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{bot.name}</p>
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass[bot.tone] ?? toneClass.sky}`}>
                                                    {bot.role}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Metrics */}
                                        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                                            <span className="inline-flex items-center gap-1">
                                                <PremiumIcon icon={Activity} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3.5 h-3.5" />{bot.tasksCompleted} tasks
                                            </span>
                                            <span className="inline-flex items-center gap-1">
                                                <PremiumIcon icon={Zap} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400" iconClassName="w-3.5 h-3.5" />{bot.reliabilityPct}%
                                            </span>
                                        </div>

                                        {/* Status badge */}
                                        <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${m.badge}`}>
                                            {m.label}
                                        </span>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                disabled={isSaving}
                                                onClick={() => toggleStatus(bot)}
                                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${bot.status === "active"
                                                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
                                                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300"
                                                    }`}
                                            >
                                                {bot.status === "active" ? <><PremiumIcon icon={Pause} tone="amber" containerClassName="w-6 h-6 rounded-lg bg-amber-200 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" iconClassName="w-3.5 h-3.5" />Pause</> : <><PremiumIcon icon={Play} tone="emerald" containerClassName="w-6 h-6 rounded-lg bg-emerald-200 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" iconClassName="w-3.5 h-3.5" />Resume</>}
                                            </button>
                                            <button
                                                disabled={isSaving || bot.status === "maintenance"}
                                                onClick={() => setMaintenance(bot)}
                                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                                            >
                                                <PremiumIcon icon={Wrench} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName="w-3.5 h-3.5" />Maintenance
                                            </button>
                                            <button
                                                onClick={() => setExpanded(isExpanded ? null : bot.slug)}
                                                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 transition-colors"
                                            >
                                                <PremiumIcon icon={Settings2} tone="slate" containerClassName="w-6 h-6 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName="w-3.5 h-3.5" />
                                                Configure
                                                {isExpanded ? <PremiumIcon icon={ChevronUp} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName="w-3 h-3" /> : <PremiumIcon icon={ChevronDown} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" iconClassName="w-3 h-3" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Config panel */}
                                    {isExpanded && (
                                        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-5 bg-slate-50 dark:bg-slate-800/30">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

                                                {/* Autonomy level */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Autonomy Level</label>
                                                    <select
                                                        value={draft.autonomyLevel ?? bot.autonomyLevel}
                                                        onChange={(e) => setDraft(bot.slug, { autonomyLevel: e.target.value as AutonomyLevel })}
                                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                                    >
                                                        <option value="low">Low — ask approval for everything</option>
                                                        <option value="medium">Medium — auto-approve low risk</option>
                                                        <option value="high">High — auto-approve low + medium risk</option>
                                                    </select>
                                                </div>

                                                {/* Approval policy */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Approval Required For</label>
                                                    <select
                                                        value={draft.approvalPolicy ?? bot.approvalPolicy}
                                                        onChange={(e) => setDraft(bot.slug, { approvalPolicy: e.target.value as ApprovalPolicy })}
                                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                                    >
                                                        <option value="all">All actions</option>
                                                        <option value="medium-high">Medium and high risk</option>
                                                        <option value="high-only">High risk only</option>
                                                    </select>
                                                </div>

                                                {/* Shift hours */}
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                                                        <span className="inline-flex items-center gap-1"><PremiumIcon icon={Clock} tone="slate" containerClassName="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400" iconClassName="w-3 h-3" />Working Hours</span>
                                                    </label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="time"
                                                            value={draft.shiftStart ?? bot.shiftStart}
                                                            onChange={(e) => setDraft(bot.slug, { shiftStart: e.target.value })}
                                                            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                                        />
                                                        <span className="text-xs text-slate-400">to</span>
                                                        <input
                                                            type="time"
                                                            value={draft.shiftEnd ?? bot.shiftEnd}
                                                            onChange={(e) => setDraft(bot.slug, { shiftEnd: e.target.value })}
                                                            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Active days */}
                                                <div className="sm:col-span-2 lg:col-span-2">
                                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Active Days</label>
                                                    <div className="flex flex-wrap gap-2">
                                                        {dayLabels.map((day) => {
                                                            const active = activeDaysList.includes(day);
                                                            return (
                                                                <button
                                                                    key={day}
                                                                    onClick={() => toggleDay(bot.slug, bot, day)}
                                                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${active ? "bg-violet-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"}`}
                                                                >
                                                                    {day}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Admin notes */}
                                                <div className="sm:col-span-2 lg:col-span-3">
                                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Admin Notes</label>
                                                    <textarea
                                                        rows={2}
                                                        value={draft.notes ?? bot.notes}
                                                        onChange={(e) => setDraft(bot.slug, { notes: e.target.value })}
                                                        placeholder="Internal notes for this bot…"
                                                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                                                    />
                                                </div>
                                            </div>

                                            {/* Save row */}
                                            <div className="mt-4 flex items-center gap-3">
                                                <button
                                                    disabled={!hasDraft || isSaving}
                                                    onClick={() => saveDraft(bot.slug)}
                                                    className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isSaving ? "Saving…" : "Save changes"}
                                                </button>
                                                {hasDraft && (
                                                    <button
                                                        onClick={() => setDrafts((prev) => { const n = { ...prev }; delete n[bot.slug]; return n; })}
                                                        className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                                    >
                                                        Discard
                                                    </button>
                                                )}
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
    );
}
