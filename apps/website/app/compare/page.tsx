import type { Metadata } from 'next';
import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import CompareSwitcher from '@/components/compare/CompareSwitcher';
import CompareMatrix from '@/components/compare/CompareMatrix';

export const metadata: Metadata = {
  title: 'AgentFarms vs Alternatives — AI Workers vs Copilot',
  description: 'Compare AgentFarms against GitHub Copilot, contractors, and full-time hires. Governed AI workers execute tasks end-to-end — see the key differences.',
};

const heroPoints = ['Executes tasks autonomously', 'Risk-classified approval gates', 'Full audit trail', 'Live in minutes, not months'];

export default function ComparePage() {
  return (
    <div>
      {/* Hero — standard sub-page split */}
      <section className="op-light relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 15% 0%, var(--op-indigo-soft), transparent 60%)' }} />
        <div className="op-wrap relative grid items-center gap-12 md:grid-cols-2" style={{ paddingTop: 80, paddingBottom: 72 }}>
          <div>
            <p className="op-eyebrow">Compare</p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] font-extrabold" style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)', letterSpacing: '-0.03em', lineHeight: 1.04, color: 'var(--op-ink)' }}>
              AgentFarms vs <span style={{ color: 'var(--op-indigo)' }}>the alternatives</span>
            </h1>
            <p className="mt-5 max-w-lg text-[1.075rem] leading-relaxed" style={{ color: 'var(--op-muted)' }}>
              Copilots suggest. Contractors bill by the hour. Full-time hires take months to onboard. AgentFarms workers execute with accountability from day one.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/get-started" className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Start free trial <ArrowRight className="h-4 w-4" /></Link>
              <Link href="/pricing" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>View pricing</Link>
            </div>
          </div>
          <div className="flex items-center justify-center rounded-2xl p-8" style={{ background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 65%)', outline: '1px solid rgba(16,24,40,0.06)' }}>
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
          </div>
        </div>
      </section>

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

      {/* CTA */}
      <section className="op-soft text-center" style={{ paddingTop: 88, paddingBottom: 88 }}>
        <div className="op-wrap-narrow">
          <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>14-day free trial · no card required</span>
          <h2 className="mx-auto mt-5 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ lineHeight: 1.04, color: 'var(--op-ink)' }}>Ready to see the difference?</h2>
          <p className="mt-4 mx-auto max-w-xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>Start with one workflow, see real output within hours.</p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/get-started" className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Start free trial <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/pricing" className="inline-flex h-11 items-center rounded-xl px-6 text-[15px] font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>View pricing</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
