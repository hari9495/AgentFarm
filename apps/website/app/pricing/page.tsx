import type { Metadata } from "next";
import { CheckCircle } from "lucide-react";
import ButtonLink from "@/components/shared/ButtonLink";
import PricingCalculator from "@/components/pricing/PricingCalculator";
import { marketplaceBots, type Bot } from "@/lib/bots";

export const metadata: Metadata = {
    title: "Pricing — AgentFarm",
    description: "Simple, predictable pricing for every team size. Start free.",
};

type PlanTier = Bot["plan"];

const PLAN_ORDER: PlanTier[] = ["Starter+", "Pro+", "Enterprise"];

const PLAN_CONFIG: Record<PlanTier, { cta: string; ctaHref: string; highlighted: boolean; summary: string }> = {
    "Starter+": {
        cta: "Start Free Trial",
        ctaHref: "/get-started",
        highlighted: false,
        summary: "Best for teams launching their first specialist workflows quickly.",
    },
    "Pro+": {
        cta: "Start Free Trial",
        ctaHref: "/get-started",
        highlighted: true,
        summary: "Built for scaling multiple specialists across engineering and GTM operations.",
    },
    Enterprise: {
        cta: "Contact Sales",
        ctaHref: "/contact",
        highlighted: false,
        summary: "For compliance-heavy teams requiring custom controls, governance, and support.",
    },
};

const availableMarketplaceBots = marketplaceBots.filter((bot) => bot.available);

const plans = PLAN_ORDER.map((tier) => {
    const tierBots = marketplaceBots.filter((bot) => bot.plan === tier);
    const liveTierBots = tierBots.filter((bot) => bot.available);
    const livePrices = liveTierBots.map((bot) => bot.priceMonthly);
    const minPrice = livePrices.length > 0 ? Math.min(...livePrices) : null;
    const rolePreview = tierBots.slice(0, 3).map((bot) => bot.name.replace(/^AI\s+/, "")).join(", ");
    const deptCount = new Set(tierBots.map((bot) => bot.department)).size;

    return {
        name: tier,
        price: tier === "Enterprise" ? "Custom" : minPrice ? `$${minPrice}` : "Custom",
        period: tier === "Enterprise" ? "" : "/ month",
        description: PLAN_CONFIG[tier].summary,
        features: [
            `${liveTierBots.length} live roles (${tierBots.length} total)`,
            `${deptCount} departments covered`,
            rolePreview ? `Top roles: ${rolePreview}` : "Role lineup tailored to your team",
            tier === "Enterprise" ? "Custom SLA and governance controls" : "14-day free trial included",
        ],
        cta: PLAN_CONFIG[tier].cta,
        ctaHref: PLAN_CONFIG[tier].ctaHref,
        highlighted: PLAN_CONFIG[tier].highlighted,
    };
});

const faqs = [
    {
        q: "Is there a free trial?",
        a: "Yes — join the waitlist and you'll get early access with a 14-day free trial on the Starter plan. No credit card required.",
    },
    {
        q: "What counts as a task execution?",
        a: "A task execution is any unit of work your AI worker picks up — writing a function, running a test suite, opening a PR, or responding to a code review comment.",
    },
    {
        q: "Can I change plans?",
        a: "Absolutely. You can upgrade or downgrade at any time. Changes take effect at the next billing cycle.",
    },
    {
        q: "What integrations are supported?",
        a: "GitHub, GitLab (coming soon), Slack, Jira, Linear (coming soon), and PagerDuty (coming soon). We add new integrations based on customer demand.",
    },
    {
        q: "Is my code safe?",
        a: "Every AI worker runs in an isolated container with least-privilege access. Your code never leaves your own GitHub repositories and AgentFarm never stores source code on our servers.",
    },
    {
        q: "Do you support on-premises deployment?",
        a: "Yes — the Enterprise plan includes an on-premises option for teams with strict data residency requirements.",
    },
];

