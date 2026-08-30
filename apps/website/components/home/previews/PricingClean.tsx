'use client';

/**
 * PREVIEW — adaptation of 21st.dev `shadcnstore/pricing-section-1` to the
 * Operations Console palette + real homeMarketingContent pricing. Clean 3-tier
 * cards, "Popular" plan elevated with a blue ring, monthly/annual toggle.
 */

import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { homeMarketingContent } from '@/lib/marketing-content';

function priceParts(price: string, annual: boolean) {
  if (!/^\$?\d/.test(price)) return { main: price, sub: '' };
  const n = parseInt(price.replace(/[^0-9]/g, ''), 10);
  const val = annual ? Math.round(n * 0.8) : n;
  return { main: `$${val}`, sub: annual ? '/mo · billed annually' : '/mo' };
}

export function PricingClean() {
  const { pricing } = homeMarketingContent;
  const [annual, setAnnual] = React.useState(false);

  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper)', color: 'var(--op-ink)' }} aria-label="Pricing">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--op-indigo)' }}>{pricing.eyebrow}</p>
          <h2 className="mt-3 text-balance font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05 }}>{pricing.title}</h2>
          <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{pricing.description}</p>
        </div>

        {/* toggle */}
        <div className="mb-12 flex justify-center">
          <div className="inline-flex items-center gap-1 rounded-full p-1" style={{ background: 'var(--op-paper-3)', border: '1px solid var(--op-line)' }}>
            {[['Monthly', false], ['Annual', true]].map(([label, val]) => {
              const active = annual === val;
              return (
                <button key={String(label)} type="button" onClick={() => setAnnual(val as boolean)}
                  className="rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
                  style={active ? { background: 'var(--op-paper)', color: 'var(--op-ink)', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' } : { color: 'var(--op-muted)' }}>
                  {label}{val === true && <span className="ml-1.5 text-[11px] font-semibold" style={{ color: 'var(--op-indigo)' }}>{pricing.annualDiscountLabel}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {pricing.plans.map((plan) => {
            const pop = plan.highlighted;
            const { main, sub } = priceParts(plan.price, annual);
            return (
              <div key={plan.name} className="op-lift flex flex-col rounded-2xl p-7"
                style={{ background: 'var(--op-paper)', border: pop ? '2px solid var(--op-indigo)' : '1px solid var(--op-line)', boxShadow: pop ? '0 20px 44px -18px rgba(37,99,235,0.28)' : '0 1px 2px rgba(16,24,40,0.04)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--op-ink)' }}>{plan.name}</h3>
                  {pop && <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Popular</span>}
                </div>
                <p className="mt-1.5 text-sm" style={{ color: 'var(--op-muted)' }}>{plan.description}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-4xl font-extrabold" style={{ color: 'var(--op-ink)' }}>{main}</span>
                  {sub && <span className="text-sm" style={{ color: 'var(--op-muted)' }}>{sub}</span>}
                </div>
                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--op-ink-soft)' }}>
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--op-indigo)' }} strokeWidth={2.4} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.ctaHref}
                  className="mt-7 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors"
                  style={pop ? { background: 'var(--op-indigo)', color: '#fff' } : { border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link href="/pricing" className="text-sm font-medium" style={{ color: 'var(--op-indigo)' }}>{pricing.linkLabel}</Link>
        </div>
      </div>
    </section>
  );
}

export default PricingClean;
