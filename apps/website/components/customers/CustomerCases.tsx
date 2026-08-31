/**
 * Customers — Option A (case-study cards grid). Each card: company, tagline,
 * challenge, outcome, and before→after metric rows. Operations Console palette.
 */

import { ArrowRight } from 'lucide-react';
import { customersPageContent as C } from '@/lib/marketing-content';

export default function CustomerCases() {
  return (
    <div className="op-wrap">
      <h2 className="mb-12 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.caseStudiesTitle}</h2>
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
        {C.caseStudies.map((cs) => (
          <div key={cs.company} className="op-lift flex flex-col rounded-2xl p-7" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
            <div className="mb-5 flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'var(--op-indigo)' }}>{cs.initials}</span>
              <div>
                <p className="text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{cs.company}</p>
                <p className="text-[12px]" style={{ color: 'var(--op-muted)' }}>{cs.tagline}</p>
              </div>
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--op-muted)' }}>Challenge</p>
            <p className="mt-1 text-[14px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{cs.challenge}</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--op-indigo)' }}>Outcome</p>
            <p className="mt-1 text-[14px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{cs.outcome}</p>
            <div className="mt-6 space-y-2">
              {cs.metrics.map((m) => (
                <div key={m.label} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                  <span className="text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>{m.label}</span>
                  <span className="flex items-center gap-2 text-[13px]">
                    <span style={{ color: 'var(--op-muted)', textDecoration: 'line-through' }}>{m.before}</span>
                    <ArrowRight className="h-3.5 w-3.5" style={{ color: 'var(--op-muted)' }} />
                    <span className="font-bold" style={{ color: 'var(--op-indigo)' }}>{m.after}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
