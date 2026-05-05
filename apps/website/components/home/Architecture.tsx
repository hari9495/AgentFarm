"use client";

import { motion } from "framer-motion";
import { Monitor, Cpu, Bot, GitBranch, ArrowDown, Lock, ShieldCheck, Database } from "lucide-react";

export default function Architecture() {
    return (
        <section className="bg-white dark:bg-slate-950 py-24 border-t border-slate-100 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mx-auto text-center mb-16">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Architecture
                    </span>
                    <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
                        Built for security and scale
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                        Every Developer Agent runs in a dedicated, tenant-isolated Azure VM with
                        approval gates, role-based access control, and a full audit trail on every action.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

                    {/* LEFT: Inputs */}
                    <div className="flex flex-col gap-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Your Stack</p>
                        {[
                            { icon: Monitor, label: "AgentFarm Dashboard", sub: "Assign tasks, review PRs", color: "bg-blue-600" },
                            { icon: GitBranch, label: "GitHub / GitLab", sub: "Source control & PRs", color: "bg-slate-700" },
                            { icon: Database, label: "Teams / Jira / Email", sub: "Task assignments & approvals", color: "bg-indigo-600" },
                        ].map(({ icon: Icon, label, sub, color }, i) => (
                            <motion.div
                                key={label}
                                initial={{ opacity: 0, x: -20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                                    <Icon className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                                    <p className="text-xs text-slate-400">{sub}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* CENTER: Control Plane */}
                    <div className="flex flex-col items-center">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">AI Control Plane</p>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="relative w-full bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl border border-slate-700 p-6 shadow-2xl overflow-hidden"
                        >
                            {/* Glow */}
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-purple-600/10" />
                            <div className="relative z-10 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Cpu className="w-5 h-5 text-blue-400" />
                                        <span className="text-sm font-bold text-white">Orchestrator</span>
                                    </div>
                                    <span className="text-[10px] text-green-400 flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                        Running
                                    </span>
                                </div>
                                {/* Worker avatars */}
                                <div className="grid grid-cols-2 gap-2">
                                    {["ai-backend-developer", "ai-qa-engineer", "ai-devops-engineer", "ai-security-engineer"].map((slug) => (
                                        <div key={slug} className="flex items-center gap-2 bg-slate-700/50 rounded-lg p-2">
                                            <img
                                                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${slug}&backgroundColor=b6e3f4,c0aede&radius=6`}
                                                alt={slug}
                                                width={28} height={28}
                                                className="w-7 h-7 rounded-md shrink-0"
                                            />
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                                <div className="h-px bg-slate-700" />
                                <div className="flex items-center gap-2">
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-[10px] text-slate-400">Sandboxed Â· Encrypted Â· Audited</span>
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* RIGHT: Outputs */}
                    <div className="flex flex-col gap-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">AI Workers Output</p>
                        {[
                            { icon: Bot, label: "Code & Pull Requests", sub: "Reviewed and ready to merge", color: "bg-emerald-600" },
                            { icon: ShieldCheck, label: "Security Reports", sub: "Zero-trust audit trail", color: "bg-purple-600" },
                            { icon: ArrowDown, label: "Deployments", sub: "CI/CD pipelines triggered", color: "bg-orange-600" },
                        ].map(({ icon: Icon, label, sub, color }, i) => (
                            <motion.div
                                key={label}
                                initial={{ opacity: 0, x: 20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
                            >
                                <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                                    <Icon className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</p>
                                    <p className="text-xs text-slate-400">{sub}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                {/* Security callouts */}
                <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto text-center">
                    {[
                        { label: "SOC 2 Ready", desc: "Audit-ready from day one" },
                        { label: "Zero Trust", desc: "Least-privilege by default" },
                        { label: "Encrypted at Rest", desc: "AES-256 for all stored data" },
                    ].map((item) => (
                        <div key={item.label} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-5 py-4 border border-slate-200 dark:border-slate-700">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{item.label}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

