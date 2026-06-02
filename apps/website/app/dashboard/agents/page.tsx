import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardCheck, Shield, Timer, Cpu, RotateCcw } from "lucide-react";
import HeatmapDatePicker from "@/components/dashboard/HeatmapDatePicker";

export const metadata: Metadata = {
    title: "Agents - AgentFarms Dashboard",
    description: "Browse and manage deployed AI workers.",
};

const agents = [
    { slug: "ai-backend-developer", name: "AI Backend Developer", role: "Backend Engineering", status: "Active", tasks: 34, reliability: 99.2, tone: "sky", heatSeed: 7 },
    { slug: "ai-qa-engineer", name: "AI QA Engineer", role: "Quality Assurance", status: "Active", tasks: 52, reliability: 99.6, tone: "violet", heatSeed: 13 },
    { slug: "ai-devops-engineer", name: "AI DevOps Engineer", role: "DevOps & Infrastructure", status: "Active", tasks: 18, reliability: 98.9, tone: "amber", heatSeed: 5 },
    { slug: "ai-security-engineer", name: "AI Security Engineer", role: "Security & Compliance", status: "Needs review", tasks: 7, reliability: 99.7, tone: "rose", heatSeed: 3 },
];

// ── Date utilities ─────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_FULL    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MAX_LOOKBACK_DAYS = 365;
const DEFAULT_RANGE     = 28;

function toDateStr(d: Date): string {
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0"),
    ].join("-");
}

function parseDate(s: string): Date | null {
    const parts = s.split("-");
    const y = parseInt(parts[0] ?? "", 10);
    const m = parseInt(parts[1] ?? "", 10);
    const d = parseInt(parts[2] ?? "", 10);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
}

