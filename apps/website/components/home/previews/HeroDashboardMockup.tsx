'use client';

/**
 * PREVIEW — adaptation of 21st.dev `felipemenezes098/hero-02` (Hero with
 * Dashboard Mockup) to the Operations Console palette + AgentFarm content.
 * Serif display headline + a product panel showing the live approval-gate
 * (the signature) instead of a generic dashboard image. Isolated preview —
 * not wired into the live home page.
 */

import * as React from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { ArrowRight, Check, X, Clock, ShieldCheck, Bot } from 'lucide-react';

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};
const mediaItem: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

/* ── Product panel: the approval gate (AgentFarm signature) ──────────── */
function ApprovalGateMock() {
  return (
    <div
      className="w-full max-w-xl rounded-2xl border bg-[var(--op-paper)] p-5 sm:p-6"
      style={{ borderColor: 'var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 24px 48px -24px rgba(16,24,40,0.18)' }}
    >
      {/* window chrome */}
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#e1483d' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d98a00' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#0ea968' }} />
        <span className="ml-3 font-[family-name:var(--font-mono)] text-[11px] tracking-wide" style={{ color: 'var(--op-muted)' }}>
          agentfarm · approvals
        </span>
      </div>

      {/* pending action card */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--op-line)', background: 'var(--op-paper-2)' }}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--op-ink)' }}>Developer agent</span>
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: 'var(--op-pending-soft)', color: 'var(--op-pending)' }}>
                <Clock className="h-3 w-3" /> Awaiting approval
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-snug" style={{ color: 'var(--op-ink-soft)' }}>
              Open PR #182 — “Add rate-limit to /v1/runtime/tasks” on <span className="font-medium">agentfarm/api-gateway</span>
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: 'var(--op-approved)' }}>
            <Check className="h-3.5 w-3.5" /> Approve
          </button>
          <button className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: 'var(--op-line)', color: 'var(--op-ink-soft)' }}>
            <X className="h-3.5 w-3.5" /> Reject
          </button>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px]" style={{ color: 'var(--op-muted)' }}>
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--op-evidence)' }} /> Logged to audit
          </span>
        </div>
      </div>

      {/* recent decisions strip */}
      <div className="mt-4 space-y-2">
        {[
          { who: 'Support agent', what: 'Replied to ticket #4471', tone: 'var(--op-approved)', label: 'Approved' },
          { who: 'Sales agent', what: 'Sent proposal to Acme Corp', tone: 'var(--op-approved)', label: 'Approved' },
        ].map((r) => (
          <div key={r.what} className="flex items-center gap-2 text-[12px]">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-white" style={{ background: r.tone }}>
              <Check className="h-2.5 w-2.5" />
            </span>
            <span style={{ color: 'var(--op-ink-soft)' }}>{r.who} · {r.what}</span>
            <span className="ml-auto font-[family-name:var(--font-mono)] text-[10px]" style={{ color: 'var(--op-muted)' }}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HeroDashboardMockup() {
  const reduce = useReducedMotion();
  const animate = !reduce;

  return (
    <section className="relative w-full overflow-hidden" style={{ background: 'var(--op-paper)', color: 'var(--op-ink)' }}>
      <motion.div
        className="relative z-10 mx-auto flex max-w-6xl flex-col gap-14 px-6 py-20 sm:gap-20 sm:py-28"
        variants={animate ? container : undefined}
        initial={animate ? 'hidden' : false}
        animate={animate ? 'visible' : undefined}
      >
        <motion.div variants={animate ? item : undefined} className="flex max-w-2xl flex-col items-start gap-5">
          <span className="font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.16em]" style={{ color: 'var(--op-indigo)' }}>
            AI workforce · human in the loop
          </span>
          <h1 className="text-balance font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl" style={{ lineHeight: 1.03, color: 'var(--op-ink)' }}>
            Real work, shipped — with a human on every risky move.
          </h1>
          <p className="max-w-md text-base" style={{ color: 'var(--op-muted)' }}>
            AgentFarm runs a workforce of AI teammates across your tools. Low-risk actions run on their own; anything that matters waits for your one-tap approval — every step logged.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <a href="#" className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-colors" style={{ background: 'var(--op-indigo)' }}>
              Start free <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#" className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors" style={{ borderColor: 'var(--op-line)', color: 'var(--op-ink-soft)' }}>
              Book a demo
            </a>
          </div>
        </motion.div>

        <motion.div variants={animate ? mediaItem : undefined} className="w-full">
          <div className="relative w-full overflow-hidden rounded-2xl" style={{ outline: '1px solid rgba(16,24,40,0.08)' }}>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 60%)' }} />
            <div className="relative flex items-center justify-center px-6 py-12 sm:px-12 sm:py-16">
              <ApprovalGateMock />
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

export default HeroDashboardMockup;
