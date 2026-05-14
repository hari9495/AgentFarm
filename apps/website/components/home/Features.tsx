"use client";

import { motion } from "motion/react";
import {
    GitPullRequest,
    ShieldCheck,
    BarChart3,
    Puzzle,
    Lock,
    Zap,
    Terminal,
    CheckCircle2,
} from "lucide-react";

const features = [
    {
        icon: GitPullRequest,
        color: "#57c1ff",
        title: "Full-Cycle PR Execution",
        description:
            "Agents branch, commit, push, open PRs, trigger CI, and re-run failing checks — without waiting for a human to click.",
        size: "large",
        badge: "Core",
        metric: "PR created in < 90s",
    },
    {
        icon: ShieldCheck,
        color: "#59d499",
        title: "Risk-Classified Approval Gates",
        description:
            "Every action is scored LOW / MEDIUM / HIGH. Risky changes pause and request human sign-off via Teams or email before proceeding.",
        size: "large",
        badge: "Safety",
        metric: "Zero unreviewed deploys",
    },
    {
        icon: Puzzle,
        color: "#ffc533",
        title: "21-Skill Marketplace",
        description:
            "Create PR, Fix Tests, Security Scan, Dependency Upgrade, Refactor Plan, Release Notes — composable skills you wire to any workflow.",
        size: "medium",
        badge: null,
        metric: "21 skills shipped",
    },
    {
        icon: BarChart3,
        color: "#ff6161",
        title: "Real-Time Analytics Dashboard",
        description:
            "Task velocity, approval rates, risk distribution, and agent output quality — one pane for every decision.",
        size: "medium",
        badge: null,
        metric: null,
    },
    {
        icon: Lock,
        color: "#a78bfa",
        title: "Tenant-Isolated Azure Runtime",
        description:
            "Each customer gets a dedicated Azure VM. Your code never runs on shared infrastructure. Connector tokens are encrypted at rest.",
        size: "medium",
        badge: "Security",
        metric: null,
    },
    {
        icon: Terminal,
        color: "#57c1ff",
        title: "Full Audit Trail",
        description:
            "Every action, approval decision, and evidence packet is logged and exportable — ready for compliance and security reviews.",
        size: "medium",
        badge: null,
        metric: "SOC 2 ready",
    },
    {
        icon: Zap,
        color: "#59d499",
        title: "10-Minute Onboarding",
        description:
            "Connect GitHub and Jira with OAuth, assign the first AI teammate a role, and watch it execute your first task — no setup scripts.",
        size: "small",
        badge: null,
        metric: null,
    },
    {
        icon: CheckCircle2,
        color: "#ffc533",
        title: "CI/CD-Native",
        description:
            "Agents trigger, monitor, and react to CI pipelines autonomously — re-running failed checks, parsing logs, and retrying on flakes.",
        size: "small",
        badge: null,
        metric: null,
    },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function Features() {
    return (
        <section className="bg-[var(--canvas)] py-24 border-t border-[var(--hairline)]" id="features">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.5, ease }}
                    className="max-w-2xl mb-14"
                >
                    <span className="chip chip-accent text-xs mb-4">Platform</span>
                    <h2 className="text-[clamp(2rem,4vw,3rem)] font-semibold text-[var(--ink)] tracking-[-0.03em] leading-tight">
                        Everything an engineering team needs
                        <span className="block text-[var(--mute)]">without the overhead.</span>
                    </h2>
                </motion.div>

                {/* Bento grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--hairline)] rounded-2xl overflow-hidden border border-[var(--hairline)]">
                    {/* Large card 1 — spans 2 cols */}
                    {features.slice(0, 2).map((f, i) => (
                        <motion.div
                            key={f.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.44, delay: i * 0.07, ease }}
                            className="lg:col-span-2 bg-[var(--surface-card)] p-7 flex flex-col gap-4 group"
                        >
                            <div className="flex items-start justify-between">
                                <div
                                    className="inline-flex items-center justify-center w-10 h-10 rounded-xl"
                                    style={{ background: `${f.color}18` }}
                                >
                                    <f.icon className="w-5 h-5" style={{ color: f.color }} />
                                </div>
                                <div className="flex items-center gap-2">
                                    {f.badge && (
                                        <span
                                            className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border"
                                            style={{ color: f.color, borderColor: `${f.color}40`, background: `${f.color}12` }}
                                        >
                                            {f.badge}
                                        </span>
                                    )}
                                    {f.metric && (
                                        <span className="text-[10px] text-[var(--mute)] bg-white/[0.04] border border-[var(--hairline)] px-2 py-0.5 rounded-full">
                                            {f.metric}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-[var(--ink)] mb-2">{f.title}</h3>
                                <p className="text-sm text-[var(--mute)] leading-relaxed">{f.description}</p>
                            </div>
                        </motion.div>
                    ))}

                    {/* Medium cards — 1 col each */}
                    {features.slice(2, 6).map((f, i) => (
                        <motion.div
                            key={f.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.44, delay: 0.14 + i * 0.07, ease }}
                            className="bg-[var(--surface-card)] p-6 flex flex-col gap-3 group"
                        >
                            <div className="flex items-start justify-between">
                                <div
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
                                    style={{ background: `${f.color}18` }}
                                >
                                    <f.icon className="w-4 h-4" style={{ color: f.color }} />
                                </div>
                                {f.badge && (
                                    <span
                                        className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full border"
                                        style={{ color: f.color, borderColor: `${f.color}40`, background: `${f.color}12` }}
                                    >
                                        {f.badge}
                                    </span>
                                )}
                                {f.metric && (
                                    <span className="text-[10px] text-[var(--mute)] bg-white/[0.04] border border-[var(--hairline)] px-2 py-0.5 rounded-full">
                                        {f.metric}
                                    </span>
                                )}
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-[var(--ink)] mb-1.5">{f.title}</h3>
                                <p className="text-sm text-[var(--mute)] leading-relaxed">{f.description}</p>
                            </div>
                        </motion.div>
                    ))}

                    {/* Small cards — span 2 col each on lg */}
                    {features.slice(6).map((f, i) => (
                        <motion.div
                            key={f.title}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.44, delay: 0.28 + i * 0.07, ease }}
                            className="lg:col-span-2 bg-[var(--surface-card)] p-6 flex items-center gap-4"
                        >
                            <div
                                className="inline-flex shrink-0 items-center justify-center w-10 h-10 rounded-xl"
                                style={{ background: `${f.color}18` }}
                            >
                                <f.icon className="w-5 h-5" style={{ color: f.color }} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-[var(--ink)] mb-1">{f.title}</h3>
                                <p className="text-sm text-[var(--mute)] leading-snug">{f.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
