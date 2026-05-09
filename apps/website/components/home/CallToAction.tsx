"use client";

import { motion } from "framer-motion";
import { CheckCircle2, GitPullRequest, Shield, Zap } from "lucide-react";
import WaitlistForm from "@/components/shared/WaitlistForm";

const liveMetrics = [
    { icon: GitPullRequest, label: "46 PRs merged this week", color: "text-violet-400" },
    { icon: CheckCircle2, label: "184 tasks shipped", color: "text-emerald-400" },
    { icon: Shield, label: "100% audit-covered", color: "text-sky-400" },
];

export default function CallToAction() {
    return (
        <section id="waitlist" className="relative py-24 overflow-hidden bg-slate-950">

            {/* Gradient mesh */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_10%_20%,rgba(14,165,233,0.18)_0%,transparent_60%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_90%_80%,rgba(16,185,129,0.14)_0%,transparent_60%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_50%,rgba(99,102,241,0.08)_0%,transparent_70%)]" />
                <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{
                        backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)",
                        backgroundSize: "28px 28px",
                    }}
                />
            </div>

            {/* Animated orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "4s" }} />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDuration: "6s", animationDelay: "2s" }} />

            <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">

                {/* Product badge */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4 }}
                    className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-xs font-bold text-sky-400 mb-8"
                >
                    <Zap className="w-3.5 h-3.5" />
                    Deploy your first AI teammate in under 10 minutes
                </motion.div>

                <motion.h2
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.05 }}
                    className="text-4xl sm:text-5xl font-extrabold text-white leading-tight tracking-tight"
                >
                    Build a high-output engineering team
                    <br className="hidden sm:block" />
                    <span className="bg-gradient-to-r from-sky-400 to-emerald-400 bg-clip-text text-transparent">
                        with clear AI role ownership
                    </span>
                </motion.h2>

                <motion.p
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.1 }}
                    className="mt-5 text-lg text-slate-400 max-w-xl mx-auto leading-relaxed"
                >
                    Start with the roles you need today, connect GitHub and Jira in minutes,
                    and scale only when you see measurable shipping outcomes.
                </motion.p>

                {/* Live activity strip */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.15 }}
                    className="mt-8 inline-flex flex-wrap items-center justify-center gap-5"
                >
                    {liveMetrics.map(({ icon: Icon, label, color }) => (
                        <div key={label} className="flex items-center gap-2 text-sm font-medium text-slate-400">
                            <Icon className={`w-4 h-4 ${color}`} />
                            {label}
                        </div>
                    ))}
                </motion.div>

                {/* Waitlist form */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0.2 }}
                    className="mt-10 max-w-md mx-auto"
                >
                    <WaitlistForm />
                </motion.div>

                <p className="mt-4 text-xs text-slate-500">
                    No spam. No credit card required. Unsubscribe anytime.
                </p>

                {/* Trust bar */}
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                    {[
                        { icon: <Shield className="w-3.5 h-3.5" />, label: "SOC 2 Ready" },
                        { label: "Tenant-isolated Azure runtime" },
                        { label: "14-day free trial" },
                        { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Full audit trail" },
                    ].map(({ icon, label }) => (
                        <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                            {icon}
                            {label}
                        </span>
                    ))}
                </div>

                <p className="mt-6 text-sm text-slate-500">
                    Need full onboarding support?{" "}
                    <a
                        href="/get-started"
                        className="text-sky-400 hover:text-sky-300 font-semibold transition-colors"
                    >
                        Apply for early access →
                    </a>
                </p>
            </div>
        </section>
    );
}
