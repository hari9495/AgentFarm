"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const steps = [
    {
        number: "01",
        title: "Pick the right role",
        description:
            "Choose the role based on real workload: development, QA, customer support, documentation, or operations.",
        image:
            "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&w=1200&q=80",
    },
    {
        number: "02",
        title: "Connect your tools",
        description:
            "Securely connect GitHub, Slack, Jira, and docs so the agent can work directly in your existing workflow.",
        image:
            "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=1200&q=80",
    },
    {
        number: "03",
        title: "Assign real work",
        description:
            "Send tasks through tickets or chat commands. AgentFarm executes with context and provides review-ready output.",
        image:
            "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=1200&q=80",
    },
    {
        number: "04",
        title: "Review, approve, and measure",
        description:
            "Track outputs, approvals, and outcomes from a single view with clear audit history and delivery metrics.",
        image:
            "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&q=80",
    },
];

export default function HowItWorks() {
    return (
        <section id="how-it-works" className="bg-white dark:bg-slate-950 py-24 border-t border-slate-100 dark:border-slate-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mx-auto text-center mb-16">
                    <motion.span
                        initial={{ opacity: 0, y: -6 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-xs font-semibold uppercase tracking-wider text-blue-600"
                    >
                        How It Works
                    </motion.span>
                    <motion.h2
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.05 }}
                        className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100"
                    >
                        Clear process, not black-box automation
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="mt-4 text-lg text-slate-500 dark:text-slate-400"
                    >
                        From setup to measurable output, every step is structured, transparent, and easy for teams to follow.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                    {steps.map((step, i) => {
                        return (
                            <motion.div
                                key={step.number}
                                initial={{ opacity: 0, y: 32 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-30px" }}
                                transition={{ delay: i * 0.15, duration: 0.45, ease: "easeOut" }}
                                className="relative z-10 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm"
                            >
                                <img
                                    src={step.image}
                                    alt={step.title}
                                    className="w-full h-44 object-cover"
                                    loading="lazy"
                                />
                                <div className="p-6">
                                    <p className="text-xs font-semibold text-blue-600 mb-2">Step {step.number}</p>
                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2 text-lg">{step.title}</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{step.description}</p>
                                    <a href="/how-it-works" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700">
                                        Learn more <ArrowRight className="w-4 h-4" />
                                    </a>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}


