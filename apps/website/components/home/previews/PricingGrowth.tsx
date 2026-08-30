'use client';

/**
 * PREVIEW — adaptation of 21st.dev `uilayout.contact/growth-plans` to the
 * Operations Console palette + real homeMarketingContent pricing. Prominent
 * monthly/annual switch, bold prices, the highlighted plan as a solid-blue card.
 */

import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { homeMarketingContent } from '@/lib/marketing-content';

function priceParts(price: string, annual: boolean) {
  if (!/^\$?\d/.test(price)) return { main: price, sub: '' };
  const n = parseInt(price.replace(/[^0-9]/g, ''), 10);
  const val = annual ? Math.round(n * 0.8) : n;
  return { main: `$${val}`, sub: annual ? '/mo billed annually' : '/monthly' };
}

export function PricingGrowth() {
  const { pricing } = homeMarketingContent;
  const [annual, setAnnual] = React.useState(false);

  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper-2)', color: 'var(--op-ink)' }} aria-label="Pricing">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--op-indigo)' }}>{pricing.eyebrow}</p>
          <h2 className="mt-3 text-balance font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05 }}>{pricing.title}</h2>
          <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{pricing.description}</p>
        </div>

        {/* switch */}
        <div className="mb-14 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-full px-4 py-2" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
            <span className="text-sm font-medium" style={{ color: annual ? 'var(--op-muted)' : 'var(--op-ink)' }}>{pricing.monthlyLabel}</span>
            <button type="button" role="switch" aria-checked={annual} aria-label="Toggle annual billing" onClick={() => setAnnual((v) => !v)}
              className="relative h-6 w-11 rounded-full transition-colors" style={{ background: annual ? 'var(--op-indigo)' : 'var(--op-paper-3)', border: '1px solid var(--op-line)' }}>
              <span className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-all" style={{ left: annual ? 'calc(100% - 19px)' : '3px', boxShadow: '0 1px 2px rgba(16,24,40,0.2)' }} />
            </button>
            <span className="text-sm font-medium" style={{ color: annual ? 'var(--op-ink)' : 'var(--op-muted)' }}>{pricing.annualLabel}</span>
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>Save 20%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-center">
          {pricing.plans.map((plan) => {
            const pop = plan.highlighted;
            const { main, sub } = priceParts(plan.price, annual);
            const ink = pop ? '#fff' : 'var(--op-ink)';
            const mut = pop ? 'rgba(255,255,255,0.72)' : 'var(--op-muted)';
            return (
              <div key={plan.name} className="flex flex-col rounded-2xl p-7"
                style={pop
                  ? { background: 'var(--op-indigo)', boxShadow: '0 24px 50px -18px rgba(37,99,235,0.5)', transform: 'scale(1.03)' }
                  : { background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold" style={{ color: ink }}>{plan.name}</h3>
                  {pop && <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--op-indigo)' }}>Most popular</span>}
                </div>
                <p className="mt-1.5 text-sm" style={{ color: mut }}>{plan.description}</p>
                <div className="mt-5 flex items-baseline gap-1.5">
                  <span className="font-[family-name:var(--font-display)] text-5xl font-extrabold" style={{ color: ink }}>{main}</span>
                  {sub && <span className="text-sm" style={{ color: mut }}>{sub}</span>}
                </div>
                <Link href={plan.ctaHref}
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors"
                  style={pop ? { background: '#fff', color: 'var(--op-indigo)' } : { background: 'var(--op-ink)', color: '#fff' }}>
                  {plan.cta}
                </Link>
                <div className="my-6 h-px w-full" style={{ background: pop ? 'rgba(255,255,255,0.18)' : 'var(--op-line)' }} />
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: pop ? 'rgba(255,255,255,0.9)' : 'var(--op-ink-soft)' }}>
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: pop ? '#fff' : 'var(--op-indigo)' }} strokeWidth={2.4} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
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

export default PricingGrowth;
