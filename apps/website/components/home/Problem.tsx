"use client";

import { motion } from "motion/react";
import { homeMarketingContent } from "@/lib/marketing-content";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

export default function Problem() {
    const { problem } = homeMarketingContent;

    return (
        <section aria-label="The problem" style={{ background: "var(--op-paper-2)", color: "var(--op-ink)", paddingTop: 96, paddingBottom: 96 }}>
            <div className="mx-auto max-w-[1100px] px-6">
                {/* Section header */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center mb-14"
                >
                    <p className="mb-4 text-[12px] uppercase tracking-[0.16em]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-pending)" }}>{problem.eyebrow}</p>
                    <h2
                        className="font-display font-extrabold text-[color:var(--op-ink)]"
                        style={{ fontSize: "clamp(2.1rem, 4.2vw, 3.2rem)", letterSpacing: "-0.03em", lineHeight: 1.04 }}
                    >
                        {problem.title}
                    </h2>
                    <p className="mt-4 mx-auto max-w-xl text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {problem.description}
                    </p>
                </motion.div>

                {/* Stat cards */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {problem.items.map((item, i) => (
                        <motion.div
                            key={item.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                            className="op-lift rounded-[18px] p-6 flex flex-col gap-4"
                            style={{ background: "var(--op-paper)", border: "1px solid var(--op-line)", boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 8px 20px -12px rgba(16,24,40,0.10)" }}
                        >
                            <div>
                                <p className="font-semibold leading-none" style={{ fontSize: "2.4rem", letterSpacing: "-0.03em" }}>
                                    <AnimatedNumber
                                        value={item.stat}
                                        style={{ background: "linear-gradient(120deg, var(--op-ink) 40%, var(--op-indigo))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", display: "inline-block" }}
                                    />
                                </p>
                                <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--op-muted)] uppercase tracking-[0.05em] font-medium">
                                    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-[2px]" style={{ background: "var(--op-indigo)", opacity: 0.55 }} />
                                    {item.statLabel}
                                </p>
                            </div>
                            <div>
                                <p className="font-semibold text-[15px] text-[color:var(--op-ink)] mb-1.5" style={{ letterSpacing: "-0.015em" }}>
                                    {item.title}
                                </p>
                                <p className="text-[14px] text-[var(--op-muted)] leading-[1.5]">
                                    {item.description}
                                </p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
