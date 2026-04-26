"use client";

import { motion } from "framer-motion";
import { Clock3, Repeat2, UserRoundSearch, WalletCards, type LucideIcon } from "lucide-react";
import { useCompactMotion } from "@/lib/useCompactMotion";

const problems = [
    {
        icon: UserRoundSearch,
        stat: "10M+",
        statLabel: "dev jobs unfilled globally",
        gradient: "from-red-400 to-rose-600",
        glowBg: "bg-red-50 dark:bg-red-950/30",
        title: "Developer Shortage",
        description:
            "There aren't enough skilled engineers to meet growing product demands. Hiring takes months and competes with FAANG.",
    },
    {
        icon: Clock3,
        stat: "73 days",
        statLabel: "avg. engineer onboarding time",
        gradient: "from-amber-400 to-orange-600",
        glowBg: "bg-amber-50 dark:bg-amber-950/30",
        title: "Slow Development Cycles",
        description:
            "Manual reviews, context-switching, and handoffs slow teams down. Velocity suffers while competitors ship faster.",
    },
    {
        icon: WalletCards,
        stat: "$157k",
        statLabel: "average senior engineer salary",
        gradient: "from-violet-400 to-purple-600",
        glowBg: "bg-violet-50 dark:bg-violet-950/30",
        title: "High Hiring Costs",
        description:
            "A single senior engineer costs $150k-$300k/year plus benefits, equity, and 3-6 months of onboarding time.",
    },
    {
        icon: Repeat2,
        stat: "40%",
        statLabel: "of dev time on boilerplate",
        gradient: "from-blue-400 to-indigo-600",
        glowBg: "bg-blue-50 dark:bg-blue-950/30",
        title: "Repetitive Tasks",
        description:
            "Developers spend 40% of their time on boilerplate code, writing tests, and DevOps work - not building features.",
    },
] as Array<{
    icon: LucideIcon;
    stat: string;
    statLabel: string;
    gradient: string;
    glowBg: string;
    title: string;
    description: string;
}>;

export default function Problem() {
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.78 : 1;
    const hoverLift = compactMotion ? -2 : -4;

    return (
        <section className="bg-slate-50 dark:bg-slate-900 py-24">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mx-auto text-center mb-16">
                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.44 * motionScale }}
                        className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100"
                    >
                        Engineering teams are hitting a wall
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.08 * motionScale, duration: 0.44 * motionScale }}
                        className="mt-4 text-lg text-slate-500 dark:text-slate-400"
                    >
                        The traditional model of hiring, onboarding, and scaling engineers is broken.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {problems.map(({ icon: Icon, stat, statLabel, gradient, glowBg, title, description }, i) => (
                        <motion.div
                            key={title}
                            initial={{ opacity: 0, y: 28 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ delay: i * 0.12 * motionScale, duration: 0.5 * motionScale, ease: "easeOut" }}
                            whileHover={{ y: hoverLift, transition: { duration: 0.22 * motionScale } }}
                            className="group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-xl transition-all duration-200 flex flex-col overflow-hidden relative"
                        >
                            <div className={`${glowBg} rounded-xl p-4 mb-5 flex items-center justify-between`}>
                                <span className={`inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-md shadow-slate-300/30 dark:shadow-slate-900/30`}>
                                    <Icon className="h-7 w-7 text-white" />
                                </span>
                                <div className="text-right">
                                    <p className={`text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br ${gradient}`}>
                                        {stat}
                                    </p>
                                    <p className="text-[10px] text-slate-400 leading-tight max-w-[90px]">{statLabel}</p>
                                </div>
                            </div>

                            <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2 text-sm">{title}</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed flex-1">{description}</p>

                            {/* Bottom gradient line */}
                            <div className={`mt-5 h-1 w-full rounded-full bg-gradient-to-r ${gradient} opacity-60 group-hover:opacity-100 transition-opacity`} />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

