"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle, CheckCircle2, Clock3, GitPullRequest, ShieldCheck, Zap } from "lucide-react";

const benefits = [
    "Role-specific AI workers with clear responsibilities and outputs",
    "Direct integrations with GitHub, Jira, and Microsoft Teams via OAuth",
    "Approval checkpoints before risky actions and production changes",
    "Full audit trail: who did what, when, and why",
    "Faster execution on repetitive engineering and operations work",
    "Transparent monthly pricing aligned to role and usage",
];

// Mock live-operations panel items
const prEvents = [
    {
        type: "pr",
        label: "PR #482 opened",
        detail: "Fix auth timeout — billing webhook retries",
        agent: "AI Backend Developer",
        initials: "AB",
        color: "text-sky-400",
        ring: "ring-sky-500/20 bg-sky-500/10",
        risk: "low",
        riskColor: "text-emerald-400 bg-emerald-900/40",
        time: "Just now",
    },
    {
        type: "ci",
        label: "CI checks passed",
        detail: "423 / 423 tests green · 0 failures",
        agent: "AI QA Engineer",
        initials: "AQ",
        color: "text-violet-400",
        ring: "ring-violet-500/20 bg-violet-500/10",
        risk: "low",
        riskColor: "text-emerald-400 bg-emerald-900/40",
        time: "8m ago",
    },
    {
        type: "approval",
        label: "⚠ Approval needed",
        detail: "Merge migration · customer schema change",
        agent: "AI DevOps Engineer",
        initials: "AD",
        color: "text-amber-400",
        ring: "ring-amber-500/20 bg-amber-500/10",
        risk: "high",
        riskColor: "text-rose-400 bg-rose-900/40",
        time: "15m ago",
    },
];

export default function Solution() {
    return (
        <section className="bg-white dark:bg-slate-950 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                    {/* Text side */}
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                            The Solution
                        </span>
                        <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                            A practical AI operations layer for engineering teams
                        </h2>
                        <p className="mt-5 text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
                            AgentFarm gives teams a structured way to run AI workers inside real company workflows.
                            Designed for measurable output, human oversight, and predictable delivery — not demo-only automation.
                        </p>
                        <ul className="mt-8 space-y-3.5">
                            {benefits.map((b) => (
                                <li key={b} className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                                    <CheckCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                                    <span className="text-sm leading-relaxed">{b}</span>
                                </li>
                            ))}
                        </ul>
                        <a
                            href="/how-it-works"
                            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 transition-colors"
                        >
                            See full delivery flow <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>

                    {/* Visual side — live ops panel */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.55 }}
                        className="relative"
                    >
                        {/* Glow */}
                        <div className="absolute -inset-4 bg-gradient-to-br from-sky-100/60 via-emerald-50/40 to-indigo-100/60 dark:from-sky-900/20 dark:via-emerald-900/10 dark:to-indigo-900/20 rounded-3xl blur-2xl" />

                        {/* Panel */}
                        <div className="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">

                            {/* Panel titlebar */}
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-900">
                                <div className="w-3 h-3 rounded-full bg-rose-500/70" />
                                <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                                <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
                                <span className="ml-2 text-xs font-mono text-slate-500">AgentFarm — Live Operations</span>
                                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    4 agents active
                                </span>
                            </div>

                            {/* Event feed */}
                            <div className="p-4 space-y-3">
                                {prEvents.map((ev, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-3 rounded-xl bg-slate-900/80 border border-slate-800 p-3.5"
                                    >
                                        <div className={`w-8 h-8 rounded-xl ring-1 ${ev.ring} flex items-center justify-center shrink-0 text-xs font-bold ${ev.color}`}>
                                            {ev.initials}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-xs font-bold text-slate-200">{ev.label}</span>
                                                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${ev.riskColor}`}>
                                                    {ev.risk}
                                                </span>
                                                <span className="text-[10px] text-slate-500 ml-auto shrink-0">{ev.time}</span>
                                            </div>
                                            <p className="text-xs text-slate-400 truncate">{ev.detail}</p>
                                            <p className={`text-[11px] font-semibold mt-1 ${ev.color}`}>{ev.agent}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Approval action buttons */}
                                <div className="rounded-xl bg-amber-950/30 border border-amber-800/40 p-3.5">
                                    <p className="text-xs text-amber-300 font-semibold mb-2.5">
                                        HIGH-risk action pending your approval
                                    </p>
                                    <div className="flex gap-2">
                                        <button className="flex-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-2 transition-colors">
                                            Approve
                                        </button>
                                        <button className="flex-1 text-xs font-bold rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 py-2 transition-colors">
                                            Review diff
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Bottom stats strip */}
                            <div className="border-t border-slate-800 bg-slate-900 px-4 py-3 grid grid-cols-3 gap-3">
                                <div className="flex items-center gap-2">
                                    <Clock3 className="w-4 h-4 text-sky-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-slate-500">Median setup</p>
                                        <p className="text-xs font-bold text-slate-200">9 minutes</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <GitPullRequest className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-slate-500">Weekly output</p>
                                        <p className="text-xs font-bold text-slate-200">+18 PRs</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-violet-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-slate-500">Governance</p>
                                        <p className="text-xs font-bold text-slate-200">Audit-ready</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Operations snapshot callout */}
                        <div className="mt-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-4 py-3 flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                    Teams report faster cycle time within first 2 weeks
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
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
