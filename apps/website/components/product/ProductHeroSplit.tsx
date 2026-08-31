/**
 * Product hero — routed through the shared SubPageHero (21st.dev
 * felipemenezes098/hero-02). Visual = the approval-gate product panel.
 */

import { Check, X, Clock, Bot } from 'lucide-react';
import { productPageContent as C } from '@/lib/marketing-content';
import SubPageHero from '@/components/shared/SubPageHero';

function ApprovalPanel() {
  return (
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
  );
}

export default function ProductHeroSplit() {
  return (
    <SubPageHero
      eyebrow={C.hero.badge}
      titleLead={C.hero.titleLead}
      titleAccent={C.hero.titleAccent}
      description={C.hero.description}
      primary={{ label: C.hero.primaryCta.label, href: C.hero.primaryCta.href }}
      secondary={{ label: C.hero.secondaryCta.label, href: C.hero.secondaryCta.href }}
      visual={<ApprovalPanel />}
    />
  );
}
