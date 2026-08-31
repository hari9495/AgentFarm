import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cases, roi } from '@/components/use-cases/cases-data';
import CaseScorecard from '@/components/use-cases/CaseScorecard';
import UseCasesTabs from '@/components/use-cases/UseCasesTabs';
import SharedCTA from '@/components/shared/SharedCTA';

export const metadata: Metadata = {
  title: 'AI Worker Use Cases — Engineering, Support, Operations',
  description: 'Real-world examples of how engineering, support, and operations teams use AgentFarms AI workers to increase output while keeping full human oversight.',
};

export default function UseCasesPage() {
  return (
    <div>
      {/* Hero — standard sub-page split */}
      <section className="op-light relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 15% 0%, var(--op-indigo-soft), transparent 60%)' }} />
        <div className="op-wrap relative grid items-center gap-12 md:grid-cols-2" style={{ paddingTop: 80, paddingBottom: 72 }}>
          <div>
            <p className="op-eyebrow">Use cases</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] font-extrabold" style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)', letterSpacing: '-0.03em', lineHeight: 1.04, color: 'var(--op-ink)' }}>
              Built for <span style={{ color: 'var(--op-indigo)' }}>every department</span> in your company
            </h1>
            <p className="mt-5 max-w-lg text-[1.075rem] leading-relaxed" style={{ color: 'var(--op-muted)' }}>
              From engineering to HR, operations, and sales — see how AgentFarms workers take on repeatable work across every function, with a human on every risky move.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/get-started" className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Start free trial <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/marketplace" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>Browse agent roles</Link>
            </div>
          </div>
          <div className="flex items-center justify-center rounded-2xl p-8" style={{ background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 65%)', outline: '1px solid rgba(16,24,40,0.06)' }}>
            <CaseScorecard c={cases[0]} />
          </div>
        </div>
      </section>

      {/* Case studies — tabbed explorer (Option B) */}
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <UseCasesTabs />
      </section>

      {/* ROI estimate */}
      <section className="op-light" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="op-wrap">
          <div className="mb-12 text-center">
            <p className="op-eyebrow">ROI estimate</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>How much could your team save?</h2>
            <p className="mt-3 mx-auto max-w-md text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>Based on median outcomes across customers. Actual results vary by role and workflow.</p>
          </div>
          <div className="mx-auto grid max-w-[820px] gap-4 sm:grid-cols-3">
            {roi.map((r) => (
              <div key={r.tier} className="op-lift rounded-2xl p-6 text-center" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                <p className="mb-3 text-[13px] font-semibold" style={{ color: 'var(--op-muted)' }}>{r.tier}</p>
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-ink)' }}><AnimatedNumber value={r.hours} /></p>
                <p className="mt-1 text-[14px] font-semibold" style={{ color: 'var(--op-indigo)' }}>{r.cost} saved</p>
                <p className="mt-2 text-[12px]" style={{ color: 'var(--op-muted)' }}>{r.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[12px]" style={{ color: 'var(--op-muted)' }}>Estimate based on $80/hr blended labor cost across all role types and median AgentFarms automation rates.</p>
        </div>
      </section>

      {/* CTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="14-day free trial · no card required"
          heading="Which departments would you staff first?"
          description="Start with the workflow that hurts most and expand once the output proves itself."
          primary={{ label: 'Start free trial', href: '/get-started' }}
          secondary={{ label: 'Browse agent roles', href: '/marketplace' }}
          trustItems={['Policy-aware approvals', 'Tenant-isolated runtime', 'Full evidence trail']}
        />
      </section>
    </div>
  );
}
