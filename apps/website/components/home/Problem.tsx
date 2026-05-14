"use client";

import { motion } from "motion/react";
import { Clock3, Repeat2, UserRoundSearch, WalletCards, type LucideIcon } from "lucide-react";

const problems = [
    {
        icon: UserRoundSearch,
        stat: "10M+",
        statLabel: "dev jobs unfilled",
        accentColor: "#ff6161",
        title: "Developer Shortage",
        description: "There aren't enough skilled engineers to meet growing product demands. Hiring takes months and competes with FAANG.",
    },
    {
        icon: Clock3,
        stat: "73 days",
        statLabel: "avg. onboarding time",
        accentColor: "#ffc533",
        title: "Slow Dev Cycles",
        description: "Manual reviews, context-switching, and handoffs slow teams down. Velocity suffers while competitors ship faster.",
    },
    {
        icon: WalletCards,
        stat: "$157k",
        statLabel: "avg. senior engineer salary",
        accentColor: "#57c1ff",
        title: "High Hiring Costs",
        description: "A single senior engineer costs $150k–$300k/year plus benefits, equity, and 3–6 months of onboarding time.",
    },
    {
        icon: Repeat2,
        stat: "40%",
        statLabel: "dev time on boilerplate",
        accentColor: "#59d499",
        title: "Repetitive Tasks",
        description: "Developers spend 40% of their time on boilerplate code, writing tests, and DevOps — not building features.",
    },
] as Array<{
    icon: LucideIcon;
    stat: string;
    statLabel: string;
    accentColor: string;
    title: string;
    description: string;
}>;

export default function Problem() {
    return (
        <section className="py-24 bg-[var(--canvas)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mx-auto text-center mb-16">
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6a6b6c] mb-4"
                    >
                        The Problem
                    </motion.p>
                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                        className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-semibold text-[#f4f4f6] tracking-tight"
                    >
                        Engineering teams are hitting a wall
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                        className="mt-4 text-[#9c9c9d] leading-relaxed"
                    >
                        The traditional model of hiring, onboarding, and scaling engineers is broken.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    {problems.map(({ icon: Icon, stat, statLabel, accentColor, title, description }, i) => (
                        <motion.div
                            key={title}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ delay: i * 0.08, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                            whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
                            className="group bg-[#121212] border border-[#242728] rounded-xl p-6 flex flex-col hover:border-white/10 transition-colors"
                        >
                            {/* Top row: icon + stat */}
                            <div className="flex items-start justify-between mb-5">
                                <div
                                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                                    style={{ background: `${accentColor}14`, border: `1px solid ${accentColor}28` }}
                                >
                                    <Icon className="w-5 h-5" style={{ color: accentColor }} />
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-semibold text-[#f4f4f6] leading-none" style={{ color: accentColor }}>
                                        {stat}
                                    </p>
                                    <p className="text-[10px] text-[#6a6b6c] mt-0.5">{statLabel}</p>
                                </div>
                            </div>

                            <h3 className="font-semibold text-[#f4f4f6] text-base mb-2">{title}</h3>
                            <p className="text-sm text-[#9c9c9d] leading-relaxed flex-1">{description}</p>

                            {/* Accent bar */}
                            <div className="mt-5 h-px w-full bg-[#242728]" />
                            <div
                                className="mt-3 h-0.5 rounded-full w-0 group-hover:w-full transition-all duration-500"
                                style={{ background: `linear-gradient(90deg, ${accentColor}, transparent)` }}
                            />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}

