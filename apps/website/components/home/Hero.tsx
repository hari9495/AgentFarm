"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CheckCircle2, GitPullRequest, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";
import { homeMarketingContent } from "@/lib/marketing-content";

const activityIcons = [GitPullRequest, ShieldCheck, Terminal];

export default function Hero() {
    const [wordIdx, setWordIdx] = useState(0);
    const content = homeMarketingContent.hero;

    useEffect(() => {
        const id = setInterval(() => {
            setWordIdx((index) => (index + 1) % content.cycleWords.length);
        }, 2400);
        return () => clearInterval(id);
    }, [content.cycleWords.length]);

    return (
        <section className="relative overflow-hidden bg-[var(--canvas)] pt-28 pb-24 sm:pt-36 sm:pb-32" aria-label="Hero">
            <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
                style={{
                    background: "radial-gradient(ellipse 70% 40% at 50% -5%, rgba(89,212,153,0.07) 0%, transparent 70%)",
                }}
            />

            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 items-start gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-green)]">
                            {content.eyebrow}
                        </p>

                        <h1 className="text-[clamp(2.8rem,5.5vw,4.4rem)] font-black leading-[1.03] tracking-[-0.035em] text-[var(--ink)]">
                            {content.titleLead}
                            <span className="relative block h-[1.15em] overflow-hidden">
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={content.cycleWords[wordIdx]}
                                        initial={{ y: "100%", opacity: 0 }}
                                        animate={{ y: "0%", opacity: 1 }}
                                        exit={{ y: "-100%", opacity: 0 }}
                                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute inset-0 text-[var(--accent-green)]"
                                    >
                                        {content.cycleWords[wordIdx]}
                                    </motion.span>
                                </AnimatePresence>
                            </span>
                        </h1>

                        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[var(--body-color)]">
                            {content.description}
                        </p>

                        <ul className="mt-7 space-y-2.5">
                            {content.benefits.map((benefit) => (
                                <li key={benefit} className="flex items-start gap-3 text-sm text-[var(--body-color)]">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-green)]" />
                                    <span className="leading-relaxed">{benefit}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                            <Link href={content.primaryCta.href} className="btn-primary">
                                {content.primaryCta.label}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link href={content.secondaryCta.href} className="btn-secondary">
                                {content.secondaryCta.label}
                            </Link>
                        </div>

                        <p className="mt-5 text-[12px] text-[var(--ash)]">{content.caption}</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <figure
                            className="m-0 overflow-hidden rounded-2xl border border-[var(--hairline)]"
                            style={{ boxShadow: "0 24px 56px -20px rgba(0,0,0,0.55)" }}
                        >
                            <div className="space-y-2.5 bg-[var(--surface-card)] p-5">
                                <div className="mb-4 flex items-center justify-between">
                                    <span className="text-[11px] font-semibold text-[var(--ink)]">{content.activityHeader}</span>
                                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent-green)]">
                                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
                                        {content.activityStatus}
                                    </span>
                                </div>

                                {content.activity.map((item, index) => {
                                    const Icon = activityIcons[index] ?? Terminal;
                                    return (
                                        <motion.div
                                            key={item.label}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 + index * 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                            className="flex items-start gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-elevated)] px-3.5 py-3"
                                        >
                                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-green)]" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-semibold text-[var(--ink)]">{item.label}</p>
                                                <p className="mt-0.5 text-[10px] text-[var(--ash)]">{item.detail}</p>
                                            </div>
                                            <span className="shrink-0 text-[10px] font-mono text-[var(--ash)]">{item.time} ago</span>
                                        </motion.div>
                                    );
                                })}

                                <div className="rounded-xl border border-[rgba(89,212,153,0.2)] bg-[rgba(89,212,153,0.04)] px-3.5 py-3">
                                    <p className="mb-2.5 text-[11px] font-semibold text-[var(--ink)]">{content.approvalTitle}</p>
                                    <div className="flex gap-2">
                                        <button className="flex-1 cursor-pointer rounded-lg bg-[var(--accent-green)] py-2 text-xs font-semibold text-black transition-opacity hover:opacity-90">
                                            {content.approvalPrimary}
                                        </button>
                                        <button className="flex-1 cursor-pointer rounded-lg border border-[var(--hairline)] py-2 text-xs font-semibold text-[var(--mute)] transition-colors hover:text-[var(--ink)]">
                                            {content.approvalSecondary}
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
