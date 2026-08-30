'use client';

/**
 * PREVIEW — bold CTA: a solid-blue closing panel with badge, headline, dual
 * buttons and trust items. Operations Console palette; reads homeMarketingContent.cta.
 * (21st.dev family: shadcnstore/cta-section-3.)
 */

import * as React from 'react';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { homeMarketingContent } from '@/lib/marketing-content';

export function CTABold() {
  const { cta } = homeMarketingContent;
  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper)' }} aria-label="Get started">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl px-8 py-14 text-center sm:px-14 sm:py-20"
        style={{ background: 'var(--op-indigo)', boxShadow: '0 30px 60px -24px rgba(37,99,235,0.55)' }}>
        <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>
          {cta.badge}
        </span>
        <h2 className="mx-auto mt-5 max-w-2xl font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-white sm:text-5xl" style={{ lineHeight: 1.04 }}>
          {cta.titleLead}{' '}
          <span style={{ textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.45)', textUnderlineOffset: '6px' }}>{cta.titleAccent}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg" style={{ color: 'rgba(255,255,255,0.82)' }}>{cta.description}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/get-started" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold" style={{ color: 'var(--op-indigo)' }}>
            Start free trial <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/book-demo" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-white" style={{ border: '1px solid rgba(255,255,255,0.5)' }}>
            Book a demo
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {cta.trustItems.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'rgba(255,255,255,0.9)' }}>
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} /> {t}
            </span>
          ))}
        </div>
        {cta.footnote && <p className="mt-6 text-[12px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{cta.footnote}</p>}
      </div>
    </section>
  );
}

export default CTABold;
