'use client';

/**
 * PREVIEW — clean CTA: a centered light closing section with badge, headline
 * (blue accent), dual buttons, trust items and live-metric dots. Operations
 * Console palette; reads homeMarketingContent.cta. (21st.dev family: felipe/cta-01.)
 */

import * as React from 'react';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { homeMarketingContent } from '@/lib/marketing-content';

export function CTAClean() {
  const { cta } = homeMarketingContent;
  return (
    <section className="w-full px-6 py-20 sm:py-28 text-center" style={{ background: 'var(--op-paper-2)', color: 'var(--op-ink)' }} aria-label="Get started">
      <div className="mx-auto max-w-2xl">
        <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>
          {cta.badge}
        </span>
        <h2 className="mx-auto mt-5 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ lineHeight: 1.04, color: 'var(--op-ink)' }}>
          {cta.titleLead}{' '}
          <span style={{ color: 'var(--op-indigo)' }}>{cta.titleAccent}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg" style={{ color: 'var(--op-muted)' }}>{cta.description}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/get-started" className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>
            Start free trial <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/book-demo" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>
            Book a demo
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {cta.trustItems.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--op-indigo)' }} /> {t}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-2xl px-6 py-4" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
          {cta.liveMetrics.map((m) => (
            <span key={m.label} className="inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} /> {m.label}
            </span>
          ))}
        </div>
        {cta.footnote && <p className="mt-6 text-[12px]" style={{ color: 'var(--op-muted)' }}>{cta.footnote}</p>}
      </div>
    </section>
  );
}

export default CTAClean;
