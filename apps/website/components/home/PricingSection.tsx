"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import { useCompactMotion } from "@/lib/useCompactMotion";

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

export default function PricingSection() {
    const compactMotion = useCompactMotion();
    const motionScale = compactMotion ? 0.78 : 1;
    const hoverLift = compactMotion ? -3 : -6;

    return (
        <section id="pricing" className="relative overflow-hidden bg-slate-50 dark:bg-slate-900 py-24">
            <div className="pointer-events-none absolute inset-0 opacity-40">
                <div className="absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-gradient-to-br from-sky-200 to-emerald-200 blur-3xl dark:from-sky-900/40 dark:to-emerald-900/30" />
            </div>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="max-w-2xl mx-auto text-center mb-16">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">
                        Pricing
                    </span>
                    <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
                        Simple, predictable pricing
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                        Start with the AI teammates your team needs today. Scale by role and expand when you see measurable outcomes.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
                    {plans.map((plan, i) => (
                        <motion.div
                            key={plan.name}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{ delay: i * 0.14 * motionScale, duration: 0.52 * motionScale, ease: "easeOut" }}
                            whileHover={{ y: hoverLift, transition: { duration: 0.22 * motionScale } }}
                            className={`rounded-2xl p-7 flex flex-col ${plan.highlighted
                                ? "bg-slate-900/95 text-white ring-2 ring-sky-400 shadow-2xl shadow-sky-500/20 md:scale-[1.03]"
                                : "bg-white/90 dark:bg-slate-800/90 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-sm"
                                }`}
                        >
                            {plan.highlighted && (
                                <span className="self-start text-xs font-semibold bg-gradient-to-r from-sky-500 to-emerald-500 text-white px-2.5 py-1 rounded-full mb-4">
                                    Most Popular
                                </span>
                            )}
                            <p className={`text-sm font-semibold ${plan.highlighted ? "text-slate-300" : "text-slate-500"}`}>
                                {plan.name}
                            </p>
                            <div className="mt-2 flex items-end gap-1">
                                <span className={`text-4xl font-extrabold ${plan.highlighted ? "text-white" : "text-slate-900"}`}>
                                    {plan.price}
                                </span>
                                {plan.period && (
                                    <span className={`text-sm mb-1 ${plan.highlighted ? "text-slate-400" : "text-slate-400"}`}>
                                        {plan.period}
                                    </span>
                                )}
                            </div>
                            <p className={`mt-3 text-sm leading-relaxed ${plan.highlighted ? "text-slate-400" : "text-slate-500"}`}>
                                {plan.description}
                            </p>
                            <ul className="mt-6 space-y-2.5 flex-1">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-2 text-sm">
                                        <CheckCircle
                                            className={`w-4 h-4 shrink-0 mt-0.5 ${plan.highlighted ? "text-blue-400" : "text-blue-600"}`}
                                        />
                                        <span className={plan.highlighted ? "text-slate-300" : "text-slate-600"}>{f}</span>
                                    </li>
                                ))}
                            </ul>
                            <div className="mt-8">
                                <ButtonLink
                                    href={plan.ctaHref}
                                    className="w-full justify-center"
                                    variant={plan.highlighted ? "primary" : "outline"}
                                >
                                    {plan.cta}
                                </ButtonLink>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <div className="mt-8 text-center">
                    <ButtonLink href="/pricing" variant="outline" size="md">
                        View full pricing & plan details →
                    </ButtonLink>
                </div>
            </div>
        </section>
    );
}

