"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    GitPullRequest,
    ShieldCheck,
    BarChart3,
    Users,
    CheckCircle2,
    Terminal,
    Zap,
    Clock,
    TrendingUp,
    AlertTriangle,
    Code2,
    CircleCheck,
    XCircle,
    ChevronRight,
} from "lucide-react";

const ease = [0.22, 1, 0.36, 1] as const;

const tabs = [
    {
        id: "hire",
        label: "Hire",
        icon: Users,
        color: "#57c1ff",
        headline: "Hire any role in minutes",
        desc: "Browse 12 agent roles, connect your tools, and deploy your first AI worker with no setup scripts â€” in under 10 minutes.",
        points: [
            "12 specialised roles: Developer, Tester, Sales, Support, and 8 more",
            "Connect GitHub, Jira, Slack with OAuth â€” no manual config",
            "Set name, persona, and escalation rules from the setup wizard",
        ],
    },
    {
        id: "execute",
        label: "Execute",
        icon: Terminal,
        color: "#59d499",
        headline: "Agents work with real tools",
        desc: "From writing code to merging PRs, agents operate your existing stack headlessly â€” or run any desktop app via the vision loop.",
        points: [
            "Full PR lifecycle: branch â†’ commit â†’ push â†’ CI â†’ merge",
            "Headless (API) and full desktop mode (visual, for any web app)",
            "21 developer skills composable across any workflow",
        ],
    },
    {
        id: "control",
        label: "Control",
        icon: ShieldCheck,
        color: "#ffc533",
        headline: "Nothing risky ships without you",
        desc: "Every high-stakes action pauses for human approval before executing â€” with a full evidence packet so you can decide in seconds.",
        points: [
            "Risk-classified queue: LOW auto-ships, MEDIUM/HIGH awaits approval",
            "Each packet includes change summary, rollback plan, and CI status",
            "Full audit trail exportable for compliance and security reviews",
        ],
    },
    {
        id: "scale",
        label: "Scale",
        icon: BarChart3,
        color: "#a78bfa",
        headline: "Scale output without headcount cost",
        desc: "Track every agent's output, measure cycle time, and add new roles as config â€” not new hires â€” as your company grows.",
        points: [
            "Real-time activity feed across all agents and all roles",
            "Usage and cost tracking per role and per workspace",
            "Add new roles as config â€” stamped from the Developer template",
        ],
    },
];

