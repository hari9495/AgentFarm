'use client';

/**
 * PREVIEW — adaptation of 21st.dev `kavikatiyar/bento-product-features` to the
 * Operations Console palette + AgentFarm's 6 features. Retinted dark→light;
 * shadcn Card/Switch primitives replaced with token-driven markup.
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Check, X, Plug, Users, Rocket, Server } from 'lucide-react';

const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 14 } } };

const cardStyle: React.CSSProperties = {
  background: 'var(--op-paper)',
  border: '1px solid var(--op-line)',
  borderRadius: 16,
  boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 16px -10px rgba(16,24,40,0.10)',
};
const eyebrow = 'font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.14em]';

function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <motion.div variants={item} className={className}>
      <div className="flex h-full flex-col p-6" style={cardStyle}>{children}</div>
    </motion.div>
  );
}

export function FeaturesProductBento() {
  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper-2)', color: 'var(--op-ink)' }}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <span className={eyebrow} style={{ color: 'var(--op-indigo)' }}>What you get</span>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05 }}>
            Everything you need to run an AI workforce.
          </h2>
        </div>

        <motion.div
          variants={container} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
          className="grid w-full grid-cols-1 gap-5 md:grid-cols-3 md:grid-rows-3 auto-rows-[minmax(150px,auto)]"
        >
          {/* 1 — Approval gates (tall, signature) */}
          <Cell className="md:col-span-1 md:row-span-3">
            <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-semibold">Approval gates</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--op-muted)' }}>
              Low-risk actions run on their own. Anything that matters waits for a human — one tap to approve or reject, every time.
            </p>
            <div className="mt-auto pt-6">
              <div className="rounded-xl border p-3" style={{ borderColor: 'var(--op-line)', background: 'var(--op-paper-2)' }}>
                <p className="mb-2 text-[12px]" style={{ color: 'var(--op-ink-soft)' }}>Developer · open PR #182</p>
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-semibold text-white" style={{ background: 'var(--op-approved)' }}><Check className="h-3.5 w-3.5" /> Approve</span>
                  <span className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-semibold" style={{ borderColor: 'var(--op-line)', color: 'var(--op-ink-soft)' }}><X className="h-3.5 w-3.5" /> Reject</span>
                </div>
              </div>
            </div>
          </Cell>

          {/* 2 — Connectors */}
          <Cell className="md:col-span-1 md:row-span-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">18 connectors</h3>
                <p className="text-sm" style={{ color: 'var(--op-muted)' }}>Works across your stack</p>
              </div>
              <Plug className="h-5 w-5" style={{ color: 'var(--op-evidence)' }} />
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
              {['Jira', 'Slack', 'GitHub', 'Salesforce', 'Linear'].map((c) => (
                <span key={c} className="rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: 'var(--op-line)', color: 'var(--op-ink-soft)' }}>{c}</span>
              ))}
            </div>
          </Cell>

          {/* 3 — 13 roles (big stat) */}
          <Cell className="md:col-span-1 md:row-span-1">
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="font-[family-name:var(--font-display)] text-6xl font-extrabold" style={{ color: 'var(--op-ink)' }}>13</span>
              <span className="mt-1 text-sm" style={{ color: 'var(--op-muted)' }}>specialist roles, one platform</span>
            </div>
          </Cell>

          {/* 4 — Evidence trail (metric + badge) */}
          <Cell className="md:col-span-1 md:row-span-1">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">Evidence trail</h3>
                <p className="text-sm" style={{ color: 'var(--op-muted)' }}>Audit coverage</p>
              </div>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold" style={{ borderColor: 'var(--op-line)', color: 'var(--op-evidence)' }}>Append-only</span>
            </div>
            <div className="mt-2"><span className="text-5xl font-bold" style={{ color: 'var(--op-ink)' }}>100%</span></div>
            <div className="mt-auto flex justify-between pt-2 text-[11px]" style={{ color: 'var(--op-muted)' }}><span>Every action</span><span>Immutable</span></div>
          </Cell>

          {/* 5 — Instant deployment */}
          <Cell className="md:col-span-1 md:row-span-1">
            <div className="flex h-full flex-col justify-end">
              <Rocket className="mb-3 h-5 w-5" style={{ color: 'var(--op-indigo)' }} />
              <h3 className="text-base font-semibold">Instant deployment</h3>
              <p className="text-sm" style={{ color: 'var(--op-muted)' }}>Live in 10 minutes — no infra to manage.</p>
            </div>
          </Cell>

          {/* 6 — Azure isolation (wide) */}
          <Cell className="md:col-span-2 md:row-span-1">
            <div className="flex h-full flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}><Server className="h-5 w-5" /></span>
                <div>
                  <h3 className="text-base font-semibold">Azure isolation</h3>
                  <p className="text-sm" style={{ color: 'var(--op-muted)' }}>A dedicated, isolated VM per tenant — your data never mingles.</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium" style={{ borderColor: 'var(--op-line)', color: 'var(--op-ink-soft)' }}><Users className="h-3.5 w-3.5" /> Single-tenant</span>
            </div>
          </Cell>
        </motion.div>
      </div>
    </section>
  );
}

export default FeaturesProductBento;
