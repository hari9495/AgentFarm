"use client";

import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useCompactMotion } from "@/lib/useCompactMotion";

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

export default function Testimonials() {
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.8 : 1;

    return (
        <section className="bg-white dark:bg-slate-950 py-24 border-t border-slate-100 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-14">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.48 * motionScale }}
                    className="max-w-2xl mx-auto text-center"
                >
                    <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                        Customer Stories
                    </span>
                    <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
                        Real teams. Measurable engineering outcomes.
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                        Concrete results from founders, engineering leads, and operators running AgentFarm AI teammates in production.
                    </p>
                </motion.div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {testimonials.map((t, i) => (
                        <motion.article
                            key={t.name}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{ duration: 0.45 * motionScale, delay: i * 0.06 * motionScale }}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col shadow-sm hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200"
                        >
                            {/* Stars */}
                            <div className="flex gap-0.5 mb-4">
                                {Array.from({ length: t.stars }).map((_, j) => (
                                    <Star key={j} className="w-4 h-4 text-amber-400 fill-amber-400" />
                                ))}
                            </div>

                            {/* Metric highlight */}
                            <p className="text-sm font-bold text-sky-600 dark:text-sky-400 mb-3">{t.metric}</p>

                            {/* Quote */}
                            <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed flex-1">
                                &ldquo;{t.quote}&rdquo;
                            </p>

                            {/* Author */}
                            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl ${t.color} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
                                    {t.initials}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.name}</p>
                                    <p className="text-xs text-slate-400">{t.role}</p>
                                </div>
                            </div>
                        </motion.article>
                    ))}
                </div>
            </div>
        </section>
    );
}
