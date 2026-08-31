'use client';

/**
 * Pricing comparison — Option B. Adapted from 21st.dev `kokonutd/pricing-table`:
 * clickable plan columns (selecting highlights a column), monthly/annual toggle,
 * and a ✓/– inclusion matrix. Operations Console palette; no NumberFlow dep.
 */

import * as React from 'react';
import { Check } from 'lucide-react';

type Level = 'starter' | 'pro' | 'all';
const PLANS: { name: string; level: Level; monthly: number | null; popular?: boolean }[] = [
  { name: 'Starter', level: 'starter', monthly: 299 },
  { name: 'Pro', level: 'pro', monthly: 599, popular: true },
  { name: 'Enterprise', level: 'all', monthly: null },
];
const order: Record<Level, number> = { starter: 0, pro: 1, all: 2 };
const FEATURES: { name: string; from: Level }[] = [
  { name: 'Approval routing', from: 'starter' },
  { name: 'Full evidence trail', from: 'starter' },
  { name: 'Core integrations', from: 'starter' },
  { name: 'Baseline analytics', from: 'starter' },
  { name: 'Email support', from: 'starter' },
  { name: 'Expanded integrations', from: 'pro' },
  { name: 'Custom approval workflows', from: 'pro' },
  { name: 'Team analytics & rollout', from: 'pro' },
  { name: 'Priority support', from: 'pro' },
  { name: 'SSO / SAML', from: 'all' },
  { name: 'Tenant-isolated runtime', from: 'all' },
  { name: 'Custom connectors & policy packs', from: 'all' },
  { name: 'Advanced analytics & exports', from: 'all' },
  { name: 'Dedicated support + SLA', from: 'all' },
];

export default function PricingComparisonInteractive() {
  const [annual, setAnnual] = React.useState(false);
  const [selected, setSelected] = React.useState<Level>('pro');

  const priceText = (monthly: number | null) => {
    if (monthly === null) return 'Custom';
    const v = annual ? Math.round(monthly * 0.8) : monthly;
    return `$${v}`;
  };

  return (
    <div className="op-wrap">
      <h2 className="mb-8 text-center op-h2" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', letterSpacing: '-0.025em' }}>Compare every plan</h2>

      <div className="mx-auto max-w-3xl">
        {/* interval toggle */}
        <div className="mb-5 flex justify-end">
          <div className="inline-flex items-center gap-1 rounded-lg p-1 text-sm" style={{ background: 'var(--op-paper-3)', border: '1px solid var(--op-line)' }}>
            {[['Monthly', false], ['Yearly', true]].map(([l, v]) => (
              <button key={String(l)} type="button" onClick={() => setAnnual(v as boolean)} className="rounded-md px-3 py-1 transition-colors"
                style={annual === v ? { background: 'var(--op-paper)', color: 'var(--op-ink)', boxShadow: '0 1px 2px rgba(16,24,40,0.08)' } : { color: 'var(--op-muted)' }}>{l}</button>
            ))}
          </div>
        </div>

        {/* plan selector */}
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => {
            const on = selected === p.level;
            return (
              <button key={p.level} type="button" onClick={() => setSelected(p.level)} className="rounded-xl p-4 text-left transition-all"
                style={{ background: 'var(--op-paper)', border: on ? '1px solid var(--op-indigo)' : '1px solid var(--op-line)', boxShadow: on ? '0 0 0 3px var(--op-indigo-soft)' : 'none' }}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: 'var(--op-ink)' }}>{p.name}</span>
                  {p.popular && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>Popular</span>}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-ink)' }}>{priceText(p.monthly)}</span>
                  {p.monthly !== null && <span className="text-sm" style={{ color: 'var(--op-muted)' }}>/{annual ? 'mo' : 'month'}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* matrix */}
        <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--op-line)' }}>
          <div className="overflow-x-auto">
            <div className="min-w-[560px] divide-y" style={{ borderColor: 'var(--op-line)' }}>
              <div className="flex items-center p-4" style={{ background: 'var(--op-paper-2)' }}>
                <div className="flex-1 text-sm font-semibold" style={{ color: 'var(--op-ink)' }}>Features</div>
                <div className="flex items-center gap-8 text-sm">
                  {PLANS.map((p) => (
                    <div key={p.level} className="w-16 text-center font-medium" style={{ color: selected === p.level ? 'var(--op-indigo)' : 'var(--op-ink)' }}>{p.name}</div>
                  ))}
                </div>
              </div>
              {FEATURES.map((f) => (
                <div key={f.name} className="flex items-center p-4" style={{ borderTop: '1px solid var(--op-line)' }}>
                  <div className="flex-1 text-sm" style={{ color: 'var(--op-ink-soft)' }}>{f.name}</div>
                  <div className="flex items-center gap-8 text-sm">
                    {PLANS.map((p) => {
                      const inc = order[p.level] >= order[f.from];
                      const sel = selected === p.level;
                      return (
                        <div key={p.level} className="flex w-16 justify-center rounded-md py-1" style={sel ? { background: 'var(--op-indigo-soft)' } : {}}>
                          {inc ? <Check className="h-5 w-5" style={{ color: 'var(--op-indigo)' }} strokeWidth={2.4} /> : <span style={{ color: 'var(--op-line-strong, #aeb6b4)' }}>–</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
