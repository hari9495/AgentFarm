/**
 * Customers — Option A. Adapted from 21st.dev `shadcnblocks/casestudy-5`
 * (featured case study + grid). Retinted to Operations Console; the image slot
 * is replaced by a before→after metrics panel. Content: customersPageContent.caseStudies.
 */

import { MoveRight } from 'lucide-react';
import Link from 'next/link';
import { customersPageContent as C } from '@/lib/marketing-content';

type CS = (typeof C.caseStudies)[number];

function Metrics({ cs, dense }: { cs: CS; dense?: boolean }) {
  return (
    <div className="grid gap-2">
      {cs.metrics.slice(0, dense ? 2 : 4).map((m) => (
        <div key={m.label} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
          <span className="text-[12px]" style={{ color: 'var(--op-ink-soft)' }}>{m.label}</span>
          <span className="flex items-center gap-1.5 text-[12px]"><span style={{ color: 'var(--op-muted)', textDecoration: 'line-through' }}>{m.before}</span><span className="font-bold" style={{ color: 'var(--op-indigo)' }}>→ {m.after}</span></span>
        </div>
      ))}
    </div>
  );
}

function Head({ cs }: { cs: CS }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-bold text-white" style={{ background: 'var(--op-indigo)' }}>{cs.initials}</span>
        <span className="text-xl font-semibold" style={{ color: 'var(--op-ink)' }}>{cs.company}</span>
      </div>
      <div className="mt-4">
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-wide" style={{ color: 'var(--op-muted)' }}>{cs.tagline}</span>
        <h3 className="mt-3 mb-4 text-xl font-semibold sm:text-2xl" style={{ letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--op-ink)' }}>{cs.outcome}</h3>
        <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--op-indigo)' }}>Explore the roles <MoveRight className="h-4 w-4" /></Link>
      </div>
    </>
  );
}

export default function CustomerCasesBento() {
  const featured = C.caseStudies[0];
  const rest = C.caseStudies.slice(1);
  return (
    <div className="op-wrap">
      <h2 className="mb-10 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.caseStudiesTitle}</h2>
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)' }}>
        {/* featured */}
        <div className="grid gap-8 p-8 lg:grid-cols-2" style={{ background: 'var(--op-paper)' }}>
          <div className="flex flex-col justify-between"><Head cs={featured} /></div>
          <div className="flex items-center"><div className="w-full rounded-xl p-4" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}><p className="mb-3 font-[family-name:var(--font-mono)] text-[11px] uppercase" style={{ color: 'var(--op-muted)' }}>Before → after</p><Metrics cs={featured} /></div></div>
        </div>
        {/* grid */}
        <div className="grid lg:grid-cols-2" style={{ borderTop: '1px solid var(--op-line)' }}>
          {rest.map((cs, idx) => (
            <div key={cs.company} className="p-8" style={{ background: 'var(--op-paper)', borderTop: idx > 1 ? '1px solid var(--op-line)' : 'none', borderLeft: idx % 2 === 1 ? '1px solid var(--op-line)' : 'none' }}>
              <Head cs={cs} />
              <div className="mt-5"><Metrics cs={cs} dense /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
