/**
 * Product hero — Option A (split). Copy on the left, the approval-gate product
 * panel on the right. Adapted from the 21st.dev `felipemenezes098/hero-02`
 * split pattern to the Operations Console palette + productPageContent.
 */

import { ArrowRight, Check, X, Clock, Bot } from 'lucide-react';
import Link from 'next/link';
import { productPageContent as C } from '@/lib/marketing-content';

export default function ProductHeroSplit() {
  return (
    <section className="op-light relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 15% 0%, var(--op-indigo-soft), transparent 60%)' }} />
      <div className="op-wrap relative grid items-center gap-12 md:grid-cols-2" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div>
          <p className="op-eyebrow">{C.hero.badge}</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] font-extrabold" style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)', letterSpacing: '-0.03em', lineHeight: 1.04, color: 'var(--op-ink)' }}>
            {C.hero.titleLead} <span style={{ color: 'var(--op-indigo)' }}>{C.hero.titleAccent}</span>
          </h1>
          <p className="mt-5 max-w-lg text-[1.075rem] leading-relaxed" style={{ color: 'var(--op-muted)' }}>{C.hero.description}</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {C.outcomes.slice(0, 3).map((o) => (
              <li key={o} className="flex items-start gap-2.5 text-[14px]" style={{ color: 'var(--op-ink-soft)' }}>
                <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} style={{ color: 'var(--op-approved)' }} /> <span>{o}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={C.hero.primaryCta.href} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{C.hero.primaryCta.label} <ArrowRight className="h-4 w-4" /></Link>
            <Link href={C.hero.secondaryCta.href} className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>{C.hero.secondaryCta.label}</Link>
          </div>
        </div>

        {/* Right — approval-gate product panel */}
        <div className="relative w-full overflow-hidden rounded-2xl p-6 sm:p-8" style={{ background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 65%)', outline: '1px solid rgba(16,24,40,0.06)' }}>
          <div className="mx-auto w-full max-w-md rounded-2xl p-5" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 48px -24px rgba(16,24,40,0.22)' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#e1483d' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d98a00' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#0ea968' }} />
              <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>agentfarm · approvals</span>
            </div>
            <div className="rounded-xl border p-4" style={{ borderColor: 'var(--op-line)', background: 'var(--op-paper-2)' }}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}><Bot className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: 'var(--op-ink)' }}>Developer agent</span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--op-pending-soft)', color: 'var(--op-pending)' }}><Clock className="h-3 w-3" /> Awaiting approval</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--op-ink-soft)' }}>Open PR #182 — “Add rate-limit to /v1/runtime/tasks”</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: 'var(--op-approved)' }}><Check className="h-3.5 w-3.5" /> Approve</span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: 'var(--op-line)', color: 'var(--op-ink-soft)' }}><X className="h-3.5 w-3.5" /> Reject</span>
              </div>
            </div>
            <p className="mt-4 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>Every action logged to the audit trail.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
