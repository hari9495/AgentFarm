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
        <div className="site-shell bg-[var(--canvas)]">
            {/* Hero */}
            <section className="magic-canvas relative py-28 text-center border-b border-[var(--m-hairline)] overflow-hidden">
                <div aria-hidden className="aurora-bg">
                    <div className="orb orb-3" />
                    <div className="orb orb-4" />
                    <div className="cyber-grid" />
                    <div className="magic-grain" />
                </div>
                <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="reveal-up flex justify-center mb-5">
                        <span className="neon-chip neon-chip-cyan">
                            <span className="dot" aria-hidden />
                            Pricing
                        </span>
                    </div>
                    <h1 className="reveal-up delay-1 text-[clamp(2.4rem,5.5vw,4rem)] font-black text-[var(--m-ink)] tracking-[-0.04em]">
                        Simple,{" "}
                        <span className="holo-text">predictable</span>{" "}
                        pricing
                    </h1>
                    <p className="reveal-up delay-2 mt-5 text-lg text-[var(--m-ink-muted)] max-w-xl mx-auto">
                        Marketplace-aligned pricing across {availableMarketplaceBots.length} live AI roles. Start free and scale by role.
                    </p>
                    <div className="reveal-up delay-3 mt-8 flex items-center justify-center gap-3">
                        <div className="flex -space-x-2">
                            {["forge", "scout", "atlas", "orion", "vega"].map((seed) => (
                                <img
                                    key={seed}
                                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9&radius=10`}
                                    alt="AI worker"
                                    className="w-8 h-8 rounded-full border-2 border-[var(--m-canvas)] bg-[var(--m-surface)]"
                                    loading="lazy"
                                />
                            ))}
                        </div>
                        <span className="text-sm text-[var(--m-ink-muted)]">
                            <span className="font-semibold text-[var(--m-ink)]">{availableMarketplaceBots.length} live roles</span> in marketplace pricing
                        </span>
                    </div>
                </div>
            </section>

            <PricingCalculator />

            {/* Decision cards */}
            <section className="py-10 sm:py-12 border-b border-[var(--m-hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid gap-4 md:grid-cols-3">
                        <article className="glass-card holo-edge reveal-up p-6">
                            <span className="neon-chip neon-chip-cyan text-[10px] mb-3"><span className="dot" aria-hidden />Starter</span>
                            <p className="mt-2 text-lg font-bold text-[var(--m-ink)]">From {starterPlanPrice}/month</p>
                            <p className="mt-1 text-sm text-[var(--m-ink-muted)]">Best when you are proving AI teammate workflows with one to two core roles.</p>
                        </article>
                        <article className="glass-card holo-edge reveal-up delay-1 p-6">
                            <span className="neon-chip neon-chip-mint text-[10px] mb-3"><span className="dot" aria-hidden />Scale</span>
                            <p className="mt-2 text-lg font-bold text-[var(--m-ink)]">Most teams pick Pro+ at {proPlanPrice}/month</p>
                            <p className="mt-1 text-sm text-[var(--m-ink-muted)]">Adds coverage breadth across departments with better rollout economics.</p>
                        </article>
                        <article className="glass-card holo-edge reveal-up delay-2 p-6">
                            <span className="neon-chip neon-chip-violet text-[10px] mb-3"><span className="dot" aria-hidden />Governance</span>
                            <p className="mt-2 text-lg font-bold text-[var(--m-ink)]">Enterprise for regulated environments</p>
                            <p className="mt-1 text-sm text-[var(--m-ink-muted)]">Custom controls, support, and deployment posture for strict compliance teams.</p>
                        </article>
                    </div>
                </div>
            </section>

            {/* Plans */}
            <section className="py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto items-stretch">
                        {plans.map((plan, i) => (
                            <div
                                key={plan.name}
                                className={`glass-card reveal-up flex flex-col p-7 delay-${i + 1} ${plan.highlighted ? "holo-edge" : ""}`}
                            >
                                {plan.highlighted && (
                                    <span className="neon-chip neon-chip-cyan self-start mb-4 text-[10px]">
                                        <span className="dot" aria-hidden />Most Popular
                                    </span>
                                )}
                                <p className="text-xs font-semibold uppercase tracking-widest text-[var(--m-ink-faint)] mb-2">{plan.name}</p>
                                <div className="flex items-end gap-1 mt-1">
                                    <span className={`text-4xl font-black tracking-tight ${plan.highlighted ? "holo-text" : "text-[var(--m-ink)]"}`}>{plan.price}</span>
                                    {plan.period && (
                                        <span className="text-sm text-[var(--m-ink-faint)] mb-1.5">{plan.period}</span>
                                    )}
                                </div>
                                <p className="mt-3 text-sm text-[var(--m-ink-muted)] leading-relaxed">{plan.description}</p>
                                <ul className="mt-6 space-y-2.5 flex-1">
                                    {plan.features.map((f) => (
                                        <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--m-ink-soft)]">
                                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--m-aurora-3)" }} />
                                            {f}
                                        </li>
                                    ))}
                                </ul>
                                <div className="mt-8">
                                    <Link
                                        href={plan.ctaHref}
                                        className={plan.highlighted ? "magic-btn magic-btn-primary w-full block text-center" : "magic-btn magic-btn-ghost w-full block text-center"}
                                    >
                                        {plan.cta}
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-center text-sm text-[var(--m-ink-faint)] mt-8">Marketplace pricing updates with role availability. 14-day free trial, no credit card required.</p>
                </div>
            </section>

            {/* FAQ */}
            <section className="py-24 border-t border-[var(--m-hairline)]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-2xl font-black text-[var(--m-ink)] tracking-[-0.03em] mb-10 text-center reveal-up">
                            Frequently asked <span className="holo-text">questions</span>
                        </h2>
                        <div className="glass-card reveal-up delay-1 divide-y divide-[var(--m-hairline)] overflow-hidden p-0">
                            {faqs.map(({ q, a }) => (
                                <div key={q} className="p-6 hover:bg-[var(--m-surface-elev)] transition-colors">
                                    <h3 className="font-semibold text-[var(--m-ink)] mb-2 flex items-center gap-2">
                                        <span className="neon-chip neon-chip-cyan text-[9px] px-1.5 py-0.5">Q</span>
                                        {q}
                                    </h3>
                                    <p className="text-sm text-[var(--m-ink-muted)] leading-relaxed pl-5">{a}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

