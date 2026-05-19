"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Magic v2 hero band for the dashboard Overview panel.
 * Self-contained — relies only on CSS classes shipped in dashboard/app/globals.css.
 * Aurora background + holographic title + neon chips + brutalist KPI plates.
 */

type Tone = "cyan" | "violet" | "mint" | "rose";

function NeonChip({ tone = "cyan", children }: { tone?: Tone; children: ReactNode }) {
    return (
        <span className={`neon-chip neon-chip-${tone}`}>
            <span className="dot" aria-hidden />
            {children}
        </span>
    );
}

export type MissionHeroStat = {
    label: string;
    value: string | number;
    sub?: string;
    tone?: "cyan" | "mint" | "violet" | "rose";
};

export function MissionHero({
    tenantName,
    planName,
    pendingApprovals,
    activeBots,
    estimatedCost,
    systemHealthPct,
}: {
    tenantName: string;
    planName: string;
    pendingApprovals: number;
    activeBots: number;
    estimatedCost: number;
    systemHealthPct: number;
}) {
    const healthTone: Tone =
        systemHealthPct >= 80 ? "mint" : systemHealthPct >= 50 ? "violet" : "rose";

    const stats: MissionHeroStat[] = [
        { label: "Active agents", value: activeBots, tone: "cyan" },
        { label: "Pending approvals", value: pendingApprovals, tone: "violet" },
        {
            label: "Health",
            value: `${systemHealthPct}%`,
            tone: healthTone === "mint" ? "mint" : healthTone === "violet" ? "violet" : "rose",
        },
        {
            label: "Est. monthly cost",
            value: `$${estimatedCost.toFixed(1)}`,
            tone: "mint",
        },
    ];

    return (
        <section className="magic-canvas relative overflow-hidden" style={{ borderRadius: 28, marginBottom: "1.25rem" }}>
            <div className="absolute inset-0">
                <div aria-hidden className="aurora-bg">
                    <div className="orb orb-3" />
                    <div className="orb orb-4" />
                    <div className="cyber-grid" />
                    <div className="magic-grain" />
                </div>
            </div>

            <div className="relative z-10 px-6 sm:px-8 py-7 sm:py-9">
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="flex flex-wrap items-center gap-2 mb-4"
                >
                    <NeonChip tone="cyan">Mission control</NeonChip>
                    <NeonChip tone={healthTone}>
                        {systemHealthPct >= 80 ? "All systems nominal" : systemHealthPct >= 50 ? "Degraded" : "Attention"}
                    </NeonChip>
                    <NeonChip tone="violet">Tenant-isolated</NeonChip>
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0)" }}
                    transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                        fontSize: "clamp(1.9rem, 3.8vw, 2.8rem)",
                        fontWeight: 900,
                        lineHeight: 1.05,
                        letterSpacing: "-0.03em",
                        color: "var(--m-ink)",
                        margin: 0,
                    }}
                >
                    Welcome back to{" "}
                    <span className="holo-text">{tenantName || "your workspace"}</span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.16 }}
                    style={{
                        marginTop: "0.6rem",
                        marginBottom: 0,
                        maxWidth: "60ch",
                        color: "var(--m-ink-muted)",
                        fontSize: "0.96rem",
                        lineHeight: 1.55,
                    }}
                >
                    Your AI workforce, governed in real time. Provisioning, approvals, evidence, and runtime
                    health — one mission view.{" "}
                    <span style={{ color: "var(--m-ink-soft)", fontWeight: 600 }}>
                        Plan: {planName || "—"}
                    </span>
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.55, delay: 0.26 }}
                    style={{
                        marginTop: "1.6rem",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "0.85rem",
                    }}
                >
                    {stats.map((s, i) => (
                        <motion.div
                            key={s.label}
                            initial={{ opacity: 0, y: 12, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ delay: 0.32 + i * 0.06, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                            className="glass-card holo-edge"
                            style={{
                                padding: "0.95rem 1.05rem",
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.2rem",
                            }}
                        >
                            <span
                                style={{
                                    fontSize: "0.62rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.14em",
                                    fontWeight: 700,
                                    color: "var(--m-ink-faint)",
                                }}
                            >
                                {s.label}
                            </span>
                            <span
                                style={{
                                    fontSize: "1.65rem",
                                    fontWeight: 800,
                                    lineHeight: 1.05,
                                    letterSpacing: "-0.02em",
                                    color: "var(--m-ink)",
                                }}
                            >
                                {s.value}
                            </span>
                            {s.sub ? (
                                <span style={{ fontSize: "0.72rem", color: "var(--m-ink-faint)" }}>{s.sub}</span>
                            ) : null}
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}
