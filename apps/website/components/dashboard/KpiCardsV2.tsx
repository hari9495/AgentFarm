"use client";

// KpiCardsV2 — daily bars + agent dropdown + date range filter
import { useEffect, useState } from "react";
import {
    ArrowDownRight,
    ArrowUpRight,
    CheckCircle2,
    GitPullRequest,
    Timer,
    TrendingUp,
    CalendarDays,
    ChevronDown,
} from "lucide-react";

type StatPayload = { label: string; delta: string | null; positive: boolean; trend: number[]; sub: string };
type StatsResponse = { source: "live"; stats: { tasksCompleted: StatPayload; prsMerged: StatPayload; medianCycleTime: StatPayload; estimatedSavings: StatPayload } };

type AgentOption = { id: string; ini: string; name: string; aBg: string };
type AgentId = string;

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date) {
    return d.toISOString().split("T")[0]!;
}
function defaultFrom() {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return toDateStr(d);
}
function defaultTo() {
    return toDateStr(new Date());
}
function formatLabel(from: string, to: string) {
    const f = new Date(from + "T00:00:00");
    const t = new Date(to + "T00:00:00");
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return f.toLocaleDateString("en-US", opts) + " – " + t.toLocaleDateString("en-US", opts);
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
// A quiet trend line with a soft area wash and an accent end-dot. Reads as a
// premium metric detail, not a chunky chart. Monochrome so it never competes
// with the number.

function MiniSpark({ values }: { values: number[] }) {
    if (!values || values.length < 2) return <div style={{ width: 72, height: 30 }} />;
    const w = 72, h = 30, pad = 3;
    const max = Math.max(...values), min = Math.min(...values), rng = max - min || 1;
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - pad - ((v - min) / rng) * (h - pad * 2);
        return [x, y] as const;
    });
    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `0,${h} ${line} ${w},${h}`;
    const [ex, ey] = pts[pts.length - 1]!;
    const gid = `spk${Math.round(min)}${Math.round(max)}${values.length}`;
    return (
        <svg width={w} height={h} className="shrink-0 overflow-visible" aria-hidden>
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill={`url(#${gid})`} />
            <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
            <circle cx={ex} cy={ey} r="2.4" fill="var(--accent)" />
        </svg>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="rounded-xl border border-[color:var(--line)] bg-[var(--card)] p-5 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="h-3.5 w-24 rounded bg-[var(--line)]" />
                <div className="h-4 w-4 rounded bg-[var(--line)]" />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
                <div className="space-y-2">
                    <div className="h-8 w-20 rounded bg-[var(--line)]" />
                    <div className="h-3 w-28 rounded bg-[var(--line)]" />
                </div>
                <div className="h-[30px] w-[72px] rounded bg-[var(--line)]" />
            </div>
        </div>
    );
}

// ── Card config ───────────────────────────────────────────────────────────────

const CARDS = [
    { key: "tasksCompleted"   as const, icon: CheckCircle2,   label: "Tasks Completed"   },
    { key: "prsMerged"        as const, icon: GitPullRequest, label: "PRs Merged"        },
    { key: "medianCycleTime"  as const, icon: Timer,          label: "Median Cycle Time" },
    { key: "estimatedSavings" as const, icon: TrendingUp,     label: "Estimated Savings" },
] as const;

// ── Main component ────────────────────────────────────────────────────────────

