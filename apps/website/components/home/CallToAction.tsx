"use client";

import { motion } from "motion/react";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { homeMarketingContent } from "@/lib/marketing-content";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";

export default function CallToAction() {
    const { cta } = homeMarketingContent;

    return (
        <section className="op-section op-dark" aria-label="Get started">
            <div className="op-wrap-narrow">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="text-center"
                >
                    {/* Badge */}
                    <div
                        className="inline-flex items-center gap-2 mb-6 rounded-full px-4 py-2 text-[12px] font-semibold text-[var(--op-indigo)]"
                        style={{ border: "1px solid rgba(41,151,255,0.25)", background: "rgba(41,151,255,0.08)" }}
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--op-indigo)]" />
                        {cta.badge}
                    </div>

                    <h2
                        className="font-semibold text-[color:var(--op-ink)]"
                        style={{ fontSize: "clamp(2rem, 4.5vw, 3.2rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                    >
                        {cta.titleLead}{" "}
                        <span className="text-[var(--op-indigo)]">{cta.titleAccent}</span>
                    </h2>

                    <p className="mt-5 mx-auto max-w-md text-[17px] text-[var(--op-muted)]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {cta.description}
                    </p>

                    {/* CTAs */}
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href="/get-started"
                            className="px-6 py-3 rounded-full font-medium text-[17px] text-white transition-colors"
                            style={{ background: "var(--op-indigo)" }}
                            onMouseOver={(e) => (e.currentTarget.style.background = "#0071e3")}
                            onMouseOut={(e) => (e.currentTarget.style.background = "var(--op-indigo)")}
                        >
                            Start free trial
                        </Link>
                        <Link
                            href="/book-demo"
                            className="px-6 py-3 rounded-full font-medium text-[17px] text-[color:var(--op-ink)] bg-white transition-colors"
                            style={{ border: "1px solid var(--op-line)" }}
                            onMouseOver={(e) => (e.currentTarget.style.background = "var(--op-paper-2)")}
                            onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                            Book a demo
                        </Link>
                    </div>

                    {/* Trust items */}
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
                        {cta.trustItems.map((item) => (
                            <span key={item} className="flex items-center gap-1.5 text-[13px] text-[var(--op-muted)]">
                                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--op-indigo)]" />
                                {item}
                            </span>
                        ))}
                    </div>

                    {/* Live metrics */}
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
                        {cta.liveMetrics.map((m) => (
                            <span
                                key={m.label}
                                className="flex items-center gap-1.5 text-[13px] font-semibold"
                                style={{ color: "var(--op-muted)" }}
                            >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
                                <AnimatedNumber value={m.label} />
                            </span>
                        ))}
                    </div>
                </motion.div>
            </div>
        </section>
    );
}
