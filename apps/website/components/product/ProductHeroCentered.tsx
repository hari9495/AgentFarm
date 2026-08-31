/**
 * Product hero — Option B (centered). Adapted from 21st.dev
 * `uniquesonu/hero-section...dual-ctas` — badge, bold centered headline, subtext,
 * dual CTAs, trust line. Retinted to Operations Console + productPageContent.
 */

import { ArrowRight, Zap, Check } from 'lucide-react';
import Link from 'next/link';
import { productPageContent as C } from '@/lib/marketing-content';

export default function ProductHeroCentered() {
  return (
    <section className="op-light relative overflow-hidden" aria-label="Product hero">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(55% 45% at 50% 0%, var(--op-indigo-soft), transparent 65%)' }} />
      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-6 text-center" style={{ paddingTop: 96, paddingBottom: 72 }}>
        <div className="mb-6 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--op-line)', background: 'var(--op-paper)', color: 'var(--op-muted)' }}>
          <Zap className="mr-1.5 h-3 w-3" style={{ color: 'var(--op-indigo)' }} aria-hidden="true" /> {C.hero.badge}
        </div>
        <h1 className="font-[family-name:var(--font-display)] font-extrabold tracking-tight" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.9rem)', letterSpacing: '-0.03em', lineHeight: 1.03, color: 'var(--op-ink)' }}>
          {C.hero.titleLead} <span style={{ color: 'var(--op-indigo)' }}>{C.hero.titleAccent}</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg" style={{ color: 'var(--op-muted)' }}>{C.hero.description}</p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link href={C.hero.primaryCta.href} className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-base font-semibold text-white shadow-md" style={{ background: 'var(--op-indigo)' }}>{C.hero.primaryCta.label} <ArrowRight className="h-4 w-4" /></Link>
          <Link href={C.hero.secondaryCta.href} className="inline-flex h-11 items-center rounded-xl px-6 text-base font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>{C.hero.secondaryCta.label}</Link>
        </div>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {C.outcomes.slice(0, 3).map((o) => (
            <span key={o} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--op-approved)' }} /> {o}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