export default function KpiCardsV2() {
    const [data, setData]               = useState<StatsResponse | null>(null);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState(false);

    // Agents loaded from API
    const [agents, setAgents]           = useState<AgentOption[]>([]);
    const [agentsLoading, setAgentsLoading] = useState(true);

    // Filter state
    const [activeAgent, setActiveAgent] = useState<AgentId>("");
    const [fromDate, setFromDate]       = useState(defaultFrom);
    const [toDate, setToDate]           = useState(defaultTo);
    const [appliedFrom, setAppliedFrom] = useState(defaultFrom);
    const [appliedTo, setAppliedTo]     = useState(defaultTo);

    const agent = agents.find(a => a.id === activeAgent) ?? agents[0] ?? { id: "", ini: "—", name: "All Agents", aBg: "bg-[var(--bg-deep)]" };

    function fetchStats(agentId: AgentId, from: string, to: string) {
        setLoading(true);
        setError(false);
        fetch(`/api/dashboard/stats?agent=${agentId}&from=${from}&to=${to}`, { credentials: "include" })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then((b: StatsResponse) => { setData(b); setLoading(false); })
            .catch(() => { setError(true); setLoading(false); });
    }

    // Load agents list from API, then kick off initial stats fetch
    useEffect(() => {
        fetch("/api/dashboard/agents", { credentials: "include" })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then((b: { agents: AgentOption[] }) => {
                setAgents(b.agents);
                const firstId = b.agents[0]?.id ?? "";
                setActiveAgent(firstId);
                setAgentsLoading(false);
                fetchStats(firstId, appliedFrom, appliedTo);
            })
            .catch(() => {
                setAgentsLoading(false);
                fetchStats("", appliedFrom, appliedTo);
            });
    }, []); // eslint-disable-line

    // Switch agent — fetch immediately
    function handleAgentChange(id: AgentId) {
        setActiveAgent(id);
        fetchStats(id, appliedFrom, appliedTo);
    }

    // Apply date range
    function handleApply() {
        if (!fromDate || !toDate || fromDate > toDate) return;
        setAppliedFrom(fromDate);
        setAppliedTo(toDate);
        fetchStats(activeAgent, fromDate, toDate);
    }

    // ── Filter bar ───────────────────────────────────────────────────────────
    const filterBar = (
        <div className="flex flex-wrap items-center gap-3">

            {/* Agent dropdown */}
            <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                    <span className={"inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0 " + agent.aBg}>
                        {agent.ini}
                    </span>
                </div>
                <select
                    value={activeAgent}
                    onChange={e => handleAgentChange(e.target.value)}
                    disabled={agentsLoading || agents.length === 0}
                    style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none" }}
                    className="pl-10 pr-8 py-2 text-sm font-semibold text-[color:var(--ink-soft)] bg-[var(--card)] border border-[color:var(--line)] rounded-lg shadow-sm hover:border-[color:var(--line-strong)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] cursor-pointer transition-colors disabled:opacity-60"
                >
                    {agentsLoading
                        ? <option value="">Loading…</option>
                        : agents.length === 0
                            ? <option value="">No agents yet</option>
                            : agents.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))
                    }
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                    <ChevronDown className="w-3.5 h-3.5 text-[color:var(--ink-muted)]" />
                </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px h-6 bg-[var(--line)]" />

            {/* Date range */}
            <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[color:var(--ink-muted)] shrink-0" />
                <input
                    type="date"
                    value={fromDate}
                    max={toDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="text-sm text-[color:var(--ink-soft)] font-medium bg-[var(--card)] border border-[color:var(--line)] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[color:var(--line-strong)] transition-colors cursor-pointer"
                />
                <span className="text-xs text-[color:var(--ink-muted)] font-medium">to</span>
                <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    max={toDateStr(new Date())}
                    onChange={e => setToDate(e.target.value)}
                    className="text-sm text-[color:var(--ink-soft)] font-medium bg-[var(--card)] border border-[color:var(--line)] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[color:var(--line-strong)] transition-colors cursor-pointer"
                />
            </div>

            {/* Apply button — always visible */}
            <button
                onClick={handleApply}
                disabled={!fromDate || !toDate || fromDate > toDate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
            >
                Apply
            </button>

        </div>
    );

    // ── States ───────────────────────────────────────────────────────────────

    if (error) return (
        <div className="space-y-3">
            {filterBar}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {CARDS.map(c => (
                    <div key={c.key} className="rounded-xl border border-[color:var(--line)] bg-[var(--card)] p-5 shadow-sm text-center text-xs text-[color:var(--ink-muted)]">
                        Stats unavailable
                    </div>
                ))}
            </div>
        </div>
    );

    if (!data || loading) return (
        <div className="space-y-3">
            {filterBar}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {CARDS.map(c => <SkeletonCard key={c.key} />)}
            </div>
        </div>
    );

    // ── Cards ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-3">
            {filterBar}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {CARDS.map((cfg) => {
                    const stat = data.stats[cfg.key];
                    const Icon = cfg.icon;
                    const isDown = stat.delta?.startsWith("−") || stat.delta?.startsWith("-");
                    return (
                        <div
                            key={cfg.key}
                            className="group rounded-xl border border-[color:var(--line)] bg-[var(--card)] p-5 [transition:box-shadow_220ms_cubic-bezier(0.22,1,0.36,1),transform_220ms_cubic-bezier(0.22,1,0.36,1),border-color_220ms] hover:-translate-y-px hover:border-[color:var(--line-strong)] hover:shadow-[0_6px_24px_-12px_rgba(16,24,40,0.18)]"
                        >
                            {/* Label + quiet icon */}
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[13px] font-medium text-[color:var(--ink-muted)] truncate">{cfg.label}</span>
                                <Icon className="w-4 h-4 shrink-0 text-[color:var(--ink-muted)] opacity-40 [transition:opacity_220ms] group-hover:opacity-70" />
                            </div>

                            {/* Number + delta, sparkline right */}
                            <div className="mt-3 flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[30px] leading-none font-semibold tracking-[-0.02em] text-[color:var(--ink)] tabular-nums">{stat.label}</span>
                                        {stat.delta !== null && (
                                            <span className={"inline-flex items-center gap-0.5 text-xs font-semibold " + (stat.positive ? "text-[color:var(--ok)]" : "text-[color:var(--danger)]")}>
                                                {isDown ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                                                {stat.delta}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-2 text-xs text-[color:var(--ink-muted)] truncate">{stat.sub}</p>
                                </div>
                                <MiniSpark values={stat.trend} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
