"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { ArrowRight, CheckCircle2, Terminal, GitPullRequest, ShieldCheck, Zap } from "lucide-react";
import HeroScene3D from "@/components/home/HeroScene3D";

const cycleWords = ["Ship Work", "Write Code", "Merge PRs", "Pass CI", "Fix Bugs"];

const outcomes = [
    "Deploy your first AI teammate in under 10 minutes",
    "Every risky action pauses for human approval — safe by default",
    "Full audit trail on every action, ready for compliance review",
];

const liveActivity = [
    {
        icon: GitPullRequest,
        label: "PR #482 merged",
        detail: "Fix auth timeout Â· billing webhook",
        time: "2m",
        color: "#57c1ff",
    },
    {
        icon: ShieldCheck,
        label: "Approval granted",
        detail: "Schema migration Â· staging âœ“",
        time: "8m",
        color: "#59d499",
    },
    {
        icon: Terminal,
        label: "CI passed",
        detail: "985/985 tests green",
        time: "15m",
        color: "#9c9c9d",
    },
];

export default function Hero() {
    const [wordIdx, setWordIdx] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setWordIdx((i) => (i + 1) % cycleWords.length), 2200);
        return () => clearInterval(id);
    }, []);

    return (
        <section className="relative overflow-hidden pt-20 pb-20 sm:pt-28 sm:pb-28 bg-[var(--canvas)]">
            {/* Background grid + glow */}
            <div className="absolute inset-0 -z-10" aria-hidden>
                <div className="absolute inset-0 bg-[radial-gradient(72%_58%_at_8%_8%,rgba(87,193,255,0.07)_0%,transparent_72%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(55%_45%_at_92%_12%,rgba(89,212,153,0.05)_0%,transparent_72%)]" />
                <div
                    className="absolute inset-0 opacity-[0.025]"
                    style={{
                        backgroundImage: "linear-gradient(to right, rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,1) 1px, transparent 1px)",
                        backgroundSize: "44px 44px",
                        maskImage: "radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)",
                    }}
                />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
                    {/* Left */}
                    <div>
                        {/* Badge */}
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="chip chip-accent mb-8 text-xs inline-flex"
                        >
                            <Zap className="w-3 h-3 mr-1 shrink-0" />
                            985 tests passing · v2 now live
                        </motion.div>

                        {/* Headline with animated text cycle */}
                        <motion.h1
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.52, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                            className="text-[clamp(2.6rem,5.5vw,4.2rem)] font-semibold text-[#f4f4f6] leading-[1.06] tracking-[-0.03em]"
                        >
                            AI Teammates That
                            <span className="block relative h-[1.2em] overflow-hidden">
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={cycleWords[wordIdx]}
                                        initial={{ y: "100%", opacity: 0 }}
                                        animate={{ y: "0%", opacity: 1 }}
                                        exit={{ y: "-100%", opacity: 0 }}
                                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute inset-0 bg-gradient-to-r from-[#ff5757] via-[#ff8c42] to-[#ff6161] bg-clip-text text-transparent"
                                    >
                                        {cycleWords[wordIdx]}
                                    </motion.span>
                                </AnimatePresence>
                            </span>
                        </motion.h1>

                        {/* Sub */}
                        <motion.p
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.48, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-6 text-[17px] text-[#9c9c9d] max-w-lg leading-relaxed"
                        >
                            Deploy role-based AI agents that execute real engineering work across GitHub, Jira, Teams, and email —
                            with built-in approval gates and a full audit trail on every action.
                        </motion.p>

                        {/* Outcomes */}
                        <motion.ul
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.44, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-6 space-y-2.5"
                        >
                            {outcomes.map((item) => (
                                <li key={item} className="flex items-start gap-2.5 text-sm text-[#cdcdcd]">
                                    <CheckCircle2 className="w-4 h-4 text-[#59d499] mt-0.5 shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </motion.ul>

                        {/* CTAs */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.48, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3"
                        >
                            <a
                                href="/get-started"
                                className="group inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-black bg-white rounded-lg hover:bg-[#e8e8e8] transition-all shadow-sm"
                            >
                                Start Free — it&apos;s free
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </a>
                            <a
                                href="/book-demo"
                                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#9c9c9d] border border-[#242728] rounded-lg hover:text-[#f4f4f6] hover:border-[rgba(255,255,255,0.15)] hover:bg-white/[0.04] transition-colors"
                            >
                                Book a Demo
                            </a>
                        </motion.div>

                        {/* Trust bar */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.4, delay: 0.36 }}
                            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1"
                        >
                            {["21 developer skills", "Approval-driven safety", "Tenant-isolated Azure"].map((t, i) => (
                                <span key={t} className="flex items-center gap-1.5 text-xs text-[#6a6b6c]">
                                    {i > 0 && <span className="w-1 h-1 rounded-full bg-[#242728]" />}
                                    {t}
                                </span>
                            ))}
                        </motion.div>
                    </div>

                    {/* Right: 3D scene + live activity panel */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.56, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        className="relative"
                    >
                        <div className="relative rounded-xl border border-[#242728] overflow-hidden bg-[#0d0d0d] shadow-2xl shadow-black/60">
                            <HeroScene3D />
                            {/* Overlay: live activity feed */}
                            <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-[#0d0d0d] to-transparent">
                                <div className="flex flex-col gap-2">
                                    {liveActivity.map((item, i) => (
                                        <motion.div
                                            key={item.label}
                                            initial={{ opacity: 0, x: -12 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 + i * 0.1, duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                                            className="flex items-center gap-3 bg-[#121212]/90 backdrop-blur border border-[#242728] rounded-lg px-3 py-2"
                                        >
                                            <item.icon className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-[#f4f4f6] truncate">{item.label}</p>
                                                <p className="text-[10px] text-[#6a6b6c] truncate">{item.detail}</p>
                                            </div>
                                            <span className="text-[10px] text-[#6a6b6c] shrink-0">{item.time}m ago</span>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Floating stat badge */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.88 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.7, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute -top-4 -right-4 bg-[#121212] border border-[#242728] rounded-xl px-4 py-3 shadow-xl shadow-black/50"
                        >
                            <p className="text-2xl font-semibold text-[#f4f4f6] leading-none">985</p>
                            <p className="text-[10px] text-[#6a6b6c] mt-0.5">tests passing</p>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

