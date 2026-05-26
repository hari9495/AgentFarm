"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Zap } from "lucide-react";
import Link from "next/link";
import { homeMarketingContent } from "@/lib/marketing-content";

const ease = [0.22, 1, 0.36, 1] as const;

export default function PricingSection() {
    const [annual, setAnnual] = useState(false);
    const content = homeMarketingContent.pricing;

    const getPrice = (monthly: string) => {
        if (monthly === "Custom") return "Custom";
        const num = parseInt(monthly.replace("$", ""), 10);
        return annual ? `$${Math.round(num * 0.8)}` : monthly;
    };

    return (
        <section id="pricing" className="border-t border-[var(--hairline)] bg-[var(--canvas)] py-24">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.48, ease }}
                    className="mx-auto mb-10 max-w-2xl text-center"
                >
                    <span className="chip chip-accent mb-4 text-xs">{content.eyebrow}</span>
                    <h2 className="text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold tracking-[-0.03em] text-[var(--ink)]">
                        {content.title}
                    </h2>
                    <p className="mt-4 leading-relaxed text-[var(--mute)]">{content.description}</p>
                </motion.div>

                <div className="mb-10 flex justify-center">
                    <div className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)] p-1">
                        <button
                            onClick={() => setAnnual(false)}
                            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${!annual ? "bg-white/[0.08] text-[var(--ink)]" : "text-[var(--mute)] hover:text-[var(--ink)]"}`}
                        >
                            {content.monthlyLabel}
                        </button>
                        <button
                            onClick={() => setAnnual(true)}
                            className={`relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${annual ? "bg-white/[0.08] text-[var(--ink)]" : "text-[var(--mute)] hover:text-[var(--ink)]"}`}
                        >
                            {content.annualLabel}
                            <span className="ml-2 rounded-full border border-[#59d499]/25 bg-[#59d499]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--accent-green)]">
                                {content.annualDiscountLabel}
                            </span>
                        </button>
                    </div>
                </div>

                <div className="mx-auto grid max-w-5xl grid-cols-1 items-stretch gap-5 md:grid-cols-3">
                    {content.plans.map((plan, index) => (
                        <motion.div
                            key={plan.name}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{ delay: index * 0.1, duration: 0.46, ease }}
                            className={`relative flex flex-col rounded-2xl border p-7 transition-all ${plan.highlighted ? "border-[var(--accent-blue)]/50 bg-[var(--surface-card)] shadow-[0_0_0_1px_rgba(87,193,255,0.2),0_8px_40px_rgba(87,193,255,0.06)]" : "border-[var(--hairline)] bg-[var(--surface-card)]"}`}
                        >
                            {plan.highlighted ? (
                                <div className="absolute -top-3 left-7">
                                    <span className="flex items-center gap-1 rounded-full bg-[var(--accent-blue)] px-2.5 py-1 text-[10px] font-bold text-[#07080a] shadow">
                                        <Zap className="h-2.5 w-2.5" />
                                        Most popular
                                    </span>
                                </div>
                            ) : null}

                            <div className="mb-5">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--mute)]">{plan.name}</p>
                                <div className="mt-1 flex items-end gap-1">
                                    <motion.span
                                        key={annual ? `${plan.name}-annual` : `${plan.name}-monthly`}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.22 }}
                                        className="text-4xl font-bold tracking-tight text-[var(--ink)]"
                                    >
                                        {getPrice(plan.price)}
                                    </motion.span>
                                    {plan.price !== "Custom" ? (
                                        <span className="mb-1.5 text-sm text-[var(--ash)]">/ {annual ? "mo, billed annually" : "month"}</span>
                                    ) : null}
                                </div>
                                <p className="mt-3 text-sm leading-relaxed text-[var(--mute)]">{plan.description}</p>
                            </div>

                            <ul className="mb-7 flex-1 space-y-2.5">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2.5 text-sm text-[var(--body-color)]">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-green)]" />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={plan.ctaHref}
                                className={`w-full rounded-xl py-2.5 text-center text-sm font-semibold transition-all ${plan.highlighted ? "bg-[var(--accent-blue)] text-[#07080a] hover:bg-[#8dd7ff]" : "border border-[var(--hairline)] bg-[var(--surface-el)] text-[var(--ink)] hover:bg-[var(--hairline)]"}`}
                            >
                                {plan.cta}
                            </Link>
                        </motion.div>
                    ))}
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="mt-8 text-center"
                >
                    <Link href="/pricing" className="text-sm text-[var(--mute)] underline underline-offset-4 transition-colors hover:text-[var(--ink)]">
                        {content.linkLabel}
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
