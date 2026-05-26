"use client";

import { motion } from "motion/react";
import { Clock3, Repeat2, UserRoundSearch, WalletCards, type LucideIcon } from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

const problemIcons: LucideIcon[] = [UserRoundSearch, Clock3, WalletCards, Repeat2];

export default function Problem() {
    const content = homeMarketingContent.problem;

    return (
        <section className="bg-[var(--canvas)] py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-16 max-w-2xl text-center">
                    <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ash)]">
                        {content.eyebrow}
                    </motion.p>
                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                        className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-semibold tracking-tight text-[var(--ink)]"
                    >
                        {content.title}
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.08, duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                        className="mt-4 leading-relaxed text-[var(--mute)]"
                    >
                        {content.description}
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {content.items.map((item, index) => {
                        const Icon = problemIcons[index] ?? Repeat2;
                        return (
                            <motion.div
                                key={item.title}
                                initial={{ opacity: 0, y: 24 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-30px" }}
                                transition={{ delay: index * 0.08, duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
                                whileHover={{ y: -4, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
                                className="group flex flex-col rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)] p-6 transition-colors hover:border-black/10 dark:hover:border-white/10"
                            >
                                <div className="mb-5 flex items-start justify-between">
                                    <div
                                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                                        style={{ background: `${item.accentColor}14`, border: `1px solid ${item.accentColor}28` }}
                                    >
                                        <Icon className="h-5 w-5" style={{ color: item.accentColor }} />
                                    </div>
                                    <div className="text-right">
                                        <p className="text-2xl font-semibold leading-none text-[var(--ink)]" style={{ color: item.accentColor }}>
                                            {item.stat}
                                        </p>
                                        <p className="mt-0.5 text-[10px] text-[var(--ash)]">{item.statLabel}</p>
                                    </div>
                                </div>

                                <h3 className="mb-2 text-base font-semibold text-[var(--ink)]">{item.title}</h3>
                                <p className="flex-1 text-sm leading-relaxed text-[var(--mute)]">{item.description}</p>

                                <div className="mt-5 h-px w-full bg-[var(--hairline)]" />
                                <div
                                    className="mt-3 h-0.5 w-0 rounded-full transition-all duration-500 group-hover:w-full"
                                    style={{ background: `linear-gradient(90deg, ${item.accentColor}, transparent)` }}
                                />
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
