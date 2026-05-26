"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

const ease = [0.22, 1, 0.36, 1] as const;

export default function FAQ() {
    const [open, setOpen] = useState<number | null>(null);
    const content = homeMarketingContent.faq;

    return (
        <section className="border-t border-[var(--hairline)] bg-[var(--surface)] py-24" id="faq">
            <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.46, ease }}
                    className="mb-14 text-center"
                >
                    <span className="chip chip-accent mb-4 text-xs">{content.eyebrow}</span>
                    <h2 className="text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                        {content.title}
                    </h2>
                    <p className="mt-4 leading-relaxed text-[var(--mute)]">{content.description}</p>
                </motion.div>

                <div className="divide-y divide-[var(--hairline)]">
                    {content.items.map((item, index) => (
                        <motion.div
                            key={item.question}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-30px" }}
                            transition={{ duration: 0.38, delay: index * 0.04, ease }}
                        >
                            <button
                                onClick={() => setOpen(open === index ? null : index)}
                                className="group flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left"
                            >
                                <span className="text-[15px] font-medium text-[var(--ink)] transition-colors group-hover:text-[var(--ink)]">
                                    {item.question}
                                </span>
                                <motion.div animate={{ rotate: open === index ? 180 : 0 }} transition={{ duration: 0.22, ease }} className="shrink-0">
                                    <ChevronDown className="h-4.5 w-4.5 text-[var(--ash)]" />
                                </motion.div>
                            </button>
                            <AnimatePresence initial={false}>
                                {open === index ? (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.28, ease }}
                                        className="overflow-hidden"
                                    >
                                        <p className="pb-5 pr-8 text-sm leading-relaxed text-[var(--mute)]">{item.answer}</p>
                                    </motion.div>
                                ) : null}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
