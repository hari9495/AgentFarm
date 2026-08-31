/**
 * Customers — Option B (before/after spotlight). Each case study is an
 * alternating row: narrative on one side, a results card with prominent
 * before→after stat pairs on the other. Operations Console palette.
 */

import { customersPageContent as C } from '@/lib/marketing-content';

export default function CustomerSpotlight() {
  return (
    <div className="op-wrap">
      <h2 className="mb-14 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.caseStudiesTitle}</h2>
      <div className="mx-auto flex max-w-5xl flex-col gap-16 md:gap-24">
        {C.caseStudies.map((cs, i) => {
          const flip = i % 2 === 1;
          return (
            <div key={cs.company} className="grid items-center gap-10 md:grid-cols-2 md:gap-14">
              <div className={flip ? 'md:order-2' : ''}>
                <div className="mb-4 flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: 'var(--op-indigo)' }}>{cs.initials}</span>
                  <div>
                    <p className="text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{cs.company}</p>
                    <p className="text-[12px]" style={{ color: 'var(--op-muted)' }}>{cs.tagline}</p>
                  </div>
                </div>
                <p className="text-[15px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{cs.challenge}</p>
                <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'var(--op-ink)' }}><span className="font-semibold" style={{ color: 'var(--op-indigo)' }}>With AgentFarms: </span>{cs.outcome}</p>
              </div>
              <div className={flip ? 'md:order-1' : ''}>
                <div className="rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
                  <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide" style={{ color: 'var(--op-muted)' }}>Before → after</p>
                  <div className="grid gap-3">
                    {cs.metrics.map((m) => (
                      <div key={m.label} className="rounded-xl p-4" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                        <p className="mb-2 text-[12px] font-medium" style={{ color: 'var(--op-muted)' }}>{m.label}</p>
                        <div className="flex items-baseline gap-3">
                          <span className="text-[16px]" style={{ color: 'var(--op-muted)', textDecoration: 'line-through' }}>{m.before}</span>
                          <span className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-indigo)' }}>{m.after}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
