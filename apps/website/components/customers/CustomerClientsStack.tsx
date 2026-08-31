'use client';

/**
 * Customers — Option B. Adapted from 21st.dev `ravikatiyar162/testimonial-card`
 * (ClientsSection): sticky stats + heading on the left, case studies as a
 * sticky-stacking card column on the right. Operations Console palette;
 * content is customersPageContent (stats + caseStudies).
 */

import Link from 'next/link';
import { customersPageContent as C } from '@/lib/marketing-content';

export default function CustomerClientsStack() {
  const stackHeight = `calc(100vh + ${C.caseStudies.length * 120}px)`;
  return (
    <div className="op-wrap grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-20">
      {/* left — sticky stats */}
      <div className="flex flex-col gap-6 lg:sticky lg:top-24">
        <div className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-sm" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--op-approved)' }} />
          <span style={{ color: 'var(--op-muted)' }}>Customer stories</span>
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.caseStudiesTitle}</h2>
        <p className="text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>Bounded, reviewable automation — measured by the outcomes teams actually care about.</p>
        <div className="mt-2 grid grid-cols-2 gap-4">
          {C.stats.map((s) => (
            <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
              <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-indigo)' }}>{s.value}</p>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Link href="/get-started" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Start free trial</Link>
          <Link href="/marketplace" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>Browse roles</Link>
        </div>
      </div>

      {/* right — stacking case cards */}
      <div className="relative flex flex-col gap-4" style={{ height: stackHeight }}>
        {C.caseStudies.map((cs, index) => (
          <div key={cs.company} className="sticky w-full" style={{ top: `${24 + index * 26}px` }}>
            <div className="rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 20px 44px -24px rgba(16,24,40,0.2)' }}>
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'var(--op-indigo)' }}>{cs.initials}</span>
                <div>
                  <p className="text-lg font-semibold" style={{ color: 'var(--op-ink)' }}>{cs.company}</p>
                  <p className="text-sm" style={{ color: 'var(--op-muted)' }}>{cs.tagline}</p>
                </div>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{cs.outcome}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {cs.metrics.map((m) => (
                  <span key={m.label} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)', color: 'var(--op-ink-soft)' }}>
                    <span style={{ color: 'var(--op-muted)', textDecoration: 'line-through' }}>{m.before}</span>
                    <span className="font-bold" style={{ color: 'var(--op-indigo)' }}>→ {m.after}</span>
                    <span style={{ color: 'var(--op-muted)' }}>{m.label}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
