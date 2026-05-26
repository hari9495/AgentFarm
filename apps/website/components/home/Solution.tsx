"use client";

import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, Clock3, GitPullRequest, ShieldCheck } from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

export default function Solution() {
    const content = homeMarketingContent.solution;

    return (
        <section className="bg-[var(--surface)] py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
                    <div>
                        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ash)]">
                            {content.eyebrow}
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                            className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-semibold leading-[1.1] tracking-tight text-[var(--ink)]"
                        >
                            {content.title}
                        </motion.h2>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-5 leading-relaxed text-[var(--mute)]"
                        >
                            {content.description}
                        </motion.p>
                        <motion.ul
                            initial={{ opacity: 0, y: 8 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.14, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-8 space-y-3"
                        >
                            {content.benefits.map((benefit) => (
                                <li key={benefit} className="flex items-start gap-3 text-sm text-[var(--body-color)]">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#59d499]" />
                                    <span className="leading-relaxed">{benefit}</span>
                                </li>
                            ))}
                        </motion.ul>
                        <motion.a
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.26, duration: 0.36 }}
                            href={content.link.href}
                            className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[#57c1ff] transition-colors hover:text-[#8dd7ff]"
                        >
                            {content.link.label} <ArrowRight className="h-4 w-4" />
                        </motion.a>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
                        className="relative"
                    >
                        <div
                            className="relative overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface)]"
                            style={{ boxShadow: "0 20px 48px -16px rgba(0,0,0,0.45)" }}
                        >
                            <div className="flex items-center justify-between border-b border-[var(--hairline)] bg-[var(--surface-card)] px-4 py-3">
                                <span className="text-[11px] font-semibold text-[var(--ash)]">Live operations</span>
                                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--accent-green)]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-green)]" />
                                    {content.liveStatusLabel}
                                </span>
                            </div>

                            <div className="space-y-2.5 p-4">
                                {content.events.map((event, index) => (
                                    <motion.div
                                        key={event.label}
                                        initial={{ opacity: 0, x: -8 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: 0.3 + index * 0.1, duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                                        className="flex items-start gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-card)] p-3"
                                    >
                                        <div
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                                            style={{
                                                background: `${event.accentColor}14`,
                                                border: `1px solid ${event.accentColor}28`,
                                                color: event.accentColor,
                                            }}
                                        >
                                            {event.initials}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-0.5 flex items-center gap-2">
                                                <span className="text-xs font-semibold text-[var(--ink)]">{event.label}</span>
                                                <span
                                                    className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold"
                                                    style={{
                                                        color: event.risk === "high" ? "#ffc533" : "#59d499",
                                                        background: event.risk === "high" ? "rgba(255,197,51,0.1)" : "rgba(89,212,153,0.1)",
                                                    }}
                                                >
                                                    {event.risk.toUpperCase()}
                                                </span>
                                                <span className="shrink-0 text-[10px] text-[var(--ash)]">{event.time}</span>
                                            </div>
                                            <p className="truncate text-xs text-[var(--mute)]">{event.detail}</p>
                                            <p className="mt-0.5 text-[11px] font-medium" style={{ color: event.accentColor }}>
                                                {event.agent}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}

                                <div className="rounded-lg border border-[rgba(255,197,51,0.18)] bg-[rgba(255,197,51,0.04)] p-3.5">
                                    <p className="mb-2.5 text-xs font-semibold text-[#ffc533]">{content.approvalTitle}</p>
                                    <div className="flex gap-2">
                                        <button className="flex-1 rounded-lg bg-[#59d499] py-2 text-xs font-semibold text-black transition-colors hover:bg-[#6ee8ae]">
                                            Approve
                                        </button>
                                        <button className="flex-1 rounded-lg border border-[var(--hairline)] py-2 text-xs font-semibold text-[var(--mute)] transition-colors hover:bg-black/[0.04] hover:text-[var(--ink)] dark:hover:bg-white/[0.04]">
                                            Review diff
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3 border-t border-[var(--hairline)] bg-[var(--surface-card)] px-4 py-3">
                                {content.stats.map((stat, index) => {
                                    const Icon = index === 0 ? Clock3 : index === 1 ? GitPullRequest : ShieldCheck;
                                    return (
                                        <div key={stat.label} className="flex items-center gap-2">
                                            <Icon className="h-4 w-4 shrink-0" style={{ color: stat.color }} />
                                            <div>
                                                <p className="text-[10px] text-[var(--ash)]">{stat.label}</p>
                                                <p className="text-xs font-semibold text-[var(--ink)]">{stat.value}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[rgba(89,212,153,0.15)] bg-[rgba(89,212,153,0.04)] px-4 py-3">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#59d499]" />
                            <div>
                                <p className="text-sm font-semibold text-[var(--ink)]">{content.calloutTitle}</p>
                                <p className="mt-0.5 text-xs text-[var(--ash)]">{content.calloutDescription}</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
