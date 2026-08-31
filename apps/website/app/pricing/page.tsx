import type { Metadata } from 'next';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { marketplaceBots } from '@/lib/bots';
import { pricingPageContent, homeMarketingContent } from '@/lib/marketing-content';
import { pricingFAQSchema, breadcrumbSchema } from '@/lib/seo-schemas';
import PricingPlansToggle, { type PricingPlan } from '@/components/pricing/PricingPlansToggle';
import PricingComparison from '@/components/pricing/PricingComparison';
import PricingFAQAccordion from '@/components/pricing/PricingFAQAccordion';

export const metadata: Metadata = {
  title: pricingPageContent.metadata.title,
  description: pricingPageContent.metadata.description,
  keywords: [
    'AgentFarms pricing', 'AI worker plans', 'AI automation cost',
    'Starter+ plan', 'Pro+ plan', 'Enterprise AI plan',
    'AI staffing pricing India', 'governed AI platform price',
    'AI worker subscription', '14 day free trial AI',
  ],
  alternates: { canonical: 'https://agentfarms.in/pricing' },
  openGraph: {
    title: pricingPageContent.metadata.title,
    description: pricingPageContent.metadata.description,
    url: 'https://agentfarms.in/pricing',
    type: 'website',
  },
};

const availableMarketplaceBots = marketplaceBots.filter((b) => b.available);

// Standard plans — same source as the home page, so the cards, comparison table,
// and home stay consistent (Starter $299 / Pro $599 / Enterprise Custom).
const plans: PricingPlan[] = homeMarketingContent.pricing.plans.map((p) => ({
  name: p.name,
  price: p.price,
  period: '',
  description: p.description,
  features: [...p.features],
  cta: p.cta,
  ctaHref: p.ctaHref,
  highlighted: p.highlighted,
}));

const starterPlanPrice = plans.find((p) => p.name === 'Starter')?.price ?? '$299';
const proPlanPrice = plans.find((p) => p.name === 'Pro')?.price ?? '$599';

const decisionCards = [
  { chip: pricingPageContent.decisionCards[0].chip, price: `${pricingPageContent.decisionCards[0].pricePrefix} ${starterPlanPrice}/month`, desc: pricingPageContent.decisionCards[0].description },
  { chip: pricingPageContent.decisionCards[1].chip, price: `${pricingPageContent.decisionCards[1].pricePrefix} ${proPlanPrice}/month`, desc: pricingPageContent.decisionCards[1].description },
  { chip: pricingPageContent.decisionCards[2].chip, price: pricingPageContent.decisionCards[2].pricePrefix, desc: pricingPageContent.decisionCards[2].description },
];

const pageSchemas = [
  pricingFAQSchema,
  breadcrumbSchema([
    { name: 'Home', url: 'https://agentfarms.in' },
    { name: 'Pricing', url: 'https://agentfarms.in/pricing' },
  ]),
];

export default function PricingPage() {
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchemas) }} />

      {/* Hero */}
      <section className="op-light relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(55% 50% at 50% 0%, var(--op-indigo-soft), transparent 70%)' }} />
        <div className="op-wrap-narrow relative text-center" style={{ paddingTop: 88, paddingBottom: 56 }}>
          <p className="op-eyebrow op-rise op-d1">{pricingPageContent.hero.eyebrow}</p>
          <h1 className="op-rise op-d2 font-[family-name:var(--font-display)] font-extrabold mt-4" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.8rem)', letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--op-ink)' }}>{pricingPageContent.hero.title}</h1>
          <p className="op-rise op-d3 mt-5 mx-auto max-w-xl text-[1.075rem] leading-relaxed" style={{ color: 'var(--op-muted)' }}>{pricingPageContent.hero.description}</p>
          <p className="op-rise op-d4 mt-3 text-[13px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--op-muted)' }}>{pricingPageContent.hero.footnoteTemplate.replace('{count}', String(availableMarketplaceBots.length))}</p>
        </div>
      </section>

      {/* Plans + billing toggle */}
      <section className="op-soft" style={{ paddingTop: 8, paddingBottom: 40 }}>
        <PricingPlansToggle plans={plans} />
        <p className="op-wrap mt-7 text-center text-[13px]" style={{ fontFamily: 'var(--font-mono)', color: 'var(--op-muted)' }}>{pricingPageContent.pageFooterNote}</p>
      </section>

      {/* Feature comparison table */}
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <PricingComparison />
      </section>

      {/* Decision helper cards */}
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <div className="op-wrap">
          <div className="grid md:grid-cols-3 gap-5">
            {decisionCards.map((card) => (
              <div key={card.chip} className="op-lift rounded-2xl p-7" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
                <p className="op-eyebrow mb-3">{card.chip}</p>
                <p className="text-[17px] font-semibold" style={{ letterSpacing: '-0.018em', color: 'var(--op-ink)' }}>{card.price}</p>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--op-muted)' }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ accordion */}
      <section className="op-light" aria-label="Pricing FAQ" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <PricingFAQAccordion />
      </section>

      {/* CTA */}
      <section className="op-soft text-center" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <div className="op-wrap-narrow">
          <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>14-day free trial · no card required</span>
          <h2 className="mx-auto mt-5 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ lineHeight: 1.04, color: 'var(--op-ink)' }}>Ready to deploy your first worker?</h2>
          <p className="mt-4 text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>Start with one workflow, prove the output, and expand from evidence.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/get-started" className="inline-flex h-11 items-center rounded-xl px-6 text-[15px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Start free trial</Link>
            <Link href="/book-demo" className="inline-flex h-11 items-center rounded-xl px-6 text-[15px] font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>Talk to sales</Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {['Policy-aware approvals', 'Tenant-isolated runtime', 'Full evidence trail'].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--op-indigo)' }} /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
