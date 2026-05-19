"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import {
    ArrowRight,
    Terminal,
    GitPullRequest,
    ShieldCheck,
    Zap,
    Sparkles,
    Users,
    Puzzle,
} from "lucide-react";
import HeroScene3D from "@/components/home/HeroScene3D";
import {
    AuroraBackground,
    HoloText,
    NeonChip,
    MagicButton,
    GlowCard,
    BrutalStat,
    CursorAura,
} from "@/components/magic";

const cycleWords = ["Write Code", "Handle Support", "Run Sales", "Manage Ops", "Ship Products"];

const valueProps = [
    {
        icon: Users,
        color: "var(--m-aurora-1)",
        title: "12 agent roles",
        desc: "Engineering, Sales, Support, Ops and 8 more — each scoped to its domain.",
    },
    {
        icon: ShieldCheck,
        color: "var(--m-aurora-3)",
        title: "Human in the loop",
        desc: "Risky actions pause for your approval before anything executes.",
    },
    {
        icon: Puzzle,
        color: "var(--m-aurora-2)",
        title: "Fully extensible",
        desc: "Connect any MCP server, OAuth tool, or custom API your team uses.",
    },
];

const liveActivity = [
    {
        icon: GitPullRequest,
        label: "PR #482 merged",
        detail: "Fix auth timeout · billing webhook",
        time: "2m",
        tone: "cyan" as const,
    },
    {
        icon: ShieldCheck,
        label: "Approval granted",
        detail: "Schema migration · staging ✓",
        time: "8m",
        tone: "mint" as const,
    },
    {
        icon: Terminal,
        label: "CI passed",
        detail: "985 / 985 tests green",
        time: "15m",
        tone: "violet" as const,
    },
];

const toneColor: Record<string, string> = {
    cyan: "var(--m-aurora-1)",
    mint: "var(--m-aurora-3)",
    violet: "var(--m-aurora-2)",
};

