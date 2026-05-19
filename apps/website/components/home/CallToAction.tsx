"use client";

import { motion } from "motion/react";
import { CheckCircle2, GitPullRequest, Shield, Zap, Users, BarChart3, ShieldCheck } from "lucide-react";
import WaitlistForm from "@/components/shared/WaitlistForm";

const liveMetrics = [
    { icon: GitPullRequest, label: "46 PRs merged this week", color: "#59d499" },
    { icon: CheckCircle2, label: "184 tasks shipped", color: "#57c1ff" },
    { icon: Shield, label: "100% audit-covered", color: "#ffc533" },
];

const agentRows = [
    { role: "Developer", task: "PR #482 merged â€” fix auth timeout", time: "2m ago", status: "done", color: "#57c1ff" },
    { role: "Tester", task: "985 / 985 tests green Â· CI passed", time: "8m ago", status: "done", color: "#59d499" },
    { role: "Sales Rep", task: "Follow-up email sent to Acme Corp", time: "14m ago", status: "done", color: "#ffc533" },
    { role: "Corp. Asst", task: "Meeting notes drafted Â· Notion synced", time: "21m ago", status: "done", color: "#a78bfa" },
];

export default function CallToAction() {
    return (
        <section id="waitlist" className="relative py-28 overflow-hidden bg-[var(--canvas)]">

            {/* Very subtle radial glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(87,193,255,0.06)_0%,transparent_70%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_10%_80%,rgba(89,212,153,0.04)_0%,transparent_70%)]" />
            </div>

            {/* Red accent stripe at top */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[#ff5757]/40 to-transparent" />

            <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* Two-column layout: CTA left, product preview right */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                    {/* â”€â”€ Left: CTA text + form â”€â”€ */}
                    <div className="text-left lg:text-left">
                        {/* Badge */}
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="chip chip-accent inline-flex mb-8 text-xs"
                        >
                            <Zap className="w-3 h-3 mr-1" />
                            Deploy your first AI teammate in under 10 minutes
                        </motion.div>

                        <motion.h2
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.48, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                            className="text-[clamp(2rem,4vw,3rem)] font-semibold text-[var(--ink)] leading-[1.08] tracking-tight"
                        >
                            Build a high-output team
                            <br />
                            <span className="bg-gradient-to-r from-[#ff5757] via-[#ff8c42] to-[#ff6161] bg-clip-text text-transparent">
                                with AI role ownership
                            </span>
                        </motion.h2>

                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.44, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-5 text-[var(--mute)] leading-relaxed"
                        >
                            Start with the roles you need today, connect GitHub and Jira in minutes,
                            and scale only when you see measurable shipping outcomes.
                        </motion.p>

                        {/* Live activity strip */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.4, delay: 0.16 }}
                            className="mt-7 flex flex-wrap items-center gap-5"
                        >
                            {liveMetrics.map(({ icon: Icon, label, color }) => (
                                <div key={label} className="flex items-center gap-2 text-sm text-[var(--mute)]">
                                    <Icon className="w-4 h-4 shrink-0" style={{ color }} />
                                    {label}
                                </div>
                            ))}
                        </motion.div>

                        {/* Waitlist form */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.44, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="mt-8"
                        >
                            <WaitlistForm />
                        </motion.div>

                        <p className="mt-4 text-xs text-[var(--ash)]">
                            No spam. No credit card required. Unsubscribe anytime.
                        </p>

                        {/* Trust bar */}
                        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
                            {[
                                { label: "SOC 2 Ready" },
                                { label: "Tenant-isolated Azure runtime" },
                                { label: "14-day free trial" },
                                { label: "Full audit trail" },
                            ].map(({ label }) => (
                                <span key={label} className="flex items-center gap-1.5 text-xs text-[var(--ash)]">
                                    <span className="w-1 h-1 rounded-full bg-[var(--hairline)]" />
                                    {label}
                                </span>
                            ))}
                        </div>

                        <p className="mt-6 text-sm text-[var(--ash)]">
                            Need full onboarding support?{" "}
                            <a
                                href="/get-started"
                                className="text-[#57c1ff] hover:text-[#8dd7ff] font-medium transition-colors"
                            >
                                Apply for early access â†’
                            </a>
                        </p>
                    </div>

                    {/* â”€â”€ Right: product preview (dashboard mockup) â”€â”€ */}
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                        className="hidden lg:block"
                    >
                        <div
                            className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] overflow-hidden"
                            style={{ boxShadow: "0 0 60px rgba(87,193,255,0.08), 0 1px 0 rgba(255,255,255,0.06) inset" }}
                        >
                            {/* Window chrome */}
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--hairline)] bg-white/[0.02]">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5757]/60" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#ffc533]/60" />
                                <span className="w-2.5 h-2.5 rounded-full bg-[#59d499]/60" />
                                <span className="ml-3 text-[10px] text-[var(--mute)] font-mono">
                                    app.agentfarm.ai â€” Activity Feed
                                </span>
                            </div>

                            {/* Summary stats row */}
                            <div className="grid grid-cols-3 gap-px bg-[var(--hairline)] border-b border-[var(--hairline)]">
                                {[
                                    { icon: Users, label: "Agents active", value: "4", color: "#57c1ff" },
                                    { icon: BarChart3, label: "Tasks today", value: "23", color: "#59d499" },
                                    { icon: ShieldCheck, label: "Awaiting approval", value: "2", color: "#ffc533" },
                                ].map(({ icon: Icon, label, value, color }) => (
                                    <div key={label} className="bg-[var(--surface-card)] px-4 py-3 flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <Icon className="w-3 h-3" style={{ color }} />
                                            <p className="text-[9px] font-semibold uppercase tracking-widest text-[var(--mute)]">{label}</p>
                                        </div>
                                        <p className="text-[20px] font-black text-[var(--ink)] leading-none">{value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Agent activity rows */}
                            <div className="divide-y divide-[var(--hairline)]">
                                {agentRows.map((row) => (
                                    <div key={row.role} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold"
                                                style={{ background: `${row.color}20`, color: row.color }}
                                            >
                                                {row.role[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-[11px] font-semibold text-[var(--ink)] truncate">{row.task}</p>
                                                <p className="text-[9px] text-[var(--mute)]">{row.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: row.color }} />
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
