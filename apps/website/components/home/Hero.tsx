"use client";

import { motion } from "framer-motion";
import ButtonLink from "@/components/shared/ButtonLink";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { useCompactMotion } from "@/lib/useCompactMotion";
import HeroScene3D from "@/components/home/HeroScene3D";

const outcomes = [
    "Deploy the Developer Agent in your Azure tenant in under 10 minutes",
    "Connect directly to GitHub, Jira, Microsoft Teams, and email",
    "Every action is risk-classified — risky changes require human approval",
];

export default function Hero() {
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.72 : 1;

    return (
        <section className="hero-future relative overflow-hidden pt-20 pb-16 sm:pt-28 sm:pb-24">
            <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
                <div className="hero-future-aurora hero-future-aurora-a" />
                <div className="hero-future-aurora hero-future-aurora-b" />
                <div className="hero-future-grid" />
                <div className="hero-future-orb" />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.38 * motionScale }}
                            className="inline-flex items-center gap-2 border border-cyan-300/40 bg-cyan-50/75 text-cyan-900 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 shadow-md shadow-cyan-200/45"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                            Built for engineering teams that need execution, not just suggestions
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.46 * motionScale, delay: 0.05 * motionScale }}
                            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 leading-[1.08] tracking-tight"
                        >
                            AI Teammates That
                            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-cyan-700 via-teal-500 to-indigo-600">
                                Actually Ship Work
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.46 * motionScale, delay: 0.12 * motionScale }}
                            className="mt-6 text-lg text-slate-700 max-w-xl leading-relaxed"
                        >
                            Deploy role-based AI agents that execute real engineering work across GitHub, Jira, Teams, and email —
                            with built-in approval gates for risky changes and a full audit trail on every action.
                        </motion.p>

                        <motion.ul
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.42 * motionScale, delay: 0.16 * motionScale }}
                            className="mt-6 space-y-2"
                        >
                            {outcomes.map((item) => (
                                <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                                    <CheckCircle2 className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </motion.ul>

                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.46 * motionScale, delay: 0.2 * motionScale }}
                            className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-4"
                        >
                            <ButtonLink href="/get-started" size="lg">
                                Start Free
                            </ButtonLink>
                            <ButtonLink href="/book-demo" variant="outline" size="lg">
                                Book a Demo <ArrowRight className="w-4 h-4" />
                            </ButtonLink>
                        </motion.div>

                        <p className="mt-6 text-sm text-slate-600">
                            21 developer skills · approval-driven safety · tenant-isolated on Azure
                        </p>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 * motionScale, delay: 0.08 * motionScale }}
                        className="relative"
                    >
                        <div className="relative">
                            <HeroScene3D />
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}



