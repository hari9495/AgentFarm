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

// ── Daily bar chart ───────────────────────────────────────────────────────────

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function DailyBars({ values, barBg }: { values: number[]; barBg: string }) {
    const max = Math.max(...values) || 1;
    return (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "40px" }}>
            {values.map((v, i) => {
                const pct = Math.max(12, Math.round((v / max) * 100));
                const isToday = i === values.length - 1;
                return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                        <div
                            className={barBg + (isToday ? "" : " opacity-50")}
                            style={{ width: "100%", height: pct + "%", borderRadius: "3px", transition: "all 0.3s" }}
                        />
                        <span style={{ fontSize: "9px", fontWeight: 600, lineHeight: 1, color: isToday ? "#475569" : "#cbd5e1" }}>
                            {DAY_LABELS[i]}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="relative rounded-[4px] border border-[color:var(--line)] bg-[var(--card)] p-5 flex flex-col gap-4 shadow-sm overflow-hidden animate-pulse">
            <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-[3px] bg-[var(--line)]" />
                <div className="h-6 w-16 rounded-full bg-[var(--line)]" />
            </div>
            <div className="space-y-2">
                <div className="h-8 w-24 rounded bg-[var(--line)]" />
                <div className="h-4 w-32 rounded bg-[var(--line)]" />
                <div className="h-3 w-20 rounded bg-[var(--line)]" />
            </div>
            <div className="h-10 w-full rounded bg-[var(--line)]" />
            <div className="flex items-center justify-between pt-1 border-t border-[color:var(--line)]">
                <div className="h-5 w-28 rounded-full bg-[var(--line)]" />
                <div className="h-3 w-8 rounded bg-[var(--line)]" />
            </div>
        </div>
    );
}

// ── Card config ───────────────────────────────────────────────────────────────

const CARDS = [
    { key: "tasksCompleted"  as const, icon: CheckCircle2,  border: "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",     bg: "bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] to-[var(--card)]",     iconBg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",     iconColor: "text-[color:var(--accent)]",     barBg: "bg-[var(--accent)]",     dPos: "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]", dNeg: "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]", label: "Tasks Completed"   },
    { key: "prsMerged"       as const, icon: GitPullRequest, border: "border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",  bg: "bg-gradient-to-br from-[color-mix(in_srgb,var(--accent)_8%,transparent)] to-[var(--card)]",  iconBg: "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",  iconColor: "text-[color:var(--accent)]",  barBg: "bg-[var(--accent)]",  dPos: "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]", dNeg: "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]", label: "PRs Merged"        },
    { key: "medianCycleTime" as const, icon: Timer,          border: "border-[color:color-mix(in_srgb,var(--warn)_40%,transparent)]",   bg: "bg-gradient-to-br from-[color-mix(in_srgb,var(--warn)_8%,transparent)] to-[var(--card)]",   iconBg: "bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]",   iconColor: "text-[color:var(--warn)]",   barBg: "bg-[var(--warn)]",   dPos: "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]", dNeg: "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]", label: "Median Cycle Time" },
    { key: "estimatedSavings" as const, icon: TrendingUp,   border: "border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]", bg: "bg-gradient-to-br from-[color-mix(in_srgb,var(--ok)_8%,transparent)] to-[var(--card)]", iconBg: "bg-[color-mix(in_srgb,var(--ok)_10%,transparent)]", iconColor: "text-[color:var(--ok)]", barBg: "bg-[var(--ok)]", dPos: "text-[color:var(--ok)] bg-[color-mix(in_srgb,var(--ok)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--ok)_40%,transparent)]", dNeg: "text-[color:var(--danger)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--danger)_40%,transparent)]", label: "Estimated Savings" },
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
                    className="pl-10 pr-8 py-2 text-sm font-semibold text-[color:var(--ink-soft)] bg-[var(--card)] border border-[color:var(--line)] rounded-[3px] shadow-sm hover:border-[color:var(--line-strong)] focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] cursor-pointer transition-colors disabled:opacity-60"
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
                    className="text-sm text-[color:var(--ink-soft)] font-medium bg-[var(--card)] border border-[color:var(--line)] rounded-[3px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[color:var(--line-strong)] transition-colors cursor-pointer"
                />
                <span className="text-xs text-[color:var(--ink-muted)] font-medium">to</span>
                <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    max={toDateStr(new Date())}
                    onChange={e => setToDate(e.target.value)}
                    className="text-sm text-[color:var(--ink-soft)] font-medium bg-[var(--card)] border border-[color:var(--line)] rounded-[3px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] hover:border-[color:var(--line-strong)] transition-colors cursor-pointer"
                />
            </div>

            {/* Apply button — always visible */}
            <button
                onClick={handleApply}
                disabled={!fromDate || !toDate || fromDate > toDate}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed rounded-[3px] shadow-sm transition-colors"
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
                    <div key={c.key} className="rounded-[4px] border border-[color:var(--line)] bg-[var(--card)] p-5 shadow-sm text-center text-xs text-[color:var(--ink-muted)]">
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
                {CARDS.map((cfg, idx) => {
                    const stat = data.stats[cfg.key];
                    const Icon = cfg.icon;
                    const isDown = stat.delta?.startsWith("−") || stat.delta?.startsWith("-");
                    const dClass = stat.positive ? cfg.dPos : cfg.dNeg;
                    return (
                        <div
                            key={cfg.key}
                            style={{ animationDelay: idx * 60 + "ms" }}
                            className={"choreo-rise relative rounded-[4px] border " + cfg.border + " " + cfg.bg + " p-5 flex flex-col gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 [transition:transform_220ms_cubic-bezier(0.22,1,0.36,1),box-shadow_220ms_cubic-bezier(0.22,1,0.36,1)]"}
                        >
                            {/* Top: icon + delta */}
                            <div className="flex items-start justify-between gap-3">
                                <div className={"w-10 h-10 rounded-[3px] " + cfg.iconBg + " flex items-center justify-center shrink-0"}>
                                    <Icon className={"w-5 h-5 " + cfg.iconColor} />
                                </div>
                                {stat.delta !== null
                                    ? <span className={"inline-flex items-center gap-1 text-xs font-bold rounded-full px-2.5 py-1 " + dClass}>
                                        {isDown ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                        {stat.delta}
                                      </span>
                                    : <span className="inline-flex items-center text-xs font-semibold rounded-full px-2.5 py-1 text-[color:var(--ink-muted)] bg-[var(--bg-deep)]">—</span>
                                }
                            </div>

                            {/* Metric */}
                            <div>
                                <p className="text-3xl font-extrabold text-[color:var(--ink)] tabular-nums leading-none tracking-tight">{stat.label}</p>
                                <p className="mt-1 text-sm font-semibold text-[color:var(--ink-soft)]">{cfg.label}</p>
                                <p className="text-xs text-[color:var(--ink-muted)] mt-0.5">{stat.sub}</p>
                            </div>

                            {/* Daily bars */}
                            <DailyBars values={stat.trend} barBg={cfg.barBg} />

                            {/* Bottom: agent + live */}
                            <div className="flex items-center justify-between pt-1 border-t border-[color:var(--line)]">
                                <div className="flex items-center gap-1.5">
                                    <span className={"inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shrink-0 " + agent.aBg}>
                                        {agent.ini}
                                    </span>
                                    <span className="text-[11px] text-[color:var(--ink-muted)] font-medium truncate">{agent.name}</span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] animate-pulse" />
                                    <span className="text-[9px] font-semibold text-[color:var(--ink-muted)] uppercase tracking-wider">Live</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
