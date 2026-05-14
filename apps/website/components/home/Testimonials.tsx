"use client";

import { motion } from "motion/react";
import { Star, Quote } from "lucide-react";

const testimonials = [
    {
        name: "Sarah Chen",
        role: "CTO · BuildFast",
        initials: "SC",
        color: "bg-sky-500",
        stars: 5,
        metric: "Test coverage 61% → 94% in 3 weeks",
        quote:
            "We pointed the QA AI teammate at our regression suite and let it run. Test coverage went from 61% to 94% in three weeks — without pulling a single engineer off product work.",
    },
    {
        name: "Marcus Webb",
        role: "VP Engineering · TechCorp",
        initials: "MW",
        color: "bg-violet-500",
        stars: 5,
        metric: "Feature cycle time reduced by 42%",
        quote:
            "Our AI Backend Developer ships boilerplate features in hours, not days. Our human engineers now focus entirely on architecture and the decisions that actually need judgment.",
    },
    {
        name: "Priya Nair",
        role: "Founder · ShipIt",
        initials: "PN",
        color: "bg-emerald-500",
        stars: 5,
        metric: "MVP shipped in 6 days",
        quote:
            "Solo founder here. AgentFarm gives me what feels like a four-person engineering team. I shipped an MVP in 6 days that I'd have spent 6 weeks on alone — with PR reviews and CI coverage.",
    },
    {
        name: "James Okafor",
        role: "Engineering Manager · DevOps Inc.",
        initials: "JO",
        color: "bg-amber-500",
        stars: 5,
        metric: "11 PR acceptance, 35% higher quality score",
        quote:
            "The GitHub integration is seamless. PRs are well-structured, commit messages are clean, and the agent handles CI re-runs autonomously. Our senior engineers spend less time on review cleanup.",
    },
    {
        name: "Anita Russo",
        role: "Lead Architect · CloudNative",
        initials: "AR",
        color: "bg-indigo-500",
        stars: 5,
        metric: "Team velocity doubled with 3 AI teammates",
        quote:
            "We run 3 AI workers alongside our 8-person team. They handle repetitive execution while our engineers tackle the high-judgment problems. The risk-classification gates make it safe enough for production use.",
    },
    {
        name: "Tom Lindström",
        role: "Head of Product · StartupX",
        initials: "TL",
        color: "bg-rose-500",
        stars: 5,
        metric: "2 hours/week reclaimed from standups",
        quote:
            "I was skeptical. Two months later I can't imagine our workflow without it. Teams approval notifications in Slack save hours of async back-and-forth. The audit trail alone satisfied our security review.",
    },
];

// Split into 3 columns for masonry layout
const col1 = testimonials.slice(0, 2);
const col2 = testimonials.slice(2, 4);
const col3 = testimonials.slice(4);

const ease = [0.22, 1, 0.36, 1] as const;

function TestimonialCard({ t, delay }: { t: typeof testimonials[0]; delay: number }) {
    return (
        <motion.article
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.46, delay, ease }}
            className="bg-[var(--surface-card)] border border-[var(--hairline)] rounded-2xl p-6 flex flex-col gap-4"
        >
            <Quote className="w-5 h-5 text-[var(--ash)]" />
            {/* Metric badge */}
            <p className="text-xs font-semibold text-[var(--accent-blue)] bg-[#57c1ff]/10 border border-[#57c1ff]/20 px-2.5 py-1 rounded-full w-fit">
                {t.metric}
            </p>
            {/* Stars */}
            <div className="flex gap-0.5">
                {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} className="w-3.5 h-3.5 text-[#ffc533] fill-[#ffc533]" />
                ))}
            </div>
            {/* Quote */}
            <p className="text-sm text-[var(--body-color)] leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
            </p>
            {/* Author */}
            <div className="pt-4 border-t border-[var(--hairline)] flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${t.color} flex items-center justify-center text-[11px] font-bold text-white shrink-0`}>
                    {t.initials}
                </div>
                <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{t.name}</p>
                    <p className="text-xs text-[var(--ash)]">{t.role}</p>
                </div>
            </div>
        </motion.article>
    );
}

export default function Testimonials() {
    return (
        <section className="bg-[var(--surface)] py-24 border-t border-[var(--hairline)]" id="testimonials">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.48, ease }}
                    className="max-w-2xl mx-auto text-center mb-14"
                >
                    <span className="chip chip-accent text-xs mb-4">Customer Stories</span>
                    <h2 className="text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold text-[var(--ink)] tracking-[-0.03em]">
                        Real teams. Measurable outcomes.
                    </h2>
                    <p className="mt-4 text-[var(--mute)] leading-relaxed">
                        Founders, engineering leads, and operators running AgentFarm AI teammates in production.
                    </p>
                </motion.div>

                {/* 3-column masonry */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
                    <div className="flex flex-col gap-5">
                        {col1.map((t, i) => <TestimonialCard key={t.name} t={t} delay={i * 0.08} />)}
                    </div>
                    <div className="flex flex-col gap-5 md:mt-8 lg:mt-8">
                        {col2.map((t, i) => <TestimonialCard key={t.name} t={t} delay={0.12 + i * 0.08} />)}
                    </div>
                    <div className="flex flex-col gap-5 md:col-span-2 lg:col-span-1">
                        {col3.map((t, i) => <TestimonialCard key={t.name} t={t} delay={0.24 + i * 0.08} />)}
                    </div>
                </div>
            </div>
        </section>
    );
}