export default function PricingPage() {
    return (
        <div className="site-shell">
            {/* Hero */}
            <section className="relative py-24 text-center border-b border-slate-100 dark:border-slate-800 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-blue-50/60 via-white to-white dark:from-blue-950/30 dark:via-slate-950 dark:to-slate-950 pointer-events-none" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-radial from-blue-200/30 to-transparent dark:from-blue-800/20 blur-3xl pointer-events-none" />
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 dark:bg-blue-900/40 px-3 py-1.5 rounded-full border border-blue-100 dark:border-blue-800 mb-4">
                        Pricing
                    </span>
                    <h1 className="mt-3 text-4xl sm:text-6xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                        Simple,{" "}
                        <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-blue-600 bg-clip-text text-transparent">
                            predictable
                        </span>{" "}
                        pricing
                    </h1>
                    <p className="mt-5 text-xl text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
                        Marketplace-aligned pricing across {availableMarketplaceBots.length} live AI roles. Start free and scale by role.
                    </p>
                    {/* Social proof strip */}
                    <div className="mt-8 flex items-center justify-center gap-3">
                        <div className="flex -space-x-2">
                            {["forge", "scout", "atlas", "orion", "vega"].map((seed) => (
                                <img
                                    key={seed}
                                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9&radius=10`}
                                    alt="AI worker"
                                    className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-950 bg-blue-50"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{availableMarketplaceBots.length} live roles</span> in marketplace pricing
                        </span>
                    </div>
                </div>
            </section>

            <PricingCalculator />

            {/* Plans */}
            <section className="py-24 bg-slate-50 dark:bg-slate-900/50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto items-start">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`relative rounded-2xl p-7 flex flex-col transition-all ${plan.highlighted
                                    ? "bg-gradient-to-b from-slate-800 to-slate-900 text-white ring-2 ring-blue-500 shadow-2xl shadow-blue-500/20 md:scale-[1.04]"
                                    : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg hover:-translate-y-0.5"
                                    }`}
                            >
                                {plan.highlighted && (
                                    <>
                                        <span className="self-start text-xs font-semibold bg-blue-500 text-white px-3 py-1 rounded-full mb-4 flex items-center gap-1">
                                            Most Popular
                                        </span>
                                        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-t-2xl" />
                                    </>
                                )}
                                <p className={`text-sm font-semibold ${plan.highlighted ? "text-slate-300" : "text-slate-500 dark:text-slate-400"}`}>
                                    {plan.name}
                                </p>
                                <div className="mt-2 flex items-end gap-1">
                                    <span className={`text-5xl font-extrabold tracking-tight ${plan.highlighted ? "text-white" : "text-slate-900 dark:text-slate-100"}`}>
                                        {plan.price}
                                    </span>
                                    {plan.period && (
                                        <span className="text-sm mb-2 text-slate-400">{plan.period}</span>
                                    )}
                                </div>
                                <p className={`mt-3 text-sm leading-relaxed ${plan.highlighted ? "text-slate-400" : "text-slate-500 dark:text-slate-400"}`}>
                                    {plan.description}
                                </p>
                                <ul className="mt-6 space-y-2.5 flex-1">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2 text-sm">
                                            <CheckCircle
                                                className={`w-4 h-4 shrink-0 mt-0.5 ${plan.highlighted ? "text-blue-400" : "text-blue-600"}`}
                                            />
                                            <span className={plan.highlighted ? "text-slate-300" : "text-slate-600 dark:text-slate-300"}>{f}</span>
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
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-sm text-slate-400 dark:text-slate-500 mt-8">Marketplace pricing updates with role availability. 14-day free trial, no credit card required.</p>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-12 text-center">
                            Frequently asked questions
                        </h2>
                        <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                            {faqs.map(({ q, a }) => (
                                <div key={q} className="p-6 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                                        <span className="text-blue-500">Q</span>
                                        {q}
                                    </h3>
                                    <p className="text-slate-500 dark:text-slate-400 leading-relaxed text-sm pl-5">{a}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}