export default function Hero() {
    const [wordIdx, setWordIdx] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setWordIdx((i) => (i + 1) % cycleWords.length), 2200);
        return () => clearInterval(id);
    }, []);

    return (
        <section className="magic-canvas relative overflow-hidden pt-24 pb-24 sm:pt-32 sm:pb-32">
            <AuroraBackground grid grain />
            <CursorAura color="rgba(91, 140, 255, 0.28)" size={420} />

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
                    {/* ──────────────── LEFT ──────────────── */}
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="mb-7 flex flex-wrap items-center gap-2"
                        >
                            <NeonChip tone="cyan">
                                <Sparkles className="w-3 h-3" />
                                12 AI worker roles
                            </NeonChip>
                            <NeonChip tone="mint">
                                <Zap className="w-3 h-3" />
                                Deploy in 10 minutes
                            </NeonChip>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
                            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                            transition={{ duration: 0.7, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
                            className="text-[clamp(2.8rem,5.8vw,4.6rem)] font-black leading-[1.02] tracking-[-0.035em] text-[var(--m-ink)]"
                        >
                            Hire AI workers that
                            <span className="block relative h-[1.2em] overflow-hidden">
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={cycleWords[wordIdx]}
                                        initial={{ y: "100%", opacity: 0, filter: "blur(10px)" }}
                                        animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
                                        exit={{ y: "-100%", opacity: 0, filter: "blur(10px)" }}
                                        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                        className="absolute inset-0"
                                    >
                                        <HoloText>{cycleWords[wordIdx]}</HoloText>
                                    </motion.span>
                                </AnimatePresence>
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
                            className="mt-6 text-[17px] leading-relaxed max-w-xl text-[var(--m-ink-muted)]"
                        >
                            AgentFarm gives every department a dedicated AI worker — with real tool access,
                            role-scoped skills, and human oversight on every decision that matters.
                        </motion.p>

                        {/* Value-prop cards — cofounder.co style */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
                            className="mt-7 grid grid-cols-1 sm:grid-cols-3 gap-3"
                        >
                            {valueProps.map(({ icon: Icon, color, title, desc }) => (
                                <div
                                    key={title}
                                    className="glass-card rounded-xl px-4 py-3.5 flex flex-col gap-2"
                                    style={{ boxShadow: "0 0 0 1px var(--m-hairline) inset" }}
                                >
                                    <div
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg"
                                        style={{ background: `${color}22` }}
                                    >
                                        <Icon className="w-3.5 h-3.5" style={{ color }} />
                                    </div>
                                    <p className="text-[13px] font-semibold text-[var(--m-ink)] leading-snug">{title}</p>
                                    <p className="text-[11px] text-[var(--m-ink-faint)] leading-relaxed">{desc}</p>
                                </div>
                            ))}
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.55, delay: 0.34, ease: [0.16, 1, 0.3, 1] }}
                            className="mt-9 flex flex-col sm:flex-row items-start sm:items-center gap-3"
                        >
                            <MagicButton href="/get-started" variant="primary" as="a">
                                Start free — no card
                                <ArrowRight className="w-4 h-4" />
                            </MagicButton>
                            <MagicButton href="/book-demo" variant="ghost" as="a">
                                Book a live demo
                            </MagicButton>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5, delay: 0.5 }}
                            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2"
                        >
                            {["21 developer skills", "Approval-driven safety", "Tenant-isolated Azure"].map(
                                (t, i) => (
                                    <span
                                        key={t}
                                        className="flex items-center gap-1.5 text-xs text-[var(--m-ink-faint)]"
                                    >
                                        {i > 0 && (
                                            <span className="w-1 h-1 rounded-full bg-[var(--m-hairline-strong)]" />
                                        )}
                                        {t}
                                    </span>
                                )
                            )}
                        </motion.div>
                    </div>

                    {/* ──────────────── RIGHT ──────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.75, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className="relative"
                    >
                        <GlowCard edge spotlight elevated className="overflow-hidden p-0">
                            <div className="relative aspect-[5/4] w-full">
                                <HeroScene3D />
                                {/* live activity overlay */}
                                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[var(--m-canvas)] via-[var(--m-canvas)]/80 to-transparent">
                                    <div className="flex flex-col gap-2">
                                        {liveActivity.map((item, i) => (
                                            <motion.div
                                                key={item.label}
                                                initial={{ opacity: 0, x: -14 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{
                                                    delay: 0.6 + i * 0.12,
                                                    duration: 0.4,
                                                    ease: [0.16, 1, 0.3, 1],
                                                }}
                                                className="glass-card flex items-center gap-3 px-3 py-2.5"
                                                style={{
                                                    borderRadius: 14,
                                                    boxShadow:
                                                        "0 0 0 1px var(--m-hairline) inset, var(--m-depth-1)",
                                                }}
                                            >
                                                <item.icon
                                                    className="w-4 h-4 shrink-0"
                                                    style={{ color: toneColor[item.tone] }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-[var(--m-ink)] truncate">
                                                        {item.label}
                                                    </p>
                                                    <p className="text-[10px] text-[var(--m-ink-faint)] truncate">
                                                        {item.detail}
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-mono text-[var(--m-ink-faint)] shrink-0">
                                                    {item.time} ago
                                                </span>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </GlowCard>

                        {/* Floating brutalist stat */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.86, rotate: -3 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            transition={{ delay: 0.85, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                            className="absolute -top-5 -right-5 m-float"
                        >
                            <BrutalStat value="10×" label="dev throughput" />
                        </motion.div>

                        {/* Floating neon badge */}
                        <motion.div
                            initial={{ opacity: 0, x: -16 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 1.0, duration: 0.5 }}
                            className="absolute -left-4 bottom-12 hidden sm:block"
                        >
                            <GlowCard edge={false} spotlight={false} className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="pulse-ring inline-block w-2 h-2 rounded-full"
                                        style={{ color: "var(--m-aurora-3)", background: "var(--m-aurora-3)" }}
                                    />
                                    <span className="text-xs font-semibold text-[var(--m-ink)]">
                                        Live ·{" "}
                                        <span className="text-[var(--m-ink-muted)]">42 agents working</span>
                                    </span>
                                </div>
                            </GlowCard>
                        </motion.div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
