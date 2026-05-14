"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Zap } from "lucide-react";
import Link from "next/link";

const plans = [
    {
        name: "Starter",
        price: "$299",
        period: "/ month",
        description: "Best for teams proving AI teammate workflows with one to two core engineering roles.",
        features: [
            "2 AI Teammates",
            "Up to 10 GitHub repos",
            "GitHub + Jira integration",
            "2,000 task executions / mo",
            "Risk-classified approval gates",
            "Full audit trail",
            "Email support",
        ],
        cta: "Start 14-day free trial",
        ctaHref: "/#waitlist",
        highlighted: false,
    },
    {
        name: "Pro",
        price: "$599",
        period: "/ month",
        description: "For growing teams deploying multiple AI teammates in parallel across departments.",
        features: [
            "5 AI Teammates",
            "Unlimited repos",
            "GitHub + Jira + Teams + Email",
            "10,000 task executions / mo",
            "Priority support",
            "Custom approval workflows",
            "Analytics dashboard",
            "14-day free trial",
        ],
        cta: "Start 14-day free trial",
        ctaHref: "/#waitlist",
        highlighted: true,
    },
    {
        name: "Enterprise",
        price: "Custom",
        period: "",
        description: "For regulated orgs needing unlimited scale, SLAs, SSO, and on-prem options.",
        features: [
            "Unlimited AI Teammates",
            "Unlimited task executions",
            "SSO / SAML",
            "Tenant-isolated Azure runtime",
            "Dedicated onboarding support",
            "On-premises deployment option",
            "SLA guarantee",
            "Custom connector integrations",
        ],
        cta: "Contact Sales",
        ctaHref: "/book-demo",
        highlighted: false,
    },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function PricingSection() {
    const [annual, setAnnual] = useState(false);

    const getPrice = (monthly: string) => {
        if (monthly === "Custom") return "Custom";
        const num = parseInt(monthly.replace("$", ""), 10);
        return annual ? `$${Math.round(num * 0.8)}` : monthly;
    };

    return (
        <section id="pricing" className="bg-[var(--canvas)] py-24 border-t border-[var(--hairline)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.48, ease }}
                    className="max-w-2xl mx-auto text-center mb-10"
                >
                    <span className="chip chip-accent text-xs mb-4">Pricing</span>
                    <h2 className="text-[clamp(1.8rem,3.5vw,2.6rem)] font-semibold text-[var(--ink)] tracking-[-0.03em]">
                        Simple, predictable pricing
                    </h2>
                    <p className="mt-4 text-[var(--mute)] leading-relaxed">
                        Start with the skills your team needs. Scale by role and expand when you see measurable outcomes.
                    </p>
                </motion.div>

                {/* Toggle */}
                <div className="flex justify-center mb-10">
                    <div className="flex items-center gap-3 bg-[var(--surface-card)] border border-[var(--hairline)] rounded-xl p-1">
                        <button
                            onClick={() => setAnnual(false)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${!annual ? "bg-white/[0.08] text-[var(--ink)]" : "text-[var(--mute)] hover:text-[var(--ink)]"}`}
                        >
                            Monthly
                        </button>
                        <button
                            onClick={() => setAnnual(true)}
                            className={`relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${annual ? "bg-white/[0.08] text-[var(--ink)]" : "text-[var(--mute)] hover:text-[var(--ink)]"}`}
                        >
                            Annual
                            <span className="ml-2 text-[10px] font-bold text-[var(--accent-green)] bg-[#59d499]/10 border border-[#59d499]/25 px-1.5 py-0.5 rounded-full">
                                -20%
                            </span>
                        </button>
                    </div>
                </div>

                {/* Plans grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto items-stretch">
                    {plans.map((plan, i) => (
                        <motion.div
                            key={plan.name}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{ delay: i * 0.1, duration: 0.46, ease }}
                            className={`relative rounded-2xl p-7 flex flex-col border transition-all ${plan.highlighted
                                    ? "bg-[var(--surface-card)] border-[var(--accent-blue)]/50 shadow-[0_0_0_1px_rgba(87,193,255,0.2),0_8px_40px_rgba(87,193,255,0.06)]"
                                    : "bg-[var(--surface-card)] border-[var(--hairline)]"
                                }`}
                        >
                            {plan.highlighted && (
                                <div className="absolute -top-3 left-7">
                                    <span className="flex items-center gap-1 text-[10px] font-bold bg-[var(--accent-blue)] text-[#07080a] px-2.5 py-1 rounded-full shadow">
                                        <Zap className="w-2.5 h-2.5" />
                                        Most Popular
                                    </span>
                                </div>
                            )}

                            <div className="mb-5">
                                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--mute)] mb-2">{plan.name}</p>
                                <div className="flex items-end gap-1 mt-1">
                                    <motion.span
                                        key={annual ? "ann" : "mo"}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.22 }}
                                        className="text-4xl font-bold text-[var(--ink)] tracking-tight"
                                    >
                                        {getPrice(plan.price)}
                                    </motion.span>
                                    {plan.period && (
                                        <span className="text-sm text-[var(--ash)] mb-1.5">
                                            / {annual ? "mo, billed annually" : "month"}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-3 text-sm text-[var(--mute)] leading-relaxed">{plan.description}</p>
                            </div>

                            <ul className="flex-1 space-y-2.5 mb-7">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--body-color)]">
                                        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent-green)]" />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={plan.ctaHref}
                                className={`w-full text-center py-2.5 text-sm font-semibold rounded-xl transition-all ${plan.highlighted
                                        ? "bg-[var(--accent-blue)] text-[#07080a] hover:bg-[#8dd7ff]"
                                        : plan.name === "Enterprise"
                                            ? "bg-white/[0.06] border border-[var(--hairline)] text-[var(--ink)] hover:bg-white/[0.1]"
                                            : "bg-white text-[#07080a] hover:bg-[#e8e8e8]"
                                    }`}
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
                    <Link
                        href="/pricing"
                        className="text-sm text-[var(--mute)] hover:text-[var(--ink)] underline underline-offset-4 transition-colors"
                    >
                        View full pricing and plan details →
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
