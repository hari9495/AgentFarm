/* Hallmark · macrostructure: Marquee Hero · tone: professional/technical · anchor hue: green */
"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { ArrowRight, CheckCircle2, GitPullRequest, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";

const cycleWords = ["Write Code", "Handle Support", "Run Sales", "Manage Ops", "Ship Products"];

const activity = [
    { icon: GitPullRequest, label: "PR #482 merged", detail: "Fix auth timeout · billing webhook", time: "2m" },
    { icon: ShieldCheck, label: "Approval granted", detail: "Schema migration · staging ✓", time: "8m" },
    { icon: Terminal, label: "CI passed", detail: "985 / 985 tests green", time: "15m" },
];

export default function Hero() {
    const [wordIdx, setWordIdx] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setWordIdx((i) => (i + 1) % cycleWords.length), 2400);
        return () => clearInterval(id);
    }, []);

    return (
        <section className="relative bg-[var(--canvas)] pt-28 pb-24 sm:pt-36 sm:pb-32 overflow-hidden" aria-label="Hero">
            {/* Single static radial — not animated */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
                style={{
                    background: "radial-gradient(ellipse 70% 40% at 50% -5%, rgba(89,212,153,0.07) 0%, transparent 70%)",
                }}
            />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-16 items-start lg:items-center">

                    {/* LEFT — copy */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-green)] mb-6">
                            AI Workers for Engineering Teams
                        </p>

                        <h1 className="text-[clamp(2.8rem,5.5vw,4.4rem)] font-black leading-[1.03] tracking-[-0.035em] text-[var(--ink)]">
                            Hire AI workers that
                            <span className="block relative h-[1.15em] overflow-hidden">
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={cycleWords[wordIdx]}
                                        initial={{ y: "100%", opacity: 0 }}
                                        animate={{ y: "0%", opacity: 1 }}
                                        exit={{ y: "-100%", opacity: 0 }}
                                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute inset-0 text-[var(--accent-green)]"
                                    >
                                        {cycleWords[wordIdx]}
                                    </motion.span>
                                </AnimatePresence>
                            </span>
                        </h1>

                        <p className="mt-6 text-[17px] leading-relaxed max-w-xl text-[var(--body-color)]">
                            AgentFarm gives every department a dedicated AI worker — with real tool access,
                            role-scoped skills, and human oversight on every decision that matters.
                        </p>

                        <ul className="mt-7 space-y-2.5">
                            {[
                                "12 agent roles: Engineering, Sales, Support, Ops, and 8 more",
                                "Approval checkpoints on every high-risk action before it executes",
                                "Full audit trail — who did what, when, and why",
                            ].map((benefit) => (
                                <li key={benefit} className="flex items-start gap-3 text-sm text-[var(--body-color)]">
                                    <CheckCircle2 className="w-4 h-4 text-[var(--accent-green)] shrink-0 mt-0.5" />
                                    <span className="leading-relaxed">{benefit}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <Link href="/get-started" className="btn-primary">
                                Start free — no card
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link href="/book-demo" className="btn-secondary">
                                Book a demo
                            </Link>
                        </div>

                        <p className="mt-5 text-[12px] text-[var(--ash)]">
                            Deploy in under 10 minutes · No card required
                        </p>
                    </motion.div>

                    {/* RIGHT — product activity feed, no fake chrome */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <figure
                            className="m-0 rounded-2xl border border-[var(--hairline)] overflow-hidden"
                            style={{ boxShadow: "0 24px 56px -20px rgba(0,0,0,0.55)" }}
                        >
                            <div className="bg-[var(--surface-card)] p-5 space-y-2.5">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[11px] font-semibold text-[var(--ink)]">Live Operations</span>
                                    <span className="flex items-center gap-1.5 text-[11px] text-[var(--accent-green)] font-semibold">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
                                        4 agents active
                                    </span>
                                </div>

                                {activity.map(({ icon: Icon, label, detail, time }, i) => (
                                    <motion.div
                                        key={label}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.5 + i * 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                        className="flex items-start gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-elevated)] px-3.5 py-3"
                                    >
                                        <Icon className="w-4 h-4 text-[var(--accent-green)] shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-[var(--ink)]">{label}</p>
                                            <p className="text-[10px] text-[var(--ash)] mt-0.5">{detail}</p>
                                        </div>
                                        <span className="text-[10px] font-mono text-[var(--ash)] shrink-0">{time} ago</span>
                                    </motion.div>
                                ))}

                                {/* Approval action */}
                                <div className="rounded-xl border border-[rgba(89,212,153,0.2)] bg-[rgba(89,212,153,0.04)] px-3.5 py-3">
                                    <p className="text-[11px] font-semibold text-[var(--ink)] mb-2.5">
                                        Schema migration awaiting your approval
                                    </p>
                                    <div className="flex gap-2">
                                        <button className="flex-1 text-xs font-semibold rounded-lg bg-[var(--accent-green)] text-black py-2 cursor-pointer transition-opacity hover:opacity-90">
                                            Approve
                                        </button>
                                        <button className="flex-1 text-xs font-semibold rounded-lg border border-[var(--hairline)] text-[var(--mute)] py-2 cursor-pointer hover:text-[var(--ink)] transition-colors">
                                            Review diff
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </figure>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}