function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function diffDays(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * Resolve the [fromDate, toDate] window from URL params.
 * Priority: ?from + ?to  >  ?from alone (+ 27d)  >  ?offset  >  default last 28 days
 */
function resolveRange(params: { from?: string; to?: string; offset?: string }): { fromDate: Date; toDate: Date } {
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const minStart = addDays(today, -MAX_LOOKBACK_DAYS);
    const clamp    = (d: Date) => d < minStart ? minStart : d > today ? today : d;

    // ?from + ?to
    if (params.from && params.to) {
        const f = parseDate(params.from);
        const t = parseDate(params.to);
        if (f && t && t > f) {
            const cf = clamp(f);
            const ct = clamp(t);
            if (ct > cf) return { fromDate: cf, toDate: ct };
        }
    }

    // ?from alone → 28-day window
    if (params.from) {
        const f = parseDate(params.from);
        if (f) {
            const cf = clamp(f);
            const ct = clamp(addDays(cf, DEFAULT_RANGE - 1));
            return { fromDate: cf, toDate: ct };
        }
    }

    // ?offset (backward compat — 28-day blocks)
    if (params.offset) {
        const n  = Math.max(0, parseInt(params.offset, 10) || 0);
        const ct = addDays(today, -n * DEFAULT_RANGE);
        const cf = addDays(ct, -(DEFAULT_RANGE - 1));
        return { fromDate: clamp(cf), toDate: clamp(ct) };
    }

    // Default: last 28 days ending today
    return { fromDate: addDays(today, -(DEFAULT_RANGE - 1)), toDate: today };
}

// ── Heatmap ────────────────────────────────────────────────────────────────────

type HeatCell = { date: Date; active: boolean };

/**
 * Build cells for the heatmap.
 * Days within [fromDate, toDate] are "active"; tail-padding to fill the last
 * row is "inactive" (shown as empty/grey).
 */
function buildHeatmapCells(fromDate: Date, toDate: Date): HeatCell[] {
    const cells: HeatCell[] = [];
    const cur = new Date(fromDate);
    while (cur <= toDate) {
        cells.push({ date: new Date(cur), active: true });
        cur.setDate(cur.getDate() + 1);
    }
    while (cells.length % 7 !== 0) {
        cells.push({ date: new Date(cur), active: false });
        cur.setDate(cur.getDate() + 1);
    }
    return cells;
}

function getWeekMonthLabel(weekIdx: number, cells: HeatCell[]): string | null {
    const dates = cells.map((c) => c.date);
    if (weekIdx === 0) return MONTH_SHORT[dates[0]?.getMonth() ?? 0] ?? null;
    const prevEnd = dates[weekIdx * 7 - 1];
    if (!prevEnd) return null;
    for (const d of dates.slice(weekIdx * 7, weekIdx * 7 + 7)) {
        if (d.getMonth() !== prevEnd.getMonth()) return MONTH_SHORT[d.getMonth()] ?? null;
    }
    return null;
}

function heatCellClass(seed: number, idx: number, fromDate: Date, active: boolean): string {
    if (!active) return "bg-slate-100 dark:bg-slate-800/40";
    const epochWeeks = Math.floor(fromDate.getTime() / (7 * 24 * 60 * 60 * 1000));
    const v = ((seed * 17 + idx * 31 + idx * seed + epochWeeks * 3) % 10);
    if (v <= 1) return "bg-slate-200 dark:bg-slate-700";
    if (v <= 3) return "bg-emerald-200 dark:bg-emerald-900/50";
    if (v <= 6) return "bg-emerald-400 dark:bg-emerald-600";
    return "bg-emerald-600 dark:bg-emerald-400";
}

// ── Tone / status ──────────────────────────────────────────────────────────────

const toneClass: Record<string, string> = {
    sky:    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    amber:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose:   "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const toneDot: Record<string, string> = {
    sky: "bg-sky-500", violet: "bg-violet-500", amber: "bg-amber-500", rose: "bg-rose-500",
};

const statusConfig: Record<string, { dot: string; text: string; pulse: boolean }> = {
    "Active":       { dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400", pulse: true  },
    "Needs review": { dot: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",     pulse: false },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AgentsIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ from?: string; to?: string; offset?: string }>;
}) {
    const params = await searchParams;

    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const minStart = addDays(today, -MAX_LOOKBACK_DAYS);

    const { fromDate, toDate } = resolveRange(params);
    const fromStr  = toDateStr(fromDate);
    const toStr    = toDateStr(toDate);
    const rangeDays = diffDays(fromDate, toDate) + 1;

    // Prev / Next shift by the current range width
    const prevFrom   = toDateStr(addDays(fromDate, -rangeDays));
    const prevTo     = toDateStr(addDays(toDate,   -rangeDays));
    const nextFrom   = toDateStr(addDays(fromDate,  rangeDays));
    const nextTo     = toDateStr(addDays(toDate,    rangeDays));
    const isLatest   = toDate  >= today;
    const isEarliest = fromDate <= addDays(minStart, 1);

    // Summary stats
    const activeCount    = agents.filter((a) => a.status === "Active").length;
    const totalTasks     = agents.reduce((sum, a) => sum + a.tasks, 0);
    const avgReliability = (agents.reduce((sum, a) => sum + a.reliability, 0) / agents.length).toFixed(1);

    // Range label
    const rangeLabel =
        fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear()
            ? `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${toDate.getDate()}, ${toDate.getFullYear()}`
            : `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${MONTH_SHORT[toDate.getMonth()]} ${toDate.getDate()}, ${toDate.getFullYear()}`;

    // Heatmap cells (shared across all cards)
    const cells   = buildHeatmapCells(fromDate, toDate);
    const numWeeks = cells.length / 7;

    return (
        <div className="site-shell min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* ── Header ───────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-6 md:px-8">
                <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center shadow-sm">
                            <Cpu className="h-4.5 w-4.5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-none">AI Workers</h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Inspect each worker's task history, quality, and approvals.</p>
                        </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-5">
                        <div className="text-center">
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-none">{activeCount}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Active</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-center">
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-none">{totalTasks}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Total Tasks</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-center">
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-none">{avgReliability}%</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">Avg Reliability</p>
                        </div>
                    </div>
                </div>

                {/* ── Period navigator ─────────────────────────────────── */}
                <div className="max-w-5xl mx-auto mt-4 flex items-center gap-2">
                    {/* Prev */}
                    <Link
                        href={isEarliest ? "#" : `?from=${prevFrom}&to=${prevTo}`}
                        aria-disabled={isEarliest}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
                            ${isEarliest
                                ? "border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-600 pointer-events-none"
                                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                    </Link>

                    {/* Date range label */}
                    <div className="flex-1 flex items-center justify-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{rangeLabel}</span>
                        <span className="text-[10px] text-slate-400">({rangeDays}d)</span>
                        {!isLatest && (
                            <Link
                                href={`?from=${toDateStr(addDays(today, -(DEFAULT_RANGE - 1)))}&to=${toDateStr(today)}`}
                                className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-100 transition-colors"
                            >
                                <RotateCcw className="h-2.5 w-2.5" />
                                Today
                            </Link>
                        )}
                    </div>

                    {/* Custom range picker */}
                    <HeatmapDatePicker
                        fromValue={fromStr}
                        toValue={toStr}
                        minDate={toDateStr(minStart)}
                        maxDate={toDateStr(today)}
                    />

                    {/* Next */}
                    <Link
                        href={isLatest ? "#" : `?from=${nextFrom}&to=${nextTo}`}
                        aria-disabled={isLatest}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors
                            ${isLatest
                                ? "border-slate-100 dark:border-slate-800 text-slate-300 dark:text-slate-600 pointer-events-none"
                                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                    >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>

            {/* ── Cards ────────────────────────────────────────────────── */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                {agents.map((agent) => {
                    const sc = statusConfig[agent.status] ?? { dot: "bg-slate-400", text: "text-slate-500", pulse: false };
                    return (
                        <article
                            key={agent.slug}
                            className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                            {/* Role + status */}
                            <div className="flex items-center justify-between">
                                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${toneClass[agent.tone]}`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${toneDot[agent.tone]}`} />
                                    {agent.role}
                                </span>
                                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${sc.text}`}>
                                    <span className={`h-2 w-2 rounded-full ${sc.dot} ${sc.pulse ? "animate-pulse" : ""}`} />
                                    {agent.status}
                                </span>
                            </div>

                            {/* Name */}
                            <h2 className="mt-3 text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                                {agent.name}
                            </h2>

                            {/* Heatmap */}
                            <div className="mt-4">
                                {/* Legend */}
                                <div className="flex items-center justify-end mb-2">
                                    <div className="flex items-center gap-1">
                                        <span className="text-[9px] text-slate-400 mr-0.5">Less</span>
                                        <div className="h-2.5 w-2.5 rounded-sm bg-slate-200 dark:bg-slate-700" />
                                        <div className="h-2.5 w-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-900/50" />
                                        <div className="h-2.5 w-2.5 rounded-sm bg-emerald-400 dark:bg-emerald-600" />
                                        <div className="h-2.5 w-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400" />
                                        <span className="text-[9px] text-slate-400 ml-0.5">More</span>
                                    </div>
                                </div>

                                {/* Day labels */}
                                <div className="flex items-center gap-1 mb-1">
                                    <div className="w-6 shrink-0" />
                                    <div className="flex-1 grid grid-cols-7 gap-1">
                                        {['M','T','W','T','F','S','S'].map((d, idx) => (
                                            <div key={idx} className="text-center text-[9px] font-semibold text-slate-400">{d}</div>
                                        ))}
                                    </div>
                                </div>

                                {/* Dynamic week rows */}
                                <div className="space-y-1">
                                    {Array.from({ length: numWeeks }, (_, week) => {
                                        const monthLabel = getWeekMonthLabel(week, cells);
                                        return (
                                            <div key={week} className="flex items-center gap-1">
                                                <div className="w-6 shrink-0 text-right">
                                                    {monthLabel && (
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide leading-none">
                                                            {monthLabel}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex-1 grid grid-cols-7 gap-1">
                                                    {Array.from({ length: 7 }, (_, day) => {
                                                        const idx  = week * 7 + day;
                                                        const cell = cells[idx];
                                                        if (!cell) return <div key={day} className="h-3.5" />;
                                                        const label = cell.active
                                                            ? `${DAY_FULL[cell.date.getDay()]}, ${MONTH_SHORT[cell.date.getMonth()]} ${cell.date.getDate()}`
                                                            : "";
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`h-3.5 rounded-sm ${heatCellClass(agent.heatSeed, idx, fromDate, cell.active)} ${cell.active ? "hover:ring-1 hover:ring-emerald-400" : ""} transition-all cursor-default`}
                                                                title={label}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 px-3 py-2.5 flex items-center gap-2.5">
                                    <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                                        <ClipboardCheck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none">{agent.tasks}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">tasks done</p>
                                    </div>
                                </div>
                                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 px-3 py-2.5 flex items-center gap-2.5">
                                    <div className="h-7 w-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                                        <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none">{agent.reliability}%</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">reliability</p>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="mt-4 flex gap-2">
                                <Link
                                    href={`/dashboard/agents/${agent.slug}`}
                                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white/90 transition-colors"
                                >
                                    View details
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                                <Link
                                    href={`/dashboard/agents/${agent.slug}/approvals`}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <Timer className="h-3.5 w-3.5" />
                                    Approvals
                                </Link>
                            </div>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}
