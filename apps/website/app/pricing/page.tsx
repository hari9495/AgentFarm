import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import PricingCalculator from "@/components/pricing/PricingCalculator";
import { marketplaceBots, type Bot } from "@/lib/bots";
import { pricingPageContent } from "@/lib/marketing-content";

export const metadata: Metadata = {
    title: pricingPageContent.metadata.title,
    description: pricingPageContent.metadata.description,
};

type PlanTier = Bot["plan"];

const PLAN_ORDER: PlanTier[] = ["Starter+", "Pro+", "Enterprise"];
const PLAN_CONFIG = pricingPageContent.planConfig;
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
            `${liveTierBots.length} ${pricingPageContent.planFeatures.liveRolesLabel} (${tierBots.length} ${pricingPageContent.planFeatures.totalRolesLabel})`,
            `${deptCount} ${pricingPageContent.planFeatures.departmentsLabel}`,
            rolePreview
                ? `${pricingPageContent.planFeatures.topRolesPrefix} ${rolePreview}`
                : pricingPageContent.planFeatures.fallbackRoleSummary,
            tier === "Enterprise" ? pricingPageContent.planFeatures.enterpriseNote : pricingPageContent.planFeatures.trialNote,
        ],
        cta: PLAN_CONFIG[tier].cta,
        ctaHref: PLAN_CONFIG[tier].ctaHref,
        highlighted: PLAN_CONFIG[tier].highlighted,
    };
});

const starterPlanPrice = plans.find((plan) => plan.name === "Starter+")?.price ?? "$299";
const proPlanPrice = plans.find((plan) => plan.name === "Pro+")?.price ?? "$599";

const decisionCards = [
    {
        chip: pricingPageContent.decisionCards[0].chip,
        price: `${pricingPageContent.decisionCards[0].pricePrefix} ${starterPlanPrice}/month`,
        desc: pricingPageContent.decisionCards[0].description,
    },
    {
        chip: pricingPageContent.decisionCards[1].chip,
        price: `${pricingPageContent.decisionCards[1].pricePrefix} ${proPlanPrice}/month`,
        desc: pricingPageContent.decisionCards[1].description,
    },
    {
        chip: pricingPageContent.decisionCards[2].chip,
        price: pricingPageContent.decisionCards[2].pricePrefix,
        desc: pricingPageContent.decisionCards[2].description,
    },
];

export default function PricingPage() {
    return (
        <div className="bg-[var(--canvas)]">
            <section className="relative overflow-hidden border-b border-[var(--hairline)] py-24 text-center">
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-[400px]"
                    style={{
                        background: "radial-gradient(ellipse 70% 40% at 50% -5%, rgba(89,212,153,0.06) 0%, transparent 70%)",
                    }}
                />
                <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-green)]">
                        {pricingPageContent.hero.eyebrow}
                    </p>
                    <h1 className="text-[clamp(2.4rem,5.5vw,4rem)] font-black tracking-[-0.04em] text-[var(--ink)]">
                        {pricingPageContent.hero.title}
                    </h1>
                    <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[var(--body-color)]">
                        {pricingPageContent.hero.description}
                    </p>
                    <p className="mt-4 text-sm text-[var(--ash)]">
                        {pricingPageContent.hero.footnoteTemplate.replace("{count}", String(availableMarketplaceBots.length))}
                    </p>
                </div>
            </section>

            <PricingCalculator />

            <section className="border-b border-[var(--hairline)] py-10 sm:py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-4 md:grid-cols-3">
                        {decisionCards.map((card) => (
                            <article
                                key={card.chip}
                                className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)] p-6"
                            >
                                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-green)]">
                                    {card.chip}
                                </p>
                                <p className="text-base font-bold text-[var(--ink)]">{card.price}</p>
                                <p className="mt-1 text-sm leading-relaxed text-[var(--mute)]">{card.desc}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="py-24">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto grid max-w-5xl grid-cols-1 items-stretch gap-5 md:grid-cols-3">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className={`flex flex-col rounded-xl border bg-[var(--surface-card)] p-7 ${plan.highlighted ? "border-[var(--accent-green)]" : "border-[var(--hairline)]"}`}
                            >
                                {plan.highlighted && (
                                    <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-green)]">
                                        Most popular
                                    </p>
                                )}
                                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--ash)]">{plan.name}</p>
                                <div className="mt-1 flex items-end gap-1">
                                    <span className="text-4xl font-black tracking-tight text-[var(--ink)]">{plan.price}</span>
                                    {plan.period ? <span className="mb-1.5 text-sm text-[var(--ash)]">{plan.period}</span> : null}
                                </div>
                                <p className="mt-3 text-sm leading-relaxed text-[var(--mute)]">{plan.description}</p>
                                <ul className="mt-6 flex-1 space-y-2.5">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start gap-2.5 text-sm text-[var(--body-color)]">
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-green)]" />
                                            {feature}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-8">
                                    <Link
                                        href={plan.ctaHref}
                                        className={`${plan.highlighted ? "btn-primary" : "btn-secondary"} w-full justify-center`}
                                    >
                                        {plan.cta}
                                        {plan.highlighted ? <ArrowRight className="h-4 w-4" /> : null}
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-8 text-center text-sm text-[var(--ash)]">
                        {pricingPageContent.pageFooterNote}
                    </p>
                </div>
            </section>

            <section className="border-t border-[var(--hairline)] py-24">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="mx-auto max-w-3xl">
                        <h2 className="mb-10 text-center text-2xl font-black text-[var(--ink)] tracking-[-0.03em]">
                            Frequently asked questions
                        </h2>
                        <div className="overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)] divide-y divide-[var(--hairline)]">
                            {pricingPageContent.faqs.map(({ q, a }) => (
                                <div key={q} className="p-6 transition-colors hover:bg-[var(--surface-elevated)]">
                                    <h3 className="mb-2 font-semibold text-[var(--ink)]">{q}</h3>
                                    <p className="text-sm leading-relaxed text-[var(--mute)]">{a}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
