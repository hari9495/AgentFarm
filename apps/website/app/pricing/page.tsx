import type { Metadata } from "next";
import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import { marketplaceBots, type Bot } from "@/lib/bots";
import { pricingPageContent } from "@/lib/marketing-content";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { pricingFAQSchema, breadcrumbSchema } from "@/lib/seo-schemas";

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
        <div>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

            {/* ── Hero ── */}
            <section className="op-light relative overflow-hidden">
                {/* soft brand wash, matching home */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ background: "radial-gradient(55% 50% at 50% 0%, var(--op-indigo-soft), transparent 70%)" }}
                />
                <div className="op-wrap-narrow relative text-center" style={{ paddingTop: 88, paddingBottom: 56 }}>
                    <p className="op-eyebrow op-rise op-d1">{pricingPageContent.hero.eyebrow}</p>
                    <h1
                        className="op-rise op-d2 font-display font-extrabold mt-4"
                        style={{ fontSize: "clamp(2.5rem, 5vw, 3.8rem)", letterSpacing: "-0.03em", lineHeight: 1.05, color: "var(--op-ink)" }}
                    >
                        {pricingPageContent.hero.title}
                    </h1>
                    <p className="op-rise op-d3 mt-5 mx-auto max-w-xl text-[1.075rem] leading-relaxed" style={{ color: "var(--op-muted)" }}>
                        {pricingPageContent.hero.description}
                    </p>
                    <p className="op-rise op-d4 mt-3 text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                        {pricingPageContent.hero.footnoteTemplate.replace("{count}", String(availableMarketplaceBots.length))}
                    </p>
                </div>
            </section>

            {/* ── Plan cards ── */}
            <section className="op-soft" style={{ paddingTop: 8, paddingBottom: 88 }}>
                <div className="op-wrap">
                    <div className="grid md:grid-cols-3 gap-5 max-w-[960px] mx-auto items-stretch">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className="op-lift rounded-2xl p-7 flex flex-col bg-white"
                                style={{
                                    border: plan.highlighted ? "1.5px solid var(--op-indigo)" : "1px solid var(--op-line)",
                                    boxShadow: plan.highlighted
                                        ? "0 12px 34px rgba(37,99,235,0.14)"
                                        : "0 1px 2px rgba(16,24,40,0.04)",
                                }}
                            >
                                {plan.highlighted ? (
                                    <span
                                        className="self-start mb-4 text-[11px] font-semibold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full"
                                        style={{ fontFamily: "var(--font-mono)", color: "var(--op-indigo-ink)", background: "var(--op-indigo-soft)" }}
                                    >
                                        Most popular
                                    </span>
                                ) : (
                                    <span className="mb-4 h-[26px]" aria-hidden />
                                )}
                                <p className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                                    {plan.name}
                                </p>
                                <div className="mt-2 flex items-end gap-1.5" style={{ fontFamily: "var(--font-mono)" }}>
                                    <span className="font-semibold" style={{ fontSize: "2.6rem", letterSpacing: "-0.03em", lineHeight: 1 }}>
                                        <AnimatedNumber value={plan.price} style={{ background: "linear-gradient(120deg, var(--op-ink) 45%, var(--op-indigo))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", display: "inline-block" }} />
                                    </span>
                                    {plan.period && (
                                        <span className="mb-1.5 text-[13px]" style={{ color: "var(--op-muted)" }}>{plan.period}</span>
                                    )}
                                </div>
                                <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--op-muted)" }}>{plan.description}</p>
                                <ul className="mt-6 flex-1 space-y-3">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2.5 text-[14px]" style={{ color: "var(--op-ink-soft)" }}>
                                            <Check className="mt-0.5 w-4 h-4 shrink-0" style={{ color: "var(--op-approved)" }} />
                                            <span style={{ lineHeight: 1.5 }}>{f}</span>
                                        </li>
                                    ))}
                                </ul>
                                <Link
                                    href={plan.ctaHref}
                                    className="mt-7 flex items-center justify-center gap-2 rounded-lg py-3 text-[15px] font-semibold transition-transform hover:-translate-y-0.5"
                                    style={{
                                        background: plan.highlighted ? "var(--op-indigo)" : "white",
                                        color: plan.highlighted ? "white" : "var(--op-ink)",
                                        border: plan.highlighted ? "none" : "1px solid var(--op-line)",
                                    }}
                                >
                                    {plan.cta}
                                    {plan.highlighted && <ArrowRight className="w-4 h-4" />}
                                </Link>
                            </div>
                        ))}
                    </div>

                    <p className="mt-7 text-center text-[13px]" style={{ fontFamily: "var(--font-mono)", color: "var(--op-muted)" }}>
                        {pricingPageContent.pageFooterNote}
                    </p>
                </div>
            </section>

            {/* ── Decision helper cards ── */}
            <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
                <div className="op-wrap">
                    <div className="grid md:grid-cols-3 gap-5">
                        {decisionCards.map((card) => (
                            <div
                                key={card.chip}
                                className="op-lift rounded-2xl p-7 bg-white"
                                style={{ border: "1px solid var(--op-line)", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}
                            >
                                <p className="op-eyebrow mb-3">{card.chip}</p>
                                <p className="text-[17px] font-semibold" style={{ letterSpacing: "-0.018em", color: "var(--op-ink)" }}>
                                    {card.price}
                                </p>
                                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--op-muted)" }}>{card.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── FAQ ── */}
            <section className="op-soft" aria-label="Pricing FAQ" style={{ paddingTop: 88, paddingBottom: 88 }}>
                <div className="op-wrap-narrow">
                    <h2
                        className="text-center op-h2 mb-10"
                        style={{ fontSize: "clamp(1.7rem, 3vw, 2.3rem)", letterSpacing: "-0.025em" }}
                    >
                        Frequently asked questions
                    </h2>
                    <div className="rounded-2xl overflow-hidden bg-white" style={{ border: "1px solid var(--op-line)" }}>
                        {pricingPageContent.faqs.map(({ q, a }, i) => (
                            <div
                                key={q}
                                className="px-6 py-5 transition-colors hover:bg-[var(--op-paper-2)]"
                                style={{ borderBottom: i < pricingPageContent.faqs.length - 1 ? "1px solid var(--op-line)" : "none" }}
                            >
                                <h3 className="font-semibold mb-2" style={{ fontSize: "15px", letterSpacing: "-0.015em", color: "var(--op-ink)" }}>
                                    {q}
                                </h3>
                                <p className="text-[14px]" style={{ lineHeight: 1.6, color: "var(--op-muted)" }}>{a}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ── */}
            <section className="op-dark text-center" style={{ paddingTop: 88, paddingBottom: 88 }}>
                <div className="op-wrap-narrow">
                    <h2
                        className="op-h2"
                        style={{ fontSize: "clamp(1.9rem, 3.5vw, 2.7rem)", letterSpacing: "-0.025em", lineHeight: 1.1 }}
                    >
                        Ready to deploy your first worker?
                    </h2>
                    <p className="mt-4 text-[1.075rem]" style={{ lineHeight: 1.5, color: "var(--op-muted)" }}>
                        Start free for 14 days. No credit card required.
                    </p>
                    <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <Link
                            href="/get-started"
                            className="px-6 py-3 rounded-lg text-[15px] font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5"
                            style={{ background: "var(--op-indigo)" }}
                        >
                            Start free trial
                        </Link>
                        <Link
                            href="/book-demo"
                            className="px-6 py-3 rounded-lg text-[15px] font-semibold bg-white transition-colors hover:bg-[var(--op-paper-2)]"
                            style={{ border: "1px solid var(--op-line)", color: "var(--op-ink)" }}
                        >
                            Talk to sales
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
