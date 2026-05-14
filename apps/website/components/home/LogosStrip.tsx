"use client";

import { motion } from "motion/react";

const logos = [
    { name: "GitHub", initials: "GH", color: "#f4f4f6" },
    { name: "Jira", initials: "JR", color: "#57c1ff" },
    { name: "Microsoft Teams", initials: "MT", color: "#57c1ff" },
    { name: "Azure", initials: "AZ", color: "#57c1ff" },
    { name: "Slack", initials: "SL", color: "#59d499" },
    { name: "Vercel", initials: "▲", color: "#f4f4f6" },
    { name: "Linear", initials: "LN", color: "#9c9c9d" },
    { name: "Notion", initials: "N", color: "#f4f4f6" },
    { name: "Figma", initials: "FG", color: "#ff6161" },
    { name: "Datadog", initials: "DD", color: "#ffc533" },
    { name: "PagerDuty", initials: "PD", color: "#ff6161" },
    { name: "Confluence", initials: "CF", color: "#57c1ff" },
];

export default function LogosStrip() {
    return (
        <section className="bg-[#0d0d0d] border-y border-[#242728] py-10 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6a6b6c]">
                    Connects with the tools your team already uses
                </p>
            </div>

            {/* Marquee wrapper with gradient fade edges */}
            <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10 bg-gradient-to-r from-[#0d0d0d] to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10 bg-gradient-to-l from-[#0d0d0d] to-transparent" />

                <div className="flex animate-marquee gap-4 w-max">
                    {[...logos, ...logos].map((logo, i) => (
                        <motion.div
                            key={`${logo.name}-${i}`}
                            whileHover={{ scale: 1.06, y: -2 }}
                            transition={{ duration: 0.18 }}
                            className="flex items-center gap-2.5 bg-[#121212] border border-[#242728] rounded-xl px-5 py-3 shrink-0 cursor-default"
                        >
                            <span
                                className="text-sm font-bold leading-none"
                                style={{ color: logo.color }}
                            >
                                {logo.initials}
                            </span>
                            <span className="text-[13px] font-medium text-[#9c9c9d] whitespace-nowrap">
                                {logo.name}
                            </span>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
