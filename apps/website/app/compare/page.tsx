import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import CompareSwitcher from '@/components/compare/CompareSwitcher';
import CompareMatrix from '@/components/compare/CompareMatrix';
import SharedCTA from '@/components/shared/SharedCTA';
import SubPageHero from '@/components/shared/SubPageHero';

export const metadata: Metadata = {
  title: 'AgentFarms vs Alternatives — AI Workers vs Copilot',
  description: 'Compare AgentFarms against GitHub Copilot, contractors, and full-time hires. Governed AI workers execute tasks end-to-end — see the key differences.',
};

const heroPoints = ['Executes tasks autonomously', 'Risk-classified approval gates', 'Full audit trail', 'Live in minutes, not months'];

export default function ComparePage() {
  return (
    <div>
      {/* Hero — shared SubPageHero (21st.dev: felipemenezes098/hero-02) */}
      <SubPageHero
        eyebrow="Compare"
        titleLead="AgentFarms vs"
        titleAccent="the alternatives"
        description="Copilots suggest. Contractors bill by the hour. Full-time hires take months to onboard. AgentFarms workers execute with accountability from day one."
        primary={{ label: 'Start free trial', href: '/get-started' }}
        secondary={{ label: 'View pricing', href: '/pricing' }}
        visual={
          <div className="mx-auto w-full max-w-sm rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--op-ink)' }}>Why teams switch to AgentFarms</p>
            <p className="mb-4 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>vs copilots, contractors, and hires</p>
            <div className="space-y-2.5">
              {heroPoints.map((p) => (
                <div key={p} className="flex items-start gap-2.5 rounded-lg px-3 py-2" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                  <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.6} style={{ color: 'var(--op-approved)' }} />
                  <span className="text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>{p}</span>
                </div>
              ))}
            </div>
          </div>
        }
      />

      {/* Head-to-head switcher (B) */}
      <section className="op-soft" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <div className="op-wrap-narrow mb-10 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>See the head-to-head</h2>
          <p className="mt-3" style={{ color: 'var(--op-muted)' }}>Pick an alternative to compare AgentFarms against, capability by capability.</p>
        </div>
        <CompareSwitcher />
      </section>

      {/* Full matrix (A) */}
      <section className="op-light" style={{ paddingTop: 72, paddingBottom: 72 }}>
        <div className="op-wrap mb-10 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>The full comparison</h2>
          <p className="mt-3" style={{ color: 'var(--op-muted)' }}>Every capability across all four approaches, side by side.</p>
        </div>
        <CompareMatrix />
      </section>

      {/* CTA (21st.dev: shadcnblocks/cta11) */}
      <section className="op-soft" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <SharedCTA
          badge="14-day free trial · no card required"
          heading="Ready to see the difference?"
          description="Start with one workflow, see real output within hours."
          primary={{ label: 'Start free trial', href: '/get-started' }}
          secondary={{ label: 'View pricing', href: '/pricing' }}
        />
      </section>
    </div>
  );
}
