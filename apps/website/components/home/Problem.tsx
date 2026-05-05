"use client";

import { motion } from "framer-motion";
import { Clock3, Repeat2, UserRoundSearch, WalletCards, type LucideIcon } from "lucide-react";
import { useCompactMotion } from "@/lib/useCompactMotion";
import PremiumIcon from "@/components/shared/PremiumIcon";

const problems = [
    {
        icon: UserRoundSearch,
        stat: "10M+",
        statLabel: "dev jobs unfilled globally",
        gradient: "from-red-400 to-rose-600",
        glowBg: "bg-red-50/80 dark:bg-red-950/30",
        surface: "from-rose-50/90 via-white to-red-50/85 dark:from-rose-950/30 dark:via-slate-900/92 dark:to-slate-900/92",
        border: "border-rose-200/60 dark:border-rose-900/40",
        accentSoft: "bg-rose-100/85 text-rose-700 dark:bg-rose-900/35 dark:text-rose-300",
        title: "Developer Shortage",
        description:
            "There aren't enough skilled engineers to meet growing product demands. Hiring takes months and competes with FAANG.",
    },
    {
        icon: Clock3,
        stat: "73 days",
        statLabel: "avg. engineer onboarding time",
        gradient: "from-amber-400 to-orange-600",
        glowBg: "bg-amber-50/80 dark:bg-amber-950/30",
        surface: "from-amber-50/90 via-white to-orange-50/85 dark:from-amber-950/25 dark:via-slate-900/92 dark:to-slate-900/92",
        border: "border-amber-200/60 dark:border-amber-900/40",
        accentSoft: "bg-amber-100/90 text-amber-700 dark:bg-amber-900/35 dark:text-amber-300",
        title: "Slow Development Cycles",
        description:
            "Manual reviews, context-switching, and handoffs slow teams down. Velocity suffers while competitors ship faster.",
    },
    {
        icon: WalletCards,
        stat: "$157k",
        statLabel: "average senior engineer salary",
        gradient: "from-violet-400 to-purple-600",
        glowBg: "bg-violet-50/80 dark:bg-violet-950/30",
        surface: "from-violet-50/90 via-white to-purple-50/85 dark:from-violet-950/25 dark:via-slate-900/92 dark:to-slate-900/92",
        border: "border-violet-200/60 dark:border-violet-900/40",
        accentSoft: "bg-violet-100/85 text-violet-700 dark:bg-violet-900/35 dark:text-violet-300",
        title: "High Hiring Costs",
        description:
            "A single senior engineer costs $150k-$300k/year plus benefits, equity, and 3-6 months of onboarding time.",
    },
    {
        icon: Repeat2,
        stat: "40%",
        statLabel: "of dev time on boilerplate",
        gradient: "from-blue-400 to-indigo-600",
        glowBg: "bg-blue-50/80 dark:bg-blue-950/30",
        surface: "from-blue-50/90 via-white to-indigo-50/85 dark:from-blue-950/25 dark:via-slate-900/92 dark:to-slate-900/92",
        border: "border-blue-200/60 dark:border-blue-900/40",
        accentSoft: "bg-blue-100/85 text-blue-700 dark:bg-blue-900/35 dark:text-blue-300",
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
    surface: string;
    border: string;
    accentSoft: string;
    title: string;
    description: string;
}>;

export default function Problem() {
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.78 : 1;
    const hoverLift = compactMotion ? -2 : -4;
    const cardStyleMode: "enterprise" | "neumorphic" =
        typeof window !== "undefined" && new URLSearchParams(window.location.search).get("cardMode") === "enterprise"
            ? "enterprise"
            : "neumorphic";
    const isEnterprise = cardStyleMode === "enterprise";

    return (
        <section className="bg-slate-50/70 dark:bg-slate-900 py-24">
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

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                    {problems.map(({ icon: Icon, stat, statLabel, gradient, glowBg, surface, border, accentSoft, title, description }, i) => (
                        <motion.div
                            key={title}
                            initial={{ opacity: 0, y: 28 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ delay: i * 0.12 * motionScale, duration: 0.5 * motionScale, ease: "easeOut" }}
                            whileHover={{ y: hoverLift, transition: { duration: 0.22 * motionScale } }}
                            className={`group rounded-3xl p-6 sm:p-7 transition-all duration-300 flex flex-col overflow-hidden relative ${isEnterprise
                                ? "border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 shadow-[0_24px_68px_-36px_rgba(2,6,23,0.95)] hover:shadow-[0_30px_80px_-38px_rgba(2,6,23,1)]"
                                : `border ${border} bg-gradient-to-br ${surface} shadow-[10px_10px_26px_-16px_rgba(15,23,42,0.2),-8px_-8px_24px_-18px_rgba(255,255,255,0.9)] hover:shadow-[12px_12px_28px_-16px_rgba(15,23,42,0.24),-10px_-10px_26px_-18px_rgba(255,255,255,0.95)] backdrop-blur`
                                }`}
                        >
                            <div
                                className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${gradient} ${isEnterprise ? "opacity-30" : "opacity-20"
                                    } blur-2xl group-hover:opacity-35 transition-opacity`}
                            />

                            <div
                                className={`rounded-2xl p-4 mb-5 flex items-center justify-between relative z-10 ${isEnterprise
                                    ? "bg-slate-800/80 border border-slate-700/70"
                                    : `${glowBg} border border-white/70 dark:border-slate-700/70`
                                    }`}
                            >
                                <PremiumIcon
                                    icon={Icon}
                                    tone="rose"
                                    containerClassName={`h-14 w-14 rounded-2xl bg-gradient-to-br ${gradient} text-white border border-white/20 shadow-md shadow-slate-300/30 dark:shadow-slate-900/30`}
                                    iconClassName="h-7 w-7"
                                />
                                <div className="text-right">
                                    <p className={`text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br ${gradient}`}>
                                        {stat}
                                    </p>
                                    <p
                                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${isEnterprise
                                            ? "bg-slate-700/80 text-slate-200"
                                            : accentSoft
                                            }`}
                                    >
                                        {statLabel}
                                    </p>
                                </div>
                            </div>

                            <h3 className={`font-extrabold tracking-tight mb-2 text-[1.35rem] leading-tight ${isEnterprise ? "text-slate-50" : "text-slate-900 dark:text-slate-100"}`}>{title}</h3>
                            <p className={`text-sm leading-relaxed flex-1 ${isEnterprise ? "text-slate-300" : "text-slate-600 dark:text-slate-400"}`}>{description}</p>

                            <div className={`mt-6 h-px w-full ${isEnterprise ? "bg-slate-700/70" : "bg-slate-200/70 dark:bg-slate-700/70"}`} />
                            <div className="mt-4 flex items-center justify-between text-[11px]">
                                <span className={`font-semibold uppercase tracking-[0.08em] ${isEnterprise ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>Impact Signal</span>
                                <span className={`font-bold text-transparent bg-clip-text bg-gradient-to-r ${gradient}`}>Critical</span>
                            </div>
                            <div className={`mt-3 h-1.5 w-full rounded-full bg-gradient-to-r ${gradient} opacity-75 group-hover:opacity-100 transition-opacity`} />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

