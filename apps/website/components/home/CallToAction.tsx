"use client";

import { motion } from "motion/react";
import { BarChart3, CheckCircle2, GitPullRequest, Shield, ShieldCheck, Users, Zap } from "lucide-react";
import WaitlistForm from "@/components/shared/WaitlistForm";
import { homeMarketingContent } from "@/lib/marketing-content";

export default function CallToAction() {
    const content = homeMarketingContent.cta;

    return (
        <section id="waitlist" className="relative overflow-hidden bg-[var(--canvas)] py-28">
            <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(87,193,255,0.06)_0%,transparent_70%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_10%_80%,rgba(89,212,153,0.04)_0%,transparent_70%)]" />
            </div>
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#ff5757]/40 to-transparent" />

            <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
                    <div className="text-left">
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="chip chip-accent mb-8 inline-flex text-xs"
                        >
                            <Zap className="mr-1 h-3 w-3" />
                            {content.badge}
                        </motion.div>

                        <motion.h2
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.48, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                            className="text-[clamp(2rem,4vw,3rem)] font-semibold leading-[1.08] tracking-tight text-[var(--ink)]"
                        >
                            {content.titleLead}
                            <br />
                            <span className="bg-gradient-to-r from-[#ff5757] via-[#ff8c42] to-[#ff6161] bg-clip-text text-transparent">
                                {content.titleAccent}
                            </span>
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.44, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-5 leading-relaxed text-[var(--mute)]"
                        >
                            {content.description}
                        </motion.p>

                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.16 }}
                            className="mt-7 flex flex-wrap items-center gap-5"
                        >
                            {content.liveMetrics.map((metric, index) => {
                                const Icon = index === 0 ? GitPullRequest : index === 1 ? CheckCircle2 : Shield;
                                return (
                                    <div key={metric.label} className="flex items-center gap-2 text-sm text-[var(--mute)]">
                                        <Icon className="h-4 w-4 shrink-0" style={{ color: metric.color }} />
                                        {metric.label}
                                    </div>
                                );
                            })}
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.44, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-8"
                        >
                            <WaitlistForm />
                        </motion.div>

                        <p className="mt-4 text-xs text-[var(--ash)]">{content.footnote}</p>

                        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                            {content.trustItems.map((item) => (
                                <span key={item} className="flex items-center gap-1.5 text-xs text-[var(--ash)]">
                                    <span className="h-1 w-1 rounded-full bg-[var(--hairline)]" />
                                    {item}
                                </span>
                            ))}
                        </div>

                        <p className="mt-6 text-sm text-[var(--ash)]">
                            {content.supportLine}{" "}
                            <a href={content.supportLink.href} className="font-medium text-[#57c1ff] transition-colors hover:text-[#8dd7ff]">
                                {content.supportLink.label}
                            </a>
                        </p>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        className="hidden lg:block"
                    >
                        <div
                            className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)]"
                            style={{ boxShadow: "0 0 60px rgba(87,193,255,0.08), 0 1px 0 rgba(255,255,255,0.06) inset" }}
                        >
                            <div className="flex items-center gap-2 border-b border-[var(--hairline)] bg-white/[0.02] px-4 py-3">
                                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5757]/60" />
                                <span className="h-2.5 w-2.5 rounded-full bg-[#ffc533]/60" />
                                <span className="h-2.5 w-2.5 rounded-full bg-[#59d499]/60" />
                                <span className="ml-3 text-[10px] font-mono text-[var(--mute)]">app.agentfarm.ai - activity feed</span>
                            </div>

                            <div className="grid grid-cols-3 gap-px border-b border-[var(--hairline)] bg-[var(--hairline)]">
                                {content.summaryStats.map((item, index) => {
                                    const Icon = index === 0 ? Users : index === 1 ? BarChart3 : ShieldCheck;
                                    return (
                                        <div key={item.label} className="flex flex-col gap-1 bg-[var(--surface-card)] px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <Icon className="h-3 w-3" style={{ color: item.color }} />
                                                <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--mute)]">{item.label}</p>
                                            </div>
                                            <p className="text-[20px] font-black leading-none text-[var(--ink)]">{item.value}</p>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="divide-y divide-[var(--hairline)]">
                                {content.rows.map((row) => (
                                    <div key={row.role} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold" style={{ background: `${row.color}20`, color: row.color }}>
                                                {row.role[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-[11px] font-semibold text-[var(--ink)]">{row.task}</p>
                                                <p className="text-[9px] text-[var(--mute)]">{row.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: row.color }} />
                                            <span className="text-[9px] font-mono text-[var(--mute)]">{row.time}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
