"use client";

import { motion } from "framer-motion";
import { ArrowRight, CheckCircle, Clock3, GitPullRequest, ShieldCheck } from "lucide-react";

const benefits = [
    "Role-specific AI workers with clear responsibilities and outputs",
    "Direct integrations with GitHub, Slack, Jira, and documentation tools",
    "Approval checkpoints before risky actions and production changes",
    "Full audit trail: who did what, when, and why",
    "Faster execution on repetitive engineering and operations work",
    "Transparent monthly pricing aligned to role and usage",
];

export default function Solution() {
    return (
        <section className="bg-white dark:bg-slate-950 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                    {/* Text side */}
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                            The Solution
                        </span>
                        <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 leading-tight">
                            A Practical AI Operations Layer
                        </h2>
                        <p className="mt-5 text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
                            AgentFarm gives teams a structured way to run AI workers inside real company workflows.
                            It is designed for measurable output, human oversight, and predictable delivery, not demo-only automation.
                        </p>
                        <ul className="mt-8 space-y-3.5">
                            {benefits.map((b) => (
                                <li key={b} className="flex items-start gap-3 text-slate-700 dark:text-slate-300">
                                    <CheckCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                                    <span className="text-sm leading-relaxed">{b}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="relative"
                    >
                        <div className="absolute -inset-3 bg-gradient-to-br from-sky-100/70 via-emerald-50/60 to-blue-100/70 dark:from-sky-900/20 dark:via-emerald-900/10 dark:to-blue-900/20 rounded-3xl blur-2xl" />

                        <div className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-2xl">
                            <img
                                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1400&q=80"
                                alt="Product and engineering team planning delivery roadmap"
                                className="w-full h-[460px] object-cover"
                                loading="lazy"
                            />

                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/20 to-transparent" />

                            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                                <p className="text-xs uppercase tracking-wide text-sky-200 mb-1">Operations snapshot</p>
                                <p className="text-lg font-bold">Teams using AgentFarm report faster cycle time within first 2 weeks</p>
                                <p className="text-sm text-slate-200 mt-1">Clear task ownership, faster handoffs, and fewer repetitive blockers.</p>
                            </div>
                        </div>

                        <div className="absolute -bottom-5 left-4 right-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-4 grid grid-cols-3 gap-3">
                            <div className="flex items-center gap-2">
                                <Clock3 className="w-4 h-4 text-blue-500" />
                                <div>
                                    <p className="text-xs text-slate-400">Median setup</p>
                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">9 minutes</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <GitPullRequest className="w-4 h-4 text-emerald-500" />
                                <div>
                                    <p className="text-xs text-slate-400">Weekly output</p>
                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">+18 PRs</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-violet-500" />
                                <div>
                                    <p className="text-xs text-slate-400">Governance</p>
                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Audit-ready</p>
                                </div>
                            </div>
                        </div>

                        <a
                            href="/how-it-works"
                            className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                        >
                            See full delivery flow <ArrowRight className="w-4 h-4" />
                        </a>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

