"use client";

import { motion } from "framer-motion";
import ButtonLink from "@/components/shared/ButtonLink";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { marketplaceBots } from "@/lib/bots";
import { useCompactMotion } from "@/lib/useCompactMotion";

const outcomes = [
    "Deploy the Developer Agent in your Azure tenant in under 10 minutes",
    "Connect directly to GitHub, Jira, Microsoft Teams, and email",
    "Every action is risk-classified — risky changes require human approval",
];

export default function Hero() {
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.72 : 1;
    const availableRoles = marketplaceBots.filter((bot) => bot.available).length;
    const departmentCount = new Set(marketplaceBots.map((bot) => bot.department)).size;

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
                        <div className="hero-3d-scene">
                            <img
                                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1400&q=80"
                                alt="Engineering team collaborating in front of dashboards"
                                className="hero-3d-media"
                                loading="eager"
                            />
                            <div className="hero-3d-ring hero-3d-ring-a" aria-hidden />
                            <div className="hero-3d-ring hero-3d-ring-b" aria-hidden />
                        </div>

                        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md rounded-xl px-3 py-2 border border-cyan-200 shadow-lg">
                            <p className="text-[10px] uppercase tracking-wide text-slate-500">Average first-week output</p>
                            <p className="text-sm font-bold text-slate-900">16 tasks shipped</p>
                        </div>

                        <div className="absolute -bottom-5 left-4 right-4 bg-white/95 rounded-2xl border border-cyan-200 shadow-xl p-4 grid grid-cols-3 gap-3">
                            <div>
                                <p className="text-lg font-extrabold text-slate-900">10m</p>
                                <p className="text-[11px] text-slate-600">to deploy</p>
                            </div>
                            <div>
                                <p className="text-lg font-extrabold text-slate-900">99.2%</p>
                                <p className="text-[11px] text-slate-600">test pass</p>
                            </div>
                            <div>
                                <p className="text-lg font-extrabold text-slate-900">24/7</p>
                                <p className="text-[11px] text-slate-600">task coverage</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}



