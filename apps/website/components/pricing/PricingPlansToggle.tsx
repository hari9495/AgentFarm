'use client';

/**
 * Pricing-page plan cards with a monthly/annual billing toggle. Data-driven:
 * receives the tiers computed server-side from the marketplace. Growth-plans
 * style (Pro+ = solid-blue card). Operations Console palette. Annual = -20%.
 */

import * as React from 'react';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';

export type PricingPlan = {
  name: string;
  price: string;      // "$299" | "Custom"
  period: string;     // "/ month" | ""
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted: boolean;
};

function priceParts(price: string, annual: boolean) {
  if (!/^\$?\d/.test(price)) return { main: price, sub: '' };
  const n = parseInt(price.replace(/[^0-9]/g, ''), 10);
  const val = annual ? Math.round(n * 0.8) : n;
  return { main: `$${val}`, sub: annual ? '/mo billed annually' : '/month' };
}

export default function PricingPlansToggle({ plans }: { plans: PricingPlan[] }) {
  const [annual, setAnnual] = React.useState(false);

  return (
    <div className="op-wrap">
      <div className="mb-12 flex justify-center">
        <div className="inline-flex items-center gap-3 rounded-full px-4 py-2" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
          <span className="text-sm font-medium" style={{ color: annual ? 'var(--op-muted)' : 'var(--op-ink)' }}>Monthly</span>
          <button type="button" role="switch" aria-checked={annual} aria-label="Toggle annual billing" onClick={() => setAnnual((v) => !v)}
            className="relative h-6 w-11 rounded-full transition-colors" style={{ background: annual ? 'var(--op-indigo)' : 'var(--op-paper-3)', border: '1px solid var(--op-line)' }}>
            <span className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white transition-all" style={{ left: annual ? 'calc(100% - 19px)' : '3px', boxShadow: '0 1px 2px rgba(16,24,40,0.2)' }} />
          </button>
          <span className="text-sm font-medium" style={{ color: annual ? 'var(--op-ink)' : 'var(--op-muted)' }}>Annual</span>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>Save 20%</span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3 max-w-[960px] mx-auto md:items-center">
        {plans.map((plan) => {
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
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ fontFamily: 'var(--font-mono)', color: pop ? 'rgba(255,255,255,0.85)' : 'var(--op-muted)' }}>{plan.name}</span>
                {pop && <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--op-indigo)' }}>Most popular</span>}
              </div>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-[family-name:var(--font-display)] text-5xl font-extrabold" style={{ color: ink }}>{main}</span>
                {sub && <span className="text-sm" style={{ color: mut }}>{sub}</span>}
              </div>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: mut }}>{plan.description}</p>
              <Link href={plan.ctaHref}
                className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-transform hover:-translate-y-0.5"
                style={pop ? { background: '#fff', color: 'var(--op-indigo)' } : { background: 'var(--op-ink)', color: '#fff' }}>
                {plan.cta} {pop && <ArrowRight className="h-4 w-4" />}
              </Link>
              <div className="my-6 h-px w-full" style={{ background: pop ? 'rgba(255,255,255,0.18)' : 'var(--op-line)' }} />
              <ul className="flex flex-1 flex-col gap-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px]" style={{ color: pop ? 'rgba(255,255,255,0.9)' : 'var(--op-ink-soft)' }}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: pop ? '#fff' : 'var(--op-approved)' }} strokeWidth={2.4} />
                    <span style={{ lineHeight: 1.5 }}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
