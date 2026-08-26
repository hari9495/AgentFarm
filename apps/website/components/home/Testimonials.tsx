"use client";

import { motion } from "motion/react";
import { Star } from "lucide-react";
import { homeMarketingContent } from "@/lib/marketing-content";

export default function Testimonials() {
    const { testimonials } = homeMarketingContent;

    return (
        <section className="op-section op-dark" aria-label="Customer testimonials">
            <div className="op-wrap">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center mb-14"
                >
                    <p className="op-eyebrow mb-4">{testimonials.eyebrow}</p>
                    <h2
                        className="font-semibold text-[color:var(--op-ink)]"
                        style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                    >
                        {testimonials.title}
                    </h2>
                    <p className="mt-4 mx-auto max-w-md text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {testimonials.description}
                    </p>
                </motion.div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {testimonials.items.map((item, i) => (
                        <motion.div
                            key={item.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                            className="op-lift rounded-[18px] p-6 flex flex-col gap-4"
                            style={{ background: "var(--op-paper)", border: "1px solid var(--op-line)" }}
                        >
                            {/* Stars */}
                            <div className="flex gap-0.5">
                                {Array.from({ length: item.stars }).map((_, si) => (
                                    <Star key={si} className="w-3.5 h-3.5 fill-[var(--op-indigo)] text-[var(--op-indigo)]" />
                                ))}
                            </div>

                            {/* Metric */}
                            <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-[var(--op-indigo)]">
                                {item.metric}
                            </p>

                            {/* Quote */}
                            <p className="text-[15px] text-[var(--op-ink-soft)] leading-relaxed flex-1">
                                &ldquo;{item.quote}&rdquo;
                            </p>

                            {/* Author */}
                            <div className="flex items-center gap-3 pt-2" style={{ borderTop: "1px solid var(--op-line)" }}>
                                <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white shrink-0"
                                    style={{ background: "var(--op-indigo)" }}
                                >
                                    {item.initials}
                                </div>
                                <div>
                                    <p className="text-[14px] font-semibold text-[color:var(--op-ink)]" style={{ letterSpacing: "-0.01em" }}>{item.name}</p>
                                    <p className="text-[12px] text-[var(--op-muted)]">{item.role}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
