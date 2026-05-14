"use client";

import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Clock3, GitPullRequest, ShieldCheck } from "lucide-react";

const benefits = [
    "Role-specific AI workers with clear responsibilities and outputs",
    "Direct integrations with GitHub, Jira, and Microsoft Teams via OAuth",
    "Approval checkpoints before risky actions and production changes",
    "Full audit trail: who did what, when, and why",
    "Faster execution on repetitive engineering and operations work",
    "Transparent monthly pricing aligned to role and usage",
];

const prEvents = [
    {
        label: "PR #482 opened",
        detail: "Fix auth timeout — billing webhook retries",
        agent: "AI Backend Developer",
        initials: "AB",
        accentColor: "#57c1ff",
        risk: "low",
        time: "just now",
    },
    {
        label: "CI checks passed",
        detail: "985 / 985 tests green · 0 failures",
        agent: "AI QA Engineer",
        initials: "AQ",
        accentColor: "#59d499",
        risk: "low",
        time: "8m ago",
    },
    {
        label: "⚠ Approval needed",
        detail: "Merge migration · customer schema change",
        agent: "AI DevOps Engineer",
        initials: "AD",
        accentColor: "#ffc533",
        risk: "high",
        time: "15m ago",
    },
];

export default function Solution() {
    return (
        <section className="bg-[var(--surface)] py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                    {/* Text side */}
                    <div>
                        <motion.p
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6a6b6c] mb-4"
                        >
                            The Solution
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                            className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-semibold text-[#f4f4f6] tracking-tight leading-[1.1]"
                        >
                            A practical AI operations layer for engineering teams
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-5 text-[#9c9c9d] leading-relaxed"
                        >
                            AgentFarm gives teams a structured way to run AI workers inside real company workflows.
                            Designed for measurable output, human oversight, and predictable delivery.
                        </motion.p>
                        <motion.ul
                            initial={{ opacity: 0, y: 8 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.14, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-8 space-y-3"
                        >
                            {benefits.map((b) => (
                                <li key={b} className="flex items-start gap-3 text-sm text-[#cdcdcd]">
                                    <CheckCircle2 className="w-4 h-4 text-[#59d499] shrink-0 mt-0.5" />
                                    <span className="leading-relaxed">{b}</span>
                                </li>
                            ))}
                        </motion.ul>
                        <motion.a
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.26, duration: 0.36 }}
                            href="/how-it-works"
                            className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[#57c1ff] hover:text-[#8dd7ff] transition-colors"
                        >
                            See full delivery flow <ArrowRight className="w-4 h-4" />
                        </motion.a>
                    </div>

                    {/* Visual side — dark live ops panel */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                        className="relative"
                    >
                        {/* Subtle glow behind panel */}
                        <div className="absolute -inset-6 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(87,193,255,0.05),transparent_72%)] pointer-events-none" />

                        {/* Panel */}
                        <div className="relative rounded-xl border border-[#242728] bg-[#0d0d0d] overflow-hidden shadow-2xl shadow-black/70">
                            {/* Titlebar */}
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#242728] bg-[#121212]">
                                <div className="w-2.5 h-2.5 rounded-full bg-[#ff6161]" />
                                <div className="w-2.5 h-2.5 rounded-full bg-[#ffc533]" />
                                <div className="w-2.5 h-2.5 rounded-full bg-[#59d499]" />
                                <span className="ml-2 text-[11px] font-mono text-[#6a6b6c]">AgentFarm — Live Operations</span>
                                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[#59d499] font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#59d499] animate-pulse" />
                                    4 agents active
                                </span>
                            </div>

                            {/* Event feed */}
                            <div className="p-4 space-y-2.5">
                                {prEvents.map((ev, i) => (
                                    <motion.div
                                        key={ev.label}
                                        initial={{ opacity: 0, x: -8 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.3 + i * 0.1, duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                                        className="flex items-start gap-3 rounded-lg bg-[#121212] border border-[#242728] p-3"
                                    >
                                        <div
                                            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[11px] font-bold"
                                            style={{
                                                background: `${ev.accentColor}14`,
                                                border: `1px solid ${ev.accentColor}28`,
                                                color: ev.accentColor,
                                            }}
                                        >
                                            {ev.initials}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-xs font-semibold text-[#f4f4f6]">{ev.label}</span>
                                                <span
                                                    className="text-[9px] font-semibold rounded px-1.5 py-0.5 ml-auto shrink-0"
                                                    style={{
                                                        color: ev.risk === "high" ? "#ffc533" : "#59d499",
                                                        background: ev.risk === "high" ? "rgba(255,197,51,0.1)" : "rgba(89,212,153,0.1)",
                                                    }}
                                                >
                                                    {ev.risk.toUpperCase()}
                                                </span>
                                                <span className="text-[10px] text-[#6a6b6c] shrink-0">{ev.time}</span>
                                            </div>
                                            <p className="text-xs text-[#9c9c9d] truncate">{ev.detail}</p>
                                            <p className="text-[11px] font-medium mt-0.5" style={{ color: ev.accentColor }}>{ev.agent}</p>
                                        </div>
                                    </motion.div>
                                ))}

                                {/* Approval row */}
                                <div className="rounded-lg bg-[rgba(255,197,51,0.04)] border border-[rgba(255,197,51,0.18)] p-3.5">
                                    <p className="text-xs text-[#ffc533] font-semibold mb-2.5">
                                        HIGH-risk action pending your approval
                                    </p>
                                    <div className="flex gap-2">
                                        <button className="flex-1 text-xs font-semibold rounded-lg bg-[#59d499] hover:bg-[#6ee8ae] text-black py-2 transition-colors">
                                            Approve
                                        </button>
                                        <button className="flex-1 text-xs font-semibold rounded-lg border border-[#242728] text-[#9c9c9d] hover:text-[#f4f4f6] hover:bg-white/[0.04] py-2 transition-colors">
                                            Review diff
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom stats strip */}
                            <div className="border-t border-[#242728] bg-[#121212] px-4 py-3 grid grid-cols-3 gap-3">
                                {[
                                    { icon: Clock3, color: "#57c1ff", label: "Median setup", value: "9 minutes" },
                                    { icon: GitPullRequest, color: "#59d499", label: "Weekly output", value: "+18 PRs" },
                                    { icon: ShieldCheck, color: "#ffc533", label: "Governance", value: "Audit-ready" },
                                ].map(({ icon: Icon, color, label, value }) => (
                                    <div key={label} className="flex items-center gap-2">
                                        <Icon className="w-4 h-4 shrink-0" style={{ color }} />
                                        <div>
                                            <p className="text-[10px] text-[#6a6b6c]">{label}</p>
                                            <p className="text-xs font-semibold text-[#f4f4f6]">{value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Callout below panel */}
                        <div className="mt-4 rounded-xl bg-[rgba(89,212,153,0.04)] border border-[rgba(89,212,153,0.15)] px-4 py-3 flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-[#59d499] shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-[#f4f4f6]">
                                    Teams report faster cycle time within first 2 weeks
                                </p>
                                <p className="text-xs text-[#6a6b6c] mt-0.5">
                                    Clear task ownership, faster handoffs, fewer repetitive blockers.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

