import type { Metadata } from "next";
import { CheckCircle2, ArrowRight } from "lucide-react";
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

const starterPlanPrice = plans.find((p) => p.name === "Starter+")?.price ?? "$299";
const proPlanPrice = plans.find((p) => p.name === "Pro+")?.price ?? "$599";

const faqs = [
    {
        q: "Is there a free trial?",
        a: "Yes — join the waitlist and you'll get early access with a 14-day free trial on the Starter plan. No credit card required.",
    },
    {
        q: "What counts as a task execution?",
        a: "A task execution is any unit of work an AI worker picks up — writing a function, sending a follow-up email, drafting a report, processing a support ticket, running a CI check, or scheduling a meeting.",
    },
    {
        q: "Can I change plans?",
        a: "Absolutely. You can upgrade or downgrade at any time. Changes take effect at the next billing cycle.",
    },
    {
        q: "What integrations are supported?",
        a: "GitHub, Jira, Slack, HubSpot, Salesforce, Gmail, Google Calendar, Microsoft Teams, Notion, and 100+ more via MCP connectors. Bring your own MCP server for internal tools. New connectors added continuously.",
    },
    {
        q: "Is my data safe?",
        a: "Every AI worker runs in a tenant-isolated Azure VM with least-privilege access. Your data never leaves your own connected tools and AgentFarm never stores credentials in plaintext.",
    },
    {
        q: "Do you support on-premises deployment?",
        a: "Yes — the Enterprise plan includes an on-premises option for teams with strict data residency requirements.",
    },
];

export default function PricingPage() {
    return (
        <div className="bg-[var(--canvas)]">
            {/* Hero */}
            <section className="relative border-b border-[var(--hairline)] py-24 text-center overflow-hidden">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
                    style={{
                        background: "radial-gradient(ellipse 70% 40% at 50% -5%, rgba(89,212,153,0.06) 0%, transparent 70%)",
                    }}
                />
                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-green)] mb-5">
                        Pricing
                    </p>
                    <h1 className="text-[clamp(2.4rem,5.5vw,4rem)] font-black text-[var(--ink)] tracking-[-0.04em]">
                        Simple, predictable pricing
                    </h1>
                    <p className="mt-5 text-lg text-[var(--body-color)] max-w-xl mx-auto leading-relaxed">
                        Marketplace-aligned pricing across {availableMarketplaceBots.length} live AI roles.
                        Start free and scale by role.
                    </p>
                    <p className="mt-4 text-sm text-[var(--ash)]">
                        {availableMarketplaceBots.length} live roles · 14-day free trial · No card required
                    </p>
                </div>
            </section>

            <PricingCalculator />

            {/* Decision cards */}
            <section className="py-10 sm:py-12 border-b border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-4 md:grid-cols-3">
                        {[
                            { chip: "Getting started", price: `From ${starterPlanPrice}/month`, desc: "Best when you are proving AI teammate workflows with one to two core roles." },
                            { chip: "Most popular", price: `Most teams pick Pro+ at ${proPlanPrice}/month`, desc: "Adds coverage breadth across departments with better rollout economics." },
                            { chip: "Enterprise", price: "For regulated environments", desc: "Custom controls, support, and deployment posture for strict compliance teams." },
                        ].map((card) => (
                            <article
                                key={card.chip}
                                className="bg-[var(--surface-card)] border border-[var(--hairline)] rounded-xl p-6"
                            >
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-green)] mb-3">{card.chip}</p>
                                <p className="text-base font-bold text-[var(--ink)]">{card.price}</p>
                                <p className="mt-1 text-sm text-[var(--mute)] leading-relaxed">{card.desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            {/* Plans */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto items-stretch">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`flex flex-col p-7 rounded-xl border bg-[var(--surface-card)] ${plan.highlighted ? "border-[var(--accent-green)]" : "border-[var(--hairline)]"}`}
                            >
                                {plan.highlighted && (
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-green)] mb-4">
                                        Most Popular
                                    </p>
                                )}
                                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--ash)] mb-2">{plan.name}</p>
                                <div className="flex items-end gap-1 mt-1">
                                    <span className="text-4xl font-black tracking-tight text-[var(--ink)]">{plan.price}</span>
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
                                        className={`${plan.highlighted ? "btn-primary" : "btn-secondary"} w-full justify-center`}
                                    >
                                        {plan.cta}
                                        {plan.highlighted && <ArrowRight className="w-4 h-4" />}
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-sm text-[var(--ash)] mt-8">
                        Marketplace pricing updates with role availability · 14-day free trial, no credit card required.
                    </p>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-24 border-t border-[var(--hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-2xl font-black text-[var(--ink)] tracking-[-0.03em] mb-10 text-center">
                            Frequently asked questions
                        </h2>
                        <div className="bg-[var(--surface-card)] border border-[var(--hairline)] rounded-xl divide-y divide-[var(--hairline)] overflow-hidden">
                            {faqs.map(({ q, a }) => (
                                <div key={q} className="p-6 hover:bg-[var(--surface-elevated)] transition-colors">
                                    <h3 className="font-semibold text-[var(--ink)] mb-2">{q}</h3>
                                    <p className="text-sm text-[var(--mute)] leading-relaxed">{a}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
