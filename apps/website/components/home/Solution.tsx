"use client";

import { motion } from "motion/react";
import { ArrowRight, CheckCircle2, GitPullRequest, ShieldCheck, Clock } from "lucide-react";
import Link from "next/link";
import { homeMarketingContent } from "@/lib/marketing-content";

const eventIcons = [GitPullRequest, ShieldCheck, Clock];

export default function Solution() {
    const { solution } = homeMarketingContent;

    return (
        <section className="af-tile af-tile-white" aria-label="The solution">
            <div className="af-container">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    {/* Left — text */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <p className="af-eyebrow mb-4">{solution.eyebrow}</p>
                        <h2
                            className="font-semibold text-[#1d1d1f]"
                            style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.8rem)", letterSpacing: "-0.028em", lineHeight: 1.07 }}
                        >
                            {solution.title}
                        </h2>
                        <p className="mt-4 text-[17px] text-[#424245]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                            {solution.description}
                        </p>
                        <ul className="mt-6 space-y-3">
                            {solution.benefits.map((b) => (
                                <li key={b} className="flex items-start gap-2.5 text-[15px] text-[#424245]">
                                    <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-[#0066cc]" />
                                    <span style={{ lineHeight: 1.5, letterSpacing: "-0.01em" }}>{b}</span>
                                </li>
                            ))}
                        </ul>
                        <Link href={solution.link.href} className="mt-8 inline-flex items-center gap-1.5 text-[17px] text-[#0066cc] hover:text-[#0071e3] transition-colors">
                            {solution.link.label}
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </motion.div>

                    {/* Right — live event feed */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div
                            className="rounded-[18px] overflow-hidden"
                            style={{ border: "1px solid #d2d2d7", boxShadow: "0 24px 56px -20px rgba(0,0,0,0.12)" }}
                        >
                            <div className="px-5 py-3.5 flex items-center justify-between" style={{ background: "#f5f5f7", borderBottom: "1px solid #e0e0e0" }}>
                                <span className="text-[12px] font-semibold text-[#1d1d1f]">Live operations</span>
                                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#34c759]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#34c759]" />
                                    {solution.liveStatusLabel}
                                </span>
                            </div>
                            <div className="p-4 space-y-2.5" style={{ background: "#ffffff" }}>
                                {solution.events.map((event, i) => {
                                    const Icon = eventIcons[i] ?? Clock;
                                    const isHigh = event.risk === "high";
                                    return (
                                        <div
                                            key={event.label}
                                            className="rounded-[11px] p-3.5"
                                            style={{
                                                border: isHigh ? "1px solid rgba(255,159,10,0.3)" : "1px solid #e8e8ed",
                                                background: isHigh ? "rgba(255,159,10,0.04)" : "#fafafa",
                                            }}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold text-white"
                                                    style={{ background: event.accentColor }}
                                                >
                                                    {event.initials}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[13px] font-semibold text-[#1d1d1f]" style={{ letterSpacing: "-0.01em" }}>{event.label}</p>
                                                    <p className="text-[11px] text-[#aeaeb2] mt-0.5">{event.detail}</p>
                                                </div>
                                                <div className="flex flex-col items-end gap-1 shrink-0">
                                                    <span
                                                        className="text-[10px] font-semibold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-full"
                                                        style={{
                                                            background: isHigh ? "rgba(255,159,10,0.1)" : "rgba(52,199,89,0.1)",
                                                            color: isHigh ? "#ff9f0a" : "#34c759",
                                                        }}
                                                    >
                                                        {event.risk}
                                                    </span>
                                                    <span className="text-[11px] text-[#aeaeb2]">{event.time}</span>
                                                </div>
                                            </div>
                                            {isHigh && (
                                                <div className="mt-3 flex gap-2">
                                                    <button className="flex-1 rounded-full bg-[#0066cc] py-1.5 text-[12px] font-medium text-white hover:bg-[#0071e3] transition-colors cursor-pointer">
                                                        Approve
                                                    </button>
                                                    <button className="flex-1 rounded-full py-1.5 text-[12px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors cursor-pointer" style={{ border: "1px solid #d2d2d7" }}>
                                                        Review diff
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