/* â”€â”€ Mock UI panels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function HirePanel() {
    const roles = [
        { name: "Developer", badge: "Active", color: "#57c1ff" },
        { name: "Tester", badge: "Ready", color: "#59d499" },
        { name: "Sales Rep", badge: "Ready", color: "#ffc533" },
        { name: "Corp. Assistant", badge: "Ready", color: "#a78bfa" },
    ];
    return (
        <div className="p-6 flex flex-col gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)]">
                Role Marketplace
            </p>
            <div className="grid grid-cols-2 gap-2.5">
                {roles.map((r) => (
                    <div
                        key={r.name}
                        className="flex items-center justify-between rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-3.5 py-3"
                    >
                        <div className="flex items-center gap-2.5">
                            <div
                                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${r.color}22` }}
                            >
                                <Users className="w-3 h-3" style={{ color: r.color }} />
                            </div>
                            <span className="text-[12px] font-medium text-[var(--ink)]">{r.name}</span>
                        </div>
                        <span
                            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                            style={{ color: r.color, background: `${r.color}18` }}
                        >
                            {r.badge}
                        </span>
                    </div>
                ))}
            </div>
            <button className="mt-1 w-full rounded-xl bg-[#57c1ff] text-[#050c14] text-[12px] font-bold py-2.5 cursor-pointer flex items-center justify-center gap-1.5">
                Deploy Developer agent
                <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <p className="text-center text-[10px] text-[var(--mute)]">Takes &lt; 10 minutes Â· No card required</p>
        </div>
    );
}

function ExecutePanel() {
    const steps = [
        { icon: Code2, label: "Task assigned", detail: "Fix auth timeout on /api/billing", color: "#57c1ff", done: true },
        { icon: GitPullRequest, label: "PR #482 opened", detail: "2 files changed Â· +34 / -12", color: "#59d499", done: true },
        { icon: Terminal, label: "CI triggered", detail: "985 tests runningâ€¦", color: "#ffc533", done: true },
        { icon: CircleCheck, label: "CI passed", detail: "985 / 985 green", color: "#59d499", done: true },
        { icon: GitPullRequest, label: "PR merged", detail: "Squash-merged to main", color: "#57c1ff", done: true },
    ];
    return (
        <div className="p-6 flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)] mb-1">
                Execution timeline
            </p>
            {steps.map((s, i) => (
                <div key={s.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                        <div
                            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                            style={{ background: `${s.color}22` }}
                        >
                            <s.icon className="w-3 h-3" style={{ color: s.color }} />
                        </div>
                        {i < steps.length - 1 && (
                            <div className="w-px flex-1 min-h-[16px] mt-1" style={{ background: `${s.color}30` }} />
                        )}
                    </div>
                    <div className="pb-1">
                        <p className="text-[12px] font-semibold text-[var(--ink)]">{s.label}</p>
                        <p className="text-[10px] text-[var(--mute)]">{s.detail}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ControlPanel() {
    const items = [
        { title: "Schema migration â€” staging", risk: "HIGH", status: "Awaiting approval", color: "#ff5757" },
        { title: "Bulk email campaign send", risk: "MEDIUM", status: "Awaiting approval", color: "#ffc533" },
        { title: "Lint + formatting pass", risk: "LOW", status: "Auto-approved", color: "#59d499" },
    ];
    return (
        <div className="p-6 flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)] mb-1">
                Approval queue
            </p>
            {items.map((item) => (
                <div
                    key={item.title}
                    className="rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-4 py-3 flex items-center justify-between gap-3"
                >
                    <div className="flex items-center gap-2.5 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
                        <div className="min-w-0">
                            <p className="text-[12px] font-medium text-[var(--ink)] truncate">{item.title}</p>
                            <p className="text-[10px] text-[var(--mute)]">{item.status}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <span
                            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                            style={{ color: item.color, background: `${item.color}18` }}
                        >
                            {item.risk}
                        </span>
                        {item.risk !== "LOW" && (
                            <>
                                <button className="w-5 h-5 rounded-full bg-[#59d499]/20 flex items-center justify-center cursor-pointer">
                                    <CircleCheck className="w-3 h-3 text-[#59d499]" />
                                </button>
                                <button className="w-5 h-5 rounded-full bg-[#ff5757]/20 flex items-center justify-center cursor-pointer">
                                    <XCircle className="w-3 h-3 text-[#ff5757]" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

function ScalePanel() {
    const stats = [
        { label: "PRs merged", value: "312", delta: "+18%", color: "#57c1ff", icon: GitPullRequest },
        { label: "Hours saved", value: "1,840", delta: "+32%", color: "#59d499", icon: Clock },
        { label: "Cycle time", value: "âˆ’41%", delta: "vs last month", color: "#ffc533", icon: TrendingUp },
        { label: "Cost / task", value: "$1.20", delta: "avg", color: "#a78bfa", icon: Zap },
    ];
    return (
        <div className="p-6 flex flex-col gap-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--mute)] mb-1">
                Output dashboard
            </p>
            <div className="grid grid-cols-2 gap-2.5">
                {stats.map((s) => (
                    <div
                        key={s.label}
                        className="rounded-xl border border-[var(--hairline)] bg-white/[0.03] px-4 py-3"
                    >
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <s.icon className="w-3 h-3" style={{ color: s.color }} />
                            <p className="text-[10px] text-[var(--mute)]">{s.label}</p>
                        </div>
                        <p className="text-[18px] font-black text-[var(--ink)] leading-none">{s.value}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: s.color }}>{s.delta}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

const panelMap: Record<string, React.ReactNode> = {
    hire: <HirePanel />,
    execute: <ExecutePanel />,
    control: <ControlPanel />,
    scale: <ScalePanel />,
};

export default function Features() {
    const [active, setActive] = useState("hire");
    const tab = tabs.find((t) => t.id === active)!;

    return (
        <section className="bg-[var(--canvas)] py-24 border-t border-[var(--hairline)]" id="features">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.5, ease }}
                    className="max-w-2xl mb-12"
                >
                    <span className="chip chip-accent text-xs mb-4">Platform</span>
                    <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold text-[var(--ink)] tracking-[-0.03em] leading-tight">
                        One platform for every step
                        <span className="block text-[var(--mute)]">of AI-powered work.</span>
                    </h2>
                </motion.div>

                {/* Tab switcher */}
                <div className="flex flex-wrap gap-2 mb-10">
                    {tabs.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setActive(t.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer border"
                            style={
                                active === t.id
                                    ? {
                                        background: `${t.color}18`,
                                        borderColor: `${t.color}50`,
                                        color: t.color,
                                    }
                                    : {
                                        background: "transparent",
                                        borderColor: "var(--hairline)",
                                        color: "var(--mute)",
                                    }
                            }
                        >
                            <t.icon className="w-3.5 h-3.5" />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Content area */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={active}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3, ease }}
                        className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
                    >
                        {/* Left â€” description */}
                        <div>
                            <div
                                className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-5"
                                style={{ background: `${tab.color}22` }}
                            >
                                <tab.icon className="w-5 h-5" style={{ color: tab.color }} />
                            </div>

                            <h3 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold text-[var(--ink)] tracking-[-0.03em] leading-tight mb-4">
                                {tab.headline}
                            </h3>

                            <p className="text-[var(--mute)] leading-relaxed mb-6">{tab.desc}</p>

                            <ul className="space-y-3">
                                {tab.points.map((p) => (
                                    <li key={p} className="flex items-start gap-3 text-sm text-[var(--mute)]">
                                        <CheckCircle2
                                            className="w-4 h-4 mt-0.5 shrink-0"
                                            style={{ color: tab.color }}
                                        />
                                        {p}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Right â€” mock UI */}
                        <div
                            className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] overflow-hidden"
                            style={{ boxShadow: `0 0 40px ${tab.color}12` }}
                        >
                            {/* Window chrome */}
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--hairline)] bg-white/[0.02]">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5757]/60" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#ffc533]/60" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#59d499]/60" />
                                <span className="ml-3 text-[10px] text-[var(--mute)] font-mono">
                                    agentfarm.ai / {tab.id}
                                </span>
                            </div>
                            {panelMap[active]}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </section>
    );
}

