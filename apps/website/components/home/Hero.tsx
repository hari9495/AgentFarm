"use client";

import { motion } from "framer-motion";
import ButtonLink from "@/components/shared/ButtonLink";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { marketplaceBots } from "@/lib/bots";
import { useCompactMotion } from "@/lib/useCompactMotion";

const outcomes = [
    "Deploy role-ready agents in under 10 minutes",
    "Connect directly to GitHub, Slack, Jira, and docs",
    "Track every action with approval and audit controls",
];

export default function Hero() {
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.72 : 1;
    const availableRoles = marketplaceBots.filter((bot) => bot.available).length;
    const departmentCount = new Set(marketplaceBots.map((bot) => bot.department)).size;

    return (
        <section className="relative overflow-hidden bg-white dark:bg-slate-950 pt-20 pb-16 sm:pt-28 sm:pb-24">
            <div className="absolute inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-60 -right-60 w-[700px] h-[700px] rounded-full bg-gradient-to-br from-blue-100 via-indigo-50 to-transparent blur-3xl opacity-70 animate-float" />
                <div className="absolute -bottom-40 -left-40 w-[560px] h-[560px] rounded-full bg-gradient-to-tr from-emerald-100 via-sky-50 to-transparent blur-3xl opacity-70 animate-float-delay" />
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: "radial-gradient(circle, #0f172a 1px, transparent 1px)",
                        backgroundSize: "28px 28px",
                    }}
                />
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    <div>
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.38 * motionScale }}
                            className="inline-flex items-center gap-2 bg-white/90 dark:bg-slate-900/85 backdrop-blur border border-sky-100 dark:border-slate-700 text-sky-700 dark:text-sky-300 text-xs font-semibold px-4 py-1.5 rounded-full mb-6 shadow-md shadow-sky-200/35 dark:shadow-sky-900/30"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                            Built for product teams shipping weekly
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.46 * motionScale, delay: 0.05 * motionScale }}
                            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-slate-100 leading-[1.08] tracking-tight"
                        >
                            Real AI Teammates,
                            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500">
                                Clear Output You Can Trust
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.46 * motionScale, delay: 0.12 * motionScale }}
                            className="mt-6 text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed"
                        >
                            AgentFarm gives you role-specific AI workers for development, QA, support, and operations.
                            Every task is visible, reviewable, and integrated into tools your team already uses.
                        </motion.p>

                        <motion.ul
                            initial={{ opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.42 * motionScale, delay: 0.16 * motionScale }}
                            className="mt-6 space-y-2"
                        >
                            {outcomes.map((item) => (
                                <li key={item} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
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
                                Start Building Team
                            </ButtonLink>
                            <ButtonLink href="/marketplace" variant="outline" size="lg">
                                Explore Roles <ArrowRight className="w-4 h-4" />
                            </ButtonLink>
                        </motion.div>

                        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                            {availableRoles} live roles · {departmentCount} departments · transparent monthly pricing
                        </p>
                    </div>

                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 * motionScale, delay: 0.08 * motionScale }}
                        className="relative"
                    >
                        <img
                            src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1400&q=80"
                            alt="Engineering team collaborating in front of dashboards"
                            className="w-full h-[460px] object-cover rounded-3xl border border-slate-200/70 dark:border-slate-700 shadow-2xl"
                            loading="eager"
                        />

                        <div className="absolute top-4 right-4 bg-white/95 dark:bg-slate-900/90 backdrop-blur-md rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 shadow-lg">
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">Average first-week output</p>
                            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">16 tasks shipped</p>
                        </div>

                        <div className="absolute -bottom-5 left-4 right-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl p-4 grid grid-cols-3 gap-3">
                            <div>
                                <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">10m</p>
                                <p className="text-[11px] text-slate-500">to deploy</p>
                            </div>
                            <div>
                                <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">99.2%</p>
                                <p className="text-[11px] text-slate-500">test pass</p>
                            </div>
                            <div>
                                <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">24/7</p>
                                <p className="text-[11px] text-slate-500">task coverage</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}



