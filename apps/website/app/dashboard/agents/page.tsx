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

// ── Date helpers ───────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_FULL    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/** Format a Date as YYYY-MM-DD (local time). */
function toDateStr(d: Date): string {
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/** Parse YYYY-MM-DD as a local-midnight Date. Returns null on invalid input. */
function parseDate(s: string): Date | null {
    const [y, m, d] = s.split("-").map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
}

/** Add n calendar days to a Date (returns a new Date). */
function addDays(d: Date, n: number): Date {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

/**
 * Resolve the heatmap start date from URL params.
 * Priority: ?from=YYYY-MM-DD  >  ?offset=N  >  default (today − 27)
 * Result is clamped: no earlier than MAX_LOOKBACK_DAYS ago, no later than today − 27.
 */
const MAX_LOOKBACK_DAYS = 365;

function resolveFromDate(from?: string, offset?: string): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const defaultStart = addDays(today, -27);
    const minStart     = addDays(today, -MAX_LOOKBACK_DAYS);

    // 1. Explicit ?from date
    if (from) {
        const d = parseDate(from);
        if (d) {
            if (d > defaultStart) return defaultStart;
            if (d < minStart)     return minStart;
            return d;
        }
    }

    // 2. ?offset (28-day blocks back)
    if (offset) {
        const n = Math.max(0, parseInt(offset, 10) || 0);
        const d = addDays(defaultStart, -n * 28);
        if (d < minStart) return minStart;
        return d;
    }

    return defaultStart;
}

// ── Heatmap helpers ────────────────────────────────────────────────────────────

function buildHeatmapDates(fromDate: Date): Date[] {
    return Array.from({ length: 28 }, (_, i) => addDays(fromDate, i));
}

function getWeekMonthLabel(weekIdx: number, dates: Date[]): string | null {
    if (weekIdx === 0) return MONTH_SHORT[dates[0].getMonth()];
    const prevEnd = dates[weekIdx * 7 - 1];
    for (const d of dates.slice(weekIdx * 7, weekIdx * 7 + 7)) {
        if (d.getMonth() !== prevEnd.getMonth()) return MONTH_SHORT[d.getMonth()];
    }
    return null;
}

/** Deterministic heat level — uses epoch-week of fromDate so each period differs. */
function heatCell(seed: number, i: number, fromDate: Date): string {
    const epochWeeks = Math.floor(fromDate.getTime() / (7 * 24 * 60 * 60 * 1000));
    const v = ((seed * 17 + i * 31 + i * seed + epochWeeks * 3) % 10);
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
    sky:    "bg-sky-500",
    violet: "bg-violet-500",
    amber:  "bg-amber-500",
    rose:   "bg-rose-500",
};

const statusConfig: Record<string, { dot: string; text: string; pulse: boolean }> = {
    "Active":       { dot: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400", pulse: true },
    "Needs review": { dot: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400",     pulse: false },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AgentsIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ from?: string; offset?: string }>;
}) {
    const { from, offset } = await searchParams;

    const today        = new Date(); today.setHours(0, 0, 0, 0);
    const defaultStart = addDays(today, -27);          // latest valid start (ends today)
    const minStart     = addDays(today, -MAX_LOOKBACK_DAYS);

    const fromDate     = resolveFromDate(from, offset);
    const fromStr      = toDateStr(fromDate);
    const isLatest     = fromDate >= defaultStart;
    const isEarliest   = fromDate <= addDays(minStart, 1);

    // Prev / Next targets (28-day jumps)
    const prevFrom = toDateStr(addDays(fromDate, -28));
    const nextFrom = toDateStr(addDays(fromDate, +28));

    // Summary stats
    const activeCount    = agents.filter((a) => a.status === "Active").length;
    const totalTasks     = agents.reduce((sum, a) => sum + a.tasks, 0);
    const avgReliability = (agents.reduce((sum, a) => sum + a.reliability, 0) / agents.length).toFixed(1);

    // Date window
    const heatmapDates = buildHeatmapDates(fromDate);
    const rangeEnd     = heatmapDates[27];
    const rangeLabel   =
        fromDate.getMonth() === rangeEnd.getMonth()
            ? `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${rangeEnd.getDate()}, ${rangeEnd.getFullYear()}`
            : `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${MONTH_SHORT[rangeEnd.getMonth()]} ${rangeEnd.getDate()}, ${rangeEnd.getFullYear()}`;

    return (
        <div className="site-shell min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* ── Header ─────────────────────────────────────────────────── */}
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
                        href={isEarliest ? "#" : `?from=${prevFrom}`}
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

                    {/* Date range + Back to today */}
                    <div className="flex-1 flex items-center justify-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{rangeLabel}</span>
                        {!isLatest && (
                            <Link
                                href="?from=today"
                                className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-800 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
                            >
                                <RotateCcw className="h-2.5 w-2.5" />
                                Today
                            </Link>
                        )}
                    </div>

                    {/* Custom date picker (Client Component) */}
                    <HeatmapDatePicker
                        fromValue={fromStr}
                        minDate={toDateStr(minStart)}
                        maxDate={toDateStr(defaultStart)}
                    />

                    {/* Next */}
                    <Link
                        href={isLatest ? "#" : `?from=${nextFrom}`}
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

            {/* ── Cards ──────────────────────────────────────────────────── */}
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

                                {/* Week rows */}
                                <div className="space-y-1">
                                    {[0, 1, 2, 3].map((week) => {
                                        const monthLabel = getWeekMonthLabel(week, heatmapDates);
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
                                                        const idx   = week * 7 + day;
                                                        const date  = heatmapDates[idx];
                                                        const label = `${DAY_FULL[date.getDay()]}, ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`;
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className={`h-3.5 rounded-sm ${heatCell(agent.heatSeed, idx, fromDate)} hover:ring-1 hover:ring-emerald-400 transition-all cursor-default`}
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
