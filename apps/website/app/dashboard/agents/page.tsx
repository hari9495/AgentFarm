import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardCheck, Shield, Timer, Cpu, RotateCcw } from "lucide-react";
import HeatmapDatePicker from "@/components/dashboard/HeatmapDatePicker";

export const metadata: Metadata = {
    title: "Agents - AgentFarms Dashboard",
    description: "Browse and manage deployed AI workers.",
};

const GATEWAY_URL =
    process.env.API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:3000";

// Map portal API statuses → display labels
const statusLabel: Record<string, string> = {
    active: "Active",
    paused: "Paused",
    error: "Needs review",
    created: "Provisioning", // bot exists but its runtime hasn't activated yet
    maintenance: "Maintenance",
};

const tones = ["sky", "violet", "amber", "rose"] as const;

/** Deterministic, stable per-agent heatmap seed derived from its id. */
function seedFromSlug(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return (hash % 16) + 1;
}

interface PortalAgent {
    id: string;
    role: string;
    status: string;
    createdAt: string;
    workspace: { name: string } | null;
}

async function fetchAgents(token: string): Promise<PortalAgent[]> {
    try {
        const res = await fetch(`${GATEWAY_URL}/portal/data/agents?limit=50`, {
            headers: { cookie: `portal_session=${token}` },
            cache: "no-store",
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { agents?: PortalAgent[] };
        return data.agents ?? [];
    } catch {
        return [];
    }
}

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
    if (!active) return "bg-[var(--bg-deep)] dark:bg-[var(--card)]/40";
    const epochWeeks = Math.floor(fromDate.getTime() / (7 * 24 * 60 * 60 * 1000));
    const v = ((seed * 17 + idx * 31 + idx * seed + epochWeeks * 3) % 10);
    if (v <= 1) return "bg-[var(--line)] dark:bg-[var(--card)]";
    if (v <= 3) return "bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/50";
    if (v <= 6) return "bg-[var(--ok)] dark:bg-[var(--ok)]";
    return "bg-[var(--ok)] dark:bg-[var(--ok)]";
}

// ── Tone / status ──────────────────────────────────────────────────────────────

const toneClass: Record<string, string> = {
    sky:    "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    violet: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[color:var(--accent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 dark:text-[color:var(--accent)]",
    amber:  "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] text-[color:var(--warn)] dark:bg-[color-mix(in_srgb,var(--warn)_22%,transparent)]/40 dark:text-[color:var(--warn)]",
    rose:   "bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-[color:var(--danger)] dark:bg-[color-mix(in_srgb,var(--danger)_22%,transparent)]/40 dark:text-[color:var(--danger)]",
};

const toneDot: Record<string, string> = {
    sky: "bg-[var(--accent)]", violet: "bg-[var(--accent)]", amber: "bg-[var(--warn)]", rose: "bg-[var(--danger)]",
};

const statusConfig: Record<string, { dot: string; text: string; pulse: boolean }> = {
    "Active":       { dot: "bg-[var(--ok)]", text: "text-[color:var(--ok)] dark:text-[color:var(--ok)]", pulse: true  },
    "Provisioning": { dot: "bg-[var(--accent)]",     text: "text-[color:var(--accent)] dark:text-[color:var(--accent)]",         pulse: true  },
    "Needs review": { dot: "bg-[var(--danger)]",    text: "text-[color:var(--danger)] dark:text-[color:var(--danger)]",       pulse: false },
    "Paused":       { dot: "bg-[var(--warn)]",   text: "text-[color:var(--warn)] dark:text-[color:var(--warn)]",     pulse: false },
    "Maintenance":  { dot: "bg-[var(--bg-deep)]",   text: "text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)]",     pulse: false },
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function AgentsIndexPage({
    searchParams,
}: {
    searchParams: Promise<{ from?: string; to?: string; offset?: string }>;
}) {
    const params = await searchParams;

    const cookieStore = await cookies();
    const token = cookieStore.get("portal_session")?.value ?? "";
    const portalAgents = await fetchAgents(token);

    const agents = portalAgents.map((bot, index) => ({
        slug: bot.id,
        name: bot.role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        role: bot.role,
        status: statusLabel[bot.status] ?? "Active",
        tasks: 0,                          // real task counts come from usage API — shown as 0 for new tenants
        reliability: null as number | null, // unknown until the agent has run tasks
        tone: tones[index % tones.length]!,
        heatSeed: seedFromSlug(bot.id),
    }));

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
    const knownReliability = agents.map((a) => a.reliability).filter((r): r is number => r !== null);
    const avgReliability = knownReliability.length > 0
        ? (knownReliability.reduce((sum, r) => sum + r, 0) / knownReliability.length).toFixed(1)
        : "—";

    // Range label
    const rangeLabel =
        fromDate.getMonth() === toDate.getMonth() && fromDate.getFullYear() === toDate.getFullYear()
            ? `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${toDate.getDate()}, ${toDate.getFullYear()}`
            : `${MONTH_SHORT[fromDate.getMonth()]} ${fromDate.getDate()} – ${MONTH_SHORT[toDate.getMonth()]} ${toDate.getDate()}, ${toDate.getFullYear()}`;

    // Heatmap cells (shared across all cards)
    const cells   = buildHeatmapCells(fromDate, toDate);
    const numWeeks = cells.length / 7;

    return (
        <div className="min-h-screen bg-[var(--bg-deep)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

                {/* Dark hero */}
                <section className="relative overflow-hidden rounded-[4px] border border-[color:var(--line)] bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] via-[var(--card)] to-[var(--card)]">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_0%_0%,rgba(37,99,235,0.10)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_100%,rgba(16,185,129,0.07)_0%,transparent_60%)]" />
                        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle, rgba(37,99,235,1) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                    </div>
                    <div className="relative px-6 sm:px-8 py-6 sm:py-8">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex items-center gap-2 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-[color:var(--accent)]">
                                <Cpu className="w-3.5 h-3.5" />
                                Agents
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[color:var(--ink-soft)]" />
                            <span className="text-xs text-[color:var(--ink-muted)]">AI Workers</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-extrabold text-[color:var(--ink)] tracking-tight leading-tight">AI Workers</h1>
                                <p className="mt-2 text-[color:var(--ink-soft)] text-base max-w-lg">Inspect each worker's task history, quality, and approvals.</p>
                            </div>
                        </div>

                        {/* Mini stats bar */}
                        <div className="mt-5 flex flex-wrap gap-6">
                            <div className="text-center">
                                <p className="text-xl font-bold text-[color:var(--ink)] leading-none">{activeCount}</p>
                                <p className="text-[10px] text-[color:var(--ink-muted)] mt-0.5 uppercase tracking-wide">Active</p>
                            </div>
                            <div className="w-px h-8 bg-[var(--card)] self-center" />
                            <div className="text-center">
                                <p className="text-xl font-bold text-[color:var(--ink)] leading-none">{totalTasks}</p>
                                <p className="text-[10px] text-[color:var(--ink-muted)] mt-0.5 uppercase tracking-wide">Total Tasks</p>
                            </div>
                            <div className="w-px h-8 bg-[var(--card)] self-center" />
                            <div className="text-center">
                                <p className="text-xl font-bold text-[color:var(--ink)] leading-none">{avgReliability === "—" ? "—" : `${avgReliability}%`}</p>
                                <p className="text-[10px] text-[color:var(--ink-muted)] mt-0.5 uppercase tracking-wide">Avg Reliability</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Period navigator */}
                <div className="flex items-center gap-2 bg-[var(--card)] dark:bg-[var(--card)] rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-4 py-3">
                    {/* Prev */}
                    <Link
                        href={isEarliest ? "#" : `?from=${prevFrom}&to=${prevTo}`}
                        aria-disabled={isEarliest}
                        className={`inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-xs font-medium transition-colors
                            ${isEarliest
                                ? "border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] pointer-events-none"
                                : "border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                            }`}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                    </Link>

                    {/* Date range label */}
                    <div className="flex-1 flex items-center justify-center gap-2">
                        <span className="text-sm font-semibold text-[color:var(--ink)] dark:text-[color:var(--ink)]">{rangeLabel}</span>
                        <span className="text-[10px] text-[color:var(--ink-muted)]">({rangeDays}d)</span>
                        {!isLatest && (
                            <Link
                                href={`?from=${toDateStr(addDays(today, -(DEFAULT_RANGE - 1)))}&to=${toDateStr(today)}`}
                                className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/30 border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] dark:border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--accent)] dark:text-[color:var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] transition-colors"
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
                        className={`inline-flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-xs font-medium transition-colors
                            ${isLatest
                                ? "border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)] pointer-events-none"
                                : "border-[color:var(--line)] dark:border-[color:var(--line)] text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)]"
                            }`}
                    >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                {/* Agent cards grid */}
                {agents.length === 0 ? (
                    <div className="rounded-[4px] border border-dashed border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] px-6 py-16 text-center">
                        <Cpu className="mx-auto h-8 w-8 text-[color:var(--ink-muted)] dark:text-[color:var(--ink-soft)]" />
                        <h2 className="mt-3 text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)]">No agents deployed yet</h2>
                        <p className="mt-1 text-sm text-[color:var(--ink-muted)] dark:text-[color:var(--ink-muted)] max-w-sm mx-auto">
                            Deploy an AI worker from the marketplace to see its task history, quality metrics, and approvals here.
                        </p>
                        <Link
                            href="/dashboard/deployments"
                            className="mt-4 inline-flex items-center gap-1.5 rounded-[3px] bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold text-[color:var(--ink)] dark:bg-[var(--bg-deep)] dark:text-[color:var(--ink)] hover:bg-[var(--accent)] dark:hover:bg-[var(--card)] transition-colors"
                        >
                            Go to Deployments
                            <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {agents.map((agent) => {
                        const sc = statusConfig[agent.status] ?? { dot: "bg-[var(--bg-deep)]", text: "text-[color:var(--ink-muted)]", pulse: false };
                        return (
                            <article
                                key={agent.slug}
                                className="group rounded-[4px] border border-[color:var(--line)] dark:border-[color:var(--line)] bg-[var(--card)] dark:bg-[var(--card)] p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
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
                                <h2 className="mt-3 text-base font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] group-hover:text-[color:var(--accent)] dark:group-hover:text-[color:var(--accent)] transition-colors">
                                    {agent.name}
                                </h2>

                                {/* Heatmap */}
                                <div className="mt-4">
                                    {/* Legend */}
                                    <div className="flex items-center justify-end mb-2">
                                        <div className="flex items-center gap-1">
                                            <span className="text-[9px] text-[color:var(--ink-muted)] mr-0.5">Less</span>
                                            <div className="h-2.5 w-2.5 rounded-sm bg-[var(--line)] dark:bg-[var(--card)]" />
                                            <div className="h-2.5 w-2.5 rounded-sm bg-[color-mix(in_srgb,var(--ok)_16%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/50" />
                                            <div className="h-2.5 w-2.5 rounded-sm bg-[var(--ok)] dark:bg-[var(--ok)]" />
                                            <div className="h-2.5 w-2.5 rounded-sm bg-[var(--ok)] dark:bg-[var(--ok)]" />
                                            <span className="text-[9px] text-[color:var(--ink-muted)] ml-0.5">More</span>
                                        </div>
                                    </div>

                                    {/* Day labels */}
                                    <div className="flex items-center gap-1 mb-1">
                                        <div className="w-6 shrink-0" />
                                        <div className="flex-1 grid grid-cols-7 gap-1">
                                            {['M','T','W','T','F','S','S'].map((d, idx) => (
                                                <div key={idx} className="text-center text-[9px] font-semibold text-[color:var(--ink-muted)]">{d}</div>
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
                                                            <span className="text-[9px] font-bold text-[color:var(--ink-muted)] uppercase tracking-wide leading-none">
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
                                                                    className={`h-3.5 rounded-sm ${heatCellClass(agent.heatSeed, idx, fromDate, cell.active)} ${cell.active ? "hover:ring-1 hover:ring-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]" : ""} transition-all cursor-default`}
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
                                    <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/60 border border-[color:var(--line)] dark:border-[color:var(--line)]/50 px-3 py-2.5 flex items-center gap-2.5">
                                        <div className="h-7 w-7 rounded-[3px] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]/40 flex items-center justify-center shrink-0">
                                            <ClipboardCheck className="h-3.5 w-3.5 text-[color:var(--accent)] dark:text-[color:var(--accent)]" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] leading-none">{agent.tasks}</p>
                                            <p className="text-[10px] text-[color:var(--ink-muted)] mt-0.5">tasks done</p>
                                        </div>
                                    </div>
                                    <div className="rounded-[3px] bg-[var(--bg-deep)] dark:bg-[var(--card)]/60 border border-[color:var(--line)] dark:border-[color:var(--line)]/50 px-3 py-2.5 flex items-center gap-2.5">
                                        <div className="h-7 w-7 rounded-[3px] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] dark:bg-[color-mix(in_srgb,var(--ok)_22%,transparent)]/40 flex items-center justify-center shrink-0">
                                            <Shield className="h-3.5 w-3.5 text-[color:var(--ok)] dark:text-[color:var(--ok)]" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-[color:var(--ink)] dark:text-[color:var(--ink)] leading-none">{agent.reliability !== null ? `${agent.reliability}%` : "—"}</p>
                                            <p className="text-[10px] text-[color:var(--ink-muted)] mt-0.5">reliability</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="mt-4 flex gap-2">
                                    <Link
                                        href={`/dashboard/agents/${agent.slug}`}
                                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[3px] bg-[var(--accent)] px-3 py-2.5 text-xs font-semibold text-[color:var(--ink)] dark:bg-[var(--bg-deep)] dark:text-[color:var(--ink)] hover:bg-[var(--accent)] dark:hover:bg-[var(--card)] transition-colors"
                                    >
                                        View details
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                    <Link
                                        href={`/dashboard/agents/${agent.slug}/approvals`}
                                        className="inline-flex items-center gap-1.5 rounded-[3px] border border-[color:var(--line)] dark:border-[color:var(--line)] px-3 py-2.5 text-xs font-semibold text-[color:var(--ink-soft)] dark:text-[color:var(--ink-muted)] hover:bg-[var(--bg-deep)] dark:hover:bg-[var(--card)] transition-colors"
                                    >
                                        <Timer className="h-3.5 w-3.5" />
                                        Approvals
                                    </Link>
                                </div>
                            </article>
                        );
                    })}
                </div>
                )}

            </div>
        </div>
    );
}
