import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { cases, roi } from '@/components/use-cases/cases-data';
import CaseScorecard from '@/components/use-cases/CaseScorecard';
import UseCasesTabs from '@/components/use-cases/UseCasesTabs';
import SharedCTA from '@/components/shared/SharedCTA';
import SubPageHero from '@/components/shared/SubPageHero';

export const metadata: Metadata = {
  title: 'AI Worker Use Cases — Engineering, Support, Operations',
  description: 'Real-world examples of how engineering, support, and operations teams use AgentFarms AI workers to increase output while keeping full human oversight.',
};

export default function UseCasesPage() {
  return (
    <div>
      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow="Use cases"
        titleLead="Built for"
        titleAccent="every department"
        description="From engineering to HR, operations, and sales — see how AgentFarms workers take on repeatable work across every function, with a human on every risky move."
        primary={{ label: 'Start free trial', href: '/get-started' }}
        secondary={{ label: 'Browse agent roles', href: '/marketplace' }}
        visual={<CaseScorecard c={cases[0]} />}
      />

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
