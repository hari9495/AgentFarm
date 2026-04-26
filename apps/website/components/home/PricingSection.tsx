"use client";

import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import { useCompactMotion } from "@/lib/useCompactMotion";

const plans = [
    {
        name: "Starter",
        price: "$99",
        period: "/ month",
        description: "Perfect for small teams trying AI workers for the first time.",
        features: [
            "1 AI Worker",
            "5 GitHub repos",
            "Slack integration",
            "500 task executions / mo",
            "Email support",
        ],
        cta: "Start Free Trial",
        ctaHref: "/#waitlist",
        highlighted: false,
    },
    {
        name: "Pro",
        price: "$499",
        period: "/ month",
        description: "For growing teams that need multiple AI workers shipping in parallel.",
        features: [
            "5 AI Workers",
            "Unlimited repos",
            "GitHub + Slack + Jira",
            "5,000 task executions / mo",
            "Priority support",
            "Custom workflows",
            "Analytics dashboard",
        ],
        cta: "Start Free Trial",
        ctaHref: "/#waitlist",
        highlighted: true,
    },
    {
        name: "Enterprise",
        price: "Custom",
        period: "",
        description: "For large orgs needing unlimited scale, SLAs, and enterprise SSO.",
        features: [
            "Unlimited AI Workers",
            "Unlimited executions",
            "SSO / SAML",
            "Custom integrations",
            "Dedicated support",
            "On-prem option",
            "SLA guarantee",
        ],
        cta: "Contact Sales",
        ctaHref: "#",
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
                        Marketplace-Aligned Pricing
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
                        Start with one role, expand by workflow, and keep pricing transparent as usage grows.
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
                        View detailed marketplace pricing {"->"}
                    </ButtonLink>
                </div>
            </div>
        </section>
    );
}

