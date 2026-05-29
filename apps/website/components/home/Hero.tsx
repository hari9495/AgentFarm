"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, GitPullRequest, ShieldCheck, Terminal } from "lucide-react";
import Link from "next/link";
import { homeMarketingContent } from "@/lib/marketing-content";

const activityIcons = [GitPullRequest, ShieldCheck, Terminal];

const riskColors: Record<string, string> = {
    low: "#34c759",
    high: "#ff9f0a",
    medium: "#ff9f0a",
};

export default function Hero() {
    const [wordIdx, setWordIdx] = useState(0);
    const content = homeMarketingContent.hero;

    useEffect(() => {
        const id = setInterval(() => {
            setWordIdx((i) => (i + 1) % content.cycleWords.length);
        }, 2400);
        return () => clearInterval(id);
    }, [content.cycleWords.length]);

    return (
        <section
            className="af-tile af-tile-white"
            style={{ paddingTop: 80, paddingBottom: 80 }}
            aria-label="Hero"
        >
            <div className="af-container-wide">
                <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">

                    {/* Left — text */}
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <p className="mb-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#0066cc]">
                            {content.eyebrow}
                        </p>

                        <h1
                            className="font-semibold text-[#1d1d1f]"
                            style={{ fontSize: "clamp(2.6rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
                        >
                            {content.titleLead}
                            {/* Animated word — separate block line to avoid width/height clipping */}
                            <span
                                className="block relative overflow-hidden"
                                style={{ height: "1.25em" }}
                            >
                                <AnimatePresence mode="wait">
                                    <motion.span
                                        key={content.cycleWords[wordIdx]}
                                        initial={{ y: "110%", opacity: 0 }}
                                        animate={{ y: "0%", opacity: 1 }}
                                        exit={{ y: "-110%", opacity: 0 }}
                                        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                                        className="absolute left-0 top-0 text-[#0066cc]"
                                        style={{ lineHeight: 1.25 }}
                                    >
                                        {content.cycleWords[wordIdx]}
                                    </motion.span>
                                </AnimatePresence>
                            </span>
                        </h1>

                        <p className="mt-5 max-w-lg text-[17px] leading-[1.47] text-[#424245]" style={{ letterSpacing: "-0.022em" }}>
                            {content.description}
                        </p>

                        <ul className="mt-6 space-y-2.5">
                            {content.benefits.map((b) => (
                                <li key={b} className="flex items-start gap-2.5 text-[15px] text-[#424245]">
                                    <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-[#0066cc]" />
                                    <span style={{ lineHeight: "1.5", letterSpacing: "-0.01em" }}>{b}</span>
                                </li>
                            ))}
                        </ul>

                        <div className="mt-8 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                            <Link href={content.primaryCta.href} className="btn-primary">
                                {content.primaryCta.label}
                            </Link>
                            <Link href={content.secondaryCta.href} className="btn-secondary">
                                {content.secondaryCta.label}
                            </Link>
                        </div>

                        <p className="mt-4 text-[12px] text-[#aeaeb2]">{content.caption}</p>
                    </motion.div>

                    {/* Right — live operations card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                    >
                        <div
                            className="rounded-[18px] overflow-hidden"
                            style={{
                                border: "1px solid #d2d2d7",
                                boxShadow: "0 24px 56px -20px rgba(0,0,0,0.22)",
                            }}
                        >
                            {/* Card header */}
                            <div className="px-5 py-4 flex items-center justify-between" style={{ background: "#f5f5f7", borderBottom: "1px solid #e0e0e0" }}>
                                <span className="text-[12px] font-semibold text-[#1d1d1f] tracking-[-0.01em]">
                                    {content.activityHeader}
                                </span>
                                <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#34c759]">
                                    <span className="h-1.5 w-1.5 rounded-full bg-[#34c759]" />
                                    {content.activityStatus}
                                </span>
                            </div>

                            {/* Activity items */}
                            <div className="p-4 space-y-2.5" style={{ background: "#ffffff" }}>
                                {content.activity.map((item, i) => {
                                    const Icon = activityIcons[i] ?? Terminal;
                                    return (
                                        <motion.div
                                            key={item.label}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.5 + i * 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                                            className="flex items-start gap-3 rounded-[11px] px-3.5 py-3"
                                            style={{ border: "1px solid #e8e8ed", background: "#fafafa" }}
                                        >
                                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#0066cc]" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[13px] font-semibold text-[#1d1d1f]" style={{ letterSpacing: "-0.01em" }}>{item.label}</p>
                                                <p className="mt-0.5 text-[11px] text-[#aeaeb2]">{item.detail}</p>
                                            </div>
                                            <span className="shrink-0 text-[11px] font-mono text-[#aeaeb2]">{item.time}</span>
                                        </motion.div>
                                    );
                                })}

                                {/* Approval card */}
                                <div
                                    className="rounded-[11px] px-3.5 py-3"
                                    style={{ border: "1px solid rgba(0,102,204,0.2)", background: "rgba(0,102,204,0.04)" }}
                                >
                                    <p className="mb-2.5 text-[12px] font-semibold text-[#1d1d1f]">{content.approvalTitle}</p>
                                    <div className="flex gap-2">
                                        <button className="flex-1 rounded-full bg-[#0066cc] py-2 text-[12px] font-medium text-white hover:bg-[#0071e3] transition-colors cursor-pointer">
                                            {content.approvalPrimary}
                                        </button>
                                        <button className="flex-1 rounded-full py-2 text-[12px] font-medium text-[#6e6e73] hover:text-[#1d1d1f] transition-colors cursor-pointer" style={{ border: "1px solid #d2d2d7" }}>
                                            {content.approvalSecondary}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
