import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
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

const starterPlanPrice = plans.find((plan) => plan.name === "Starter+")?.price ?? "$299";
const proPlanPrice = plans.find((plan) => plan.name === "Pro+")?.price ?? "$599";

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
        <div className="site-shell bg-[var(--canvas)]">
            {/* Hero */}
            <section className="relative py-24 text-center border-b border-[var(--hairline)] overflow-hidden">
                <div aria-hidden className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[680px] h-[300px] bg-[radial-gradient(ellipse,rgba(87,193,255,0.10)_0%,transparent_70%)] blur-2xl" />
                </div>
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <span className="chip chip-accent text-xs mb-4">Pricing</span>
                    <h1 className="mt-3 text-[clamp(2rem,5vw,3.5rem)] font-semibold text-[var(--ink)] tracking-[-0.04em]">
                        Simple,{" "}
                        <span className="bg-gradient-to-r from-[#57c1ff] to-[#59d499] bg-clip-text text-transparent">
                            predictable
                        </span>{" "}
                        pricing
                    </h1>
                    <p className="mt-5 text-lg text-[var(--mute)] max-w-xl mx-auto">
                        Marketplace-aligned pricing across {availableMarketplaceBots.length} live AI roles. Start free and scale by role.
                    </p>
                    <div className="mt-8 flex items-center justify-center gap-3">
                        <div className="flex -space-x-2">
                            {["forge", "scout", "atlas", "orion", "vega"].map((seed) => (
                                <img
                                    key={seed}
                                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9&radius=10`}
                                    alt="AI worker"
                                    className="w-8 h-8 rounded-full border-2 border-[var(--canvas)] bg-[var(--surface)]"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                        <span className="text-sm text-[var(--mute)]">
                            <span className="font-semibold text-[var(--ink)]">{availableMarketplaceBots.length} live roles</span> in marketplace pricing
                        </span>
                    </div>
                </div>
            </section>

            <PricingCalculator />

            {/* Decision cards */}
            <section className="py-10 sm:py-12 border-b border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-4 md:grid-cols-3">
                        <article className="rounded-xl bg-[var(--surface-card)] border border-[var(--hairline)] p-6">
                            <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--accent-blue)]">Starter Decision</p>
                            <p className="mt-2 text-lg font-semibold text-[var(--ink)]">From {starterPlanPrice}/month</p>
                            <p className="mt-1 text-sm text-[var(--mute)]">Best when you are proving AI teammate workflows with one to two core roles.</p>
                        </article>
                        <article className="rounded-xl bg-[var(--surface-card)] border border-[var(--hairline)] p-6">
                            <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--accent-green)]">Scale Decision</p>
                            <p className="mt-2 text-lg font-semibold text-[var(--ink)]">Most teams pick Pro+ at {proPlanPrice}/month</p>
                            <p className="mt-1 text-sm text-[var(--mute)]">Adds coverage breadth across departments with better rollout economics.</p>
                        </article>
                        <article className="rounded-xl bg-[var(--surface-card)] border border-[var(--hairline)] p-6">
                            <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--mute)]">Governance Decision</p>
                            <p className="mt-2 text-lg font-semibold text-[var(--ink)]">Enterprise for regulated environments</p>
                            <p className="mt-1 text-sm text-[var(--mute)]">Custom controls, support, and deployment posture for strict compliance teams.</p>
                        </article>
                    </div>
                </div>
            </section>

            {/* Plans */}
            <section className="py-24 bg-[var(--surface)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto items-stretch">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`relative rounded-2xl p-7 flex flex-col border transition-all ${plan.highlighted
                                        ? "bg-[var(--surface-card)] border-[var(--accent-blue)]/50 shadow-[0_0_0_1px_rgba(87,193,255,0.2),0_8px_40px_rgba(87,193,255,0.06)]"
                                        : "bg-[var(--surface-card)] border-[var(--hairline)]"
                                    }`}
                            >
                                {plan.highlighted && (
                                    <>
                                        <span className="self-start text-[10px] font-bold bg-[var(--accent-blue)] text-[#07080a] px-2.5 py-1 rounded-full mb-4">
                                            Most Popular
                                        </span>
                                        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-blue)]/50 to-transparent rounded-t-2xl" />
                                    </>
                                )}
                                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--mute)] mb-2">{plan.name}</p>
                                <div className="flex items-end gap-1 mt-1">
                                    <span className="text-4xl font-bold text-[var(--ink)] tracking-tight">{plan.price}</span>
                                    {plan.period && (
                                        <span className="text-sm text-[var(--ash)] mb-1.5">{plan.period}</span>
                                    )}
                                </div>
                                <p className="mt-3 text-sm text-[var(--mute)] leading-relaxed">{plan.description}</p>
                                <ul className="mt-6 space-y-2.5 flex-1">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--body-color)]">
                                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent-green)]" />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-8">
                                    <Link
                                        href={plan.ctaHref}
                                        className={`w-full block text-center py-2.5 text-sm font-semibold rounded-xl transition-all ${plan.highlighted
                                                ? "bg-[var(--accent-blue)] text-[#07080a] hover:bg-[#8dd7ff]"
                                                : plan.name === "Enterprise"
                                                    ? "bg-white/[0.06] border border-[var(--hairline)] text-[var(--ink)] hover:bg-white/[0.1]"
                                                    : "bg-white text-[#07080a] hover:bg-[#e8e8e8]"
                                            }`}
                                    >
                                        {plan.cta}
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-sm text-[var(--ash)] mt-8">Marketplace pricing updates with role availability. 14-day free trial, no credit card required.</p>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-24 bg-[var(--canvas)] border-t border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-2xl font-semibold text-[var(--ink)] tracking-[-0.03em] mb-10 text-center">
                            Frequently asked questions
                        </h2>
                        <div className="divide-y divide-[var(--hairline)] border border-[var(--hairline)] rounded-2xl overflow-hidden">
                            {faqs.map(({ q, a }) => (
                                <div key={q} className="p-6 bg-[var(--surface-card)] hover:bg-[var(--surface)] transition-colors">
                                    <h3 className="font-medium text-[var(--ink)] mb-2 flex items-center gap-2">
                                        <span className="text-[var(--accent-blue)] text-xs font-bold">Q</span>
                                        {q}
                                    </h3>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed pl-5">{a}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

