import type { Metadata } from "next";
import { CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { marketplaceBots, type Bot } from "@/lib/bots";
import { pricingPageContent } from "@/lib/marketing-content";
import { pricingFAQSchema, softwareApplicationSchema, breadcrumbSchema } from "@/lib/seo-schemas";

export const metadata: Metadata = {
    title: pricingPageContent.metadata.title,
    description: pricingPageContent.metadata.description,
    keywords: [
        "AgentFarms pricing", "AI worker plans", "AI automation cost",
        "Starter+ plan", "Pro+ plan", "Enterprise AI plan",
        "AI staffing pricing India", "governed AI platform price",
        "AI worker subscription", "14 day free trial AI",
    ],
    alternates: { canonical: "https://agentfarms.in/pricing" },
    openGraph: {
        title: pricingPageContent.metadata.title,
        description: pricingPageContent.metadata.description,
        url: "https://agentfarms.in/pricing",
        type: "website",
    },
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

const starterPlanPrice = plans.find((p) => p.name === "Starter+")?.price ?? "$299";
const proPlanPrice = plans.find((p) => p.name === "Pro+")?.price ?? "$599";

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

const pageSchemas = [
    pricingFAQSchema,
    breadcrumbSchema([
        { name: "Home", url: "https://agentfarms.in" },
        { name: "Pricing", url: "https://agentfarms.in/pricing" },
    ]),
];

export default function PricingPage() {
    return (
        <div style={{ background: "#ffffff" }}>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

            {/* Hero tile */}
            <section className="af-tile af-tile-white text-center" style={{ paddingTop: 80, paddingBottom: 64 }}>
                <div className="af-container-narrow">
                    <p className="af-eyebrow mb-4">{pricingPageContent.hero.eyebrow}</p>
                    <h1
                        className="font-semibold text-[#1d1d1f]"
                        style={{ fontSize: "clamp(2.4rem, 5vw, 3.6rem)", letterSpacing: "-0.03em", lineHeight: 1.07 }}
                    >
                        {pricingPageContent.hero.title}
                    </h1>
                    <p className="mt-5 mx-auto max-w-lg text-[17px] text-[#424245]" style={{ lineHeight: 1.47, letterSpacing: "-0.022em" }}>
                        {pricingPageContent.hero.description}
                    </p>
                    <p className="mt-3 text-[14px] text-[#aeaeb2]">
                        {pricingPageContent.hero.footnoteTemplate.replace("{count}", String(availableMarketplaceBots.length))}
                    </p>
                </div>
            </section>

            {/* Plan cards */}
            <section className="af-tile af-tile-parchment" style={{ paddingTop: 0, paddingBottom: 64 }}>
                <div className="af-container">
                    <div className="grid md:grid-cols-3 gap-4 max-w-[900px] mx-auto">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className="rounded-[18px] p-6 flex flex-col"
                                style={{
                                    border: plan.highlighted ? "2px solid #0066cc" : "1px solid #d2d2d7",
                                    background: plan.highlighted ? "rgba(0,102,204,0.02)" : "#ffffff",
                                }}
                            >
                                {plan.highlighted && (
                                    <span
                                        className="self-start mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#0066cc] px-2.5 py-1 rounded-full"
                                        style={{ background: "rgba(0,102,204,0.1)" }}
                                    >
                                        Most popular
                                    </span>
                                )}
                                <p className="text-[12px] font-semibold text-[#6e6e73] uppercase tracking-[0.06em]">{plan.name}</p>
                                <div className="mt-2 flex items-end gap-1.5">
                                    <span
                                        className="font-semibold text-[#1d1d1f]"
                                        style={{ fontSize: "2.4rem", letterSpacing: "-0.03em", lineHeight: 1 }}
                                    >
                                        {plan.price}
                                    </span>
                                    {plan.period && (
                                        <span className="mb-1 text-[14px] text-[#aeaeb2]">{plan.period}</span>
                                    )}
                                </div>
                                <p className="mt-2.5 text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>{plan.description}</p>
                                <ul className="mt-5 flex-1 space-y-2.5">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2 text-[14px] text-[#424245]">
                                            <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-[#0066cc]" />
                                            <span style={{ lineHeight: 1.5 }}>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href={plan.ctaHref}
                                    className="mt-6 flex items-center justify-center gap-2 rounded-full py-2.5 text-[15px] font-medium transition-colors"
                                    style={{
                                        background: plan.highlighted ? "#0066cc" : "transparent",
                                        color: plan.highlighted ? "#ffffff" : "#1d1d1f",
                                        border: plan.highlighted ? "none" : "1px solid #d2d2d7",
                                    }}
                                >
                                    {plan.cta}
                                    {plan.highlighted && <ArrowRight className="w-4 h-4" />}
                                </Link>
                            </div>
                        ))}
                    </div>

                    <p className="mt-6 text-center text-[13px] text-[#aeaeb2]">
                        {pricingPageContent.pageFooterNote}
                    </p>
                </div>
            </section>

            {/* Decision helper cards */}
            <section className="af-tile af-tile-white" style={{ paddingTop: 48, paddingBottom: 48 }}>
                <div className="af-container">
                    <div className="grid md:grid-cols-3 gap-4">
                        {decisionCards.map((card) => (
                            <div
                                key={card.chip}
                                className="rounded-[18px] p-6"
                                style={{ border: "1px solid #d2d2d7" }}
                            >
                                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#0066cc]">
                                    {card.chip}
                                </p>
                                <p className="text-[17px] font-semibold text-[#1d1d1f]" style={{ letterSpacing: "-0.018em" }}>
                                    {card.price}
                                </p>
                                <p className="mt-1.5 text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.5 }}>{card.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FAQ */}
            <section className="af-tile af-tile-parchment" aria-label="Pricing FAQ">
                <div className="af-container-narrow">
                    <h2
                        className="text-center font-semibold text-[#1d1d1f] mb-10"
                        style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", letterSpacing: "-0.025em" }}
                    >
                        Frequently asked questions
                    </h2>
                    <div className="rounded-[18px] overflow-hidden" style={{ border: "1px solid #d2d2d7", background: "#ffffff" }}>
                        {pricingPageContent.faqs.map(({ q, a }, i) => (
                            <div
                                key={q}
                                className="px-6 py-5 hover:bg-[#f5f5f7] transition-colors"
                                style={{ borderBottom: i < pricingPageContent.faqs.length - 1 ? "1px solid #e8e8ed" : "none" }}
                            >
                                <h3 className="font-semibold text-[#1d1d1f] mb-2" style={{ fontSize: "15px", letterSpacing: "-0.015em" }}>
                                    {q}
                                </h3>
                                <p className="text-[14px] text-[#6e6e73]" style={{ lineHeight: 1.6 }}>{a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA tile */}
            <section className="af-tile af-tile-dark text-center">
                <div className="af-container-narrow">
                    <h2
                        className="font-semibold text-white"
                        style={{ fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        Ready to deploy your first worker?
                    </h2>
                    <p className="mt-4 text-[17px] text-[#98989d]" style={{ lineHeight: 1.47 }}>
                        Start free for 14 days. No credit card required.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href="/get-started"
                            className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors"
                            style={{ background: "#0066cc" }}
                        >
                            Start free trial
                        </Link>
                        <Link
                            href="/book-demo"
                            className="px-6 py-3 rounded-full text-[17px] font-medium text-white transition-colors"
                            style={{ border: "1px solid rgba(255,255,255,0.25)" }}
                        >
                            Talk to sales
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
