"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

export default function FAQ() {
    const [open, setOpen] = useState<number | null>(null);
    const { faq } = homeMarketingContent;

    return (
        <section className="af-tile af-tile-parchment" aria-label="FAQ">
            <div className="af-container-narrow">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center mb-12"
                >
                    <p className="af-eyebrow mb-4">{faq.eyebrow}</p>
                    <h2
                        className="font-semibold text-[#1d1d1f]"
                        style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                    >
                        {faq.title}
                    </h2>
                    <p className="mt-3 text-[17px] text-[#424245]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {faq.description}
                    </p>
                </motion.div>

                <div className="rounded-[18px] overflow-hidden" style={{ border: "1px solid #d2d2d7" }}>
                    {faq.items.map((item, i) => (
                        <div
                            key={item.question}
                            style={{ borderBottom: i < faq.items.length - 1 ? "1px solid #e8e8ed" : "none" }}
                        >
                            <button
                                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer hover:bg-[#f5f5f7] transition-colors"
                                onClick={() => setOpen(open === i ? null : i)}
                                aria-expanded={open === i}
                            >
                                <span className="text-[17px] font-semibold text-[#1d1d1f]" style={{ letterSpacing: "-0.018em" }}>
                                    {item.question}
                                </span>
                                <ChevronDown
                                    className={`w-5 h-5 shrink-0 text-[#6e6e73] transition-transform duration-200 ${open === i ? "rotate-180" : ""}`}
                                />
                            </button>
                            <AnimatePresence>
                                {open === i && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                                        className="overflow-hidden"
                                        style={{ background: "#ffffff" }}
                                    >
                                        <p className="px-6 pt-1 pb-5 text-[15px] text-[#424245]" style={{ lineHeight: 1.6 }}>
                                            {item.answer}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
