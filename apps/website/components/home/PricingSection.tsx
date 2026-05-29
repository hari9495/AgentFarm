"use client";

import { motion } from "motion/react";
import { CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { homeMarketingContent } from "@/lib/marketing-content";

export default function PricingSection() {
    const { pricing } = homeMarketingContent;

    return (
        <section className="af-tile af-tile-white" aria-label="Pricing">
            <div className="af-container">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center mb-14"
                >
                    <p className="af-eyebrow mb-4">{pricing.eyebrow}</p>
                    <h2
                        className="font-semibold text-[#1d1d1f]"
                        style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                    >
                        {pricing.title}
                    </h2>
                    <p className="mt-4 mx-auto max-w-md text-[17px] text-[#424245]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {pricing.description}
                    </p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-4 max-w-[860px] mx-auto">
                    {pricing.plans.map((plan, i) => (
                        <motion.div
                            key={plan.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-60px" }}
                            transition={{ duration: 0.5, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                            className="rounded-[18px] p-6 flex flex-col"
                            style={{
                                border: plan.highlighted ? "2px solid #0066cc" : "1px solid #d2d2d7",
                                background: plan.highlighted ? "rgba(0,102,204,0.03)" : "#ffffff",
                            }}
                        >
                            {plan.highlighted && (
                                <span className="self-start mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0066cc] px-2.5 py-1 rounded-full" style={{ background: "rgba(0,102,204,0.1)" }}>
                                    Most popular
                                </span>
                            )}
                            <p className="text-[13px] font-semibold text-[#6e6e73] uppercase tracking-[0.06em]">{plan.name}</p>
                            <div className="mt-2 flex items-end gap-1">
                                <span className="text-[2.4rem] font-semibold text-[#1d1d1f]" style={{ letterSpacing: "-0.03em", lineHeight: 1 }}>
                                    {plan.price}
                                </span>
                                {plan.price !== "Custom" && (
                                    <span className="mb-1 text-[14px] text-[#aeaeb2]">/month</span>
                                )}
                            </div>
                            <p className="mt-2 text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>{plan.description}</p>
                            <ul className="mt-5 flex-1 space-y-2">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2 text-[14px] text-[#424245]">
                                        <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-[#0066cc]" />
                                        <span style={{ lineHeight: 1.5 }}>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href={plan.ctaHref}
                                className={`mt-6 flex items-center justify-center gap-2 rounded-full py-2.5 text-[15px] font-medium transition-colors ${
                                    plan.highlighted
                                        ? "bg-[#0066cc] text-white hover:bg-[#0071e3]"
                                        : "border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]"
                                }`}
                            >
                                {plan.cta}
                                {plan.highlighted && <ArrowRight className="w-4 h-4" />}
                            </Link>
                        </motion.div>
                    ))}
                </div>

                <p className="mt-8 text-center text-[14px] text-[#6e6e73]">
                    <Link href="/pricing" className="text-[#0066cc] hover:text-[#0071e3] transition-colors">
                        {pricing.linkLabel}
                    </Link>
                </p>
            </div>
        </section>
    );
}
