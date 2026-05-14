"use client";

import { motion } from "motion/react";
import { CheckCircle2, GitPullRequest, Shield, Zap } from "lucide-react";
import WaitlistForm from "@/components/shared/WaitlistForm";

const liveMetrics = [
    { icon: GitPullRequest, label: "46 PRs merged this week", color: "#59d499" },
    { icon: CheckCircle2, label: "184 tasks shipped", color: "#57c1ff" },
    { icon: Shield, label: "100% audit-covered", color: "#ffc533" },
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

            <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

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
                    className="text-[clamp(2rem,4.5vw,3.2rem)] font-semibold text-[#f4f4f6] leading-[1.08] tracking-tight"
                >
                    Build a high-output engineering team
                    <br className="hidden sm:block" />
                    <span className="bg-gradient-to-r from-[#ff5757] via-[#ff8c42] to-[#ff6161] bg-clip-text text-transparent">
                        with clear AI role ownership
                    </span>
                </motion.h2>

                <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.44, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                    className="mt-5 text-[#9c9c9d] max-w-xl mx-auto leading-relaxed"
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
                    className="mt-8 inline-flex flex-wrap items-center justify-center gap-5"
                >
                    {liveMetrics.map(({ icon: Icon, label, color }) => (
                        <div key={label} className="flex items-center gap-2 text-sm text-[#9c9c9d]">
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
                    className="mt-10 max-w-md mx-auto"
                >
                    <WaitlistForm />
                </motion.div>

                <p className="mt-4 text-xs text-[#6a6b6c]">
                    No spam. No credit card required. Unsubscribe anytime.
                </p>

                {/* Trust bar */}
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                    {[
                        { label: "SOC 2 Ready" },
                        { label: "Tenant-isolated Azure runtime" },
                        { label: "14-day free trial" },
                        { label: "Full audit trail" },
                    ].map(({ label }) => (
                        <span key={label} className="flex items-center gap-1.5 text-xs text-[#6a6b6c]">
                            <span className="w-1 h-1 rounded-full bg-[#242728]" />
                            {label}
                        </span>
                    ))}
                </div>

                <p className="mt-6 text-sm text-[#6a6b6c]">
                    Need full onboarding support?{" "}
                    <a
                        href="/get-started"
                        className="text-[#57c1ff] hover:text-[#8dd7ff] font-medium transition-colors"
                    >
                        Apply for early access →
                    </a>
                </p>
            </div>
        </section>
    );
}
