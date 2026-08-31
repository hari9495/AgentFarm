'use client';

/**
 * The solution — rebuilt from 21st.dev `ravikatiyar162/feature-spotlight`: a
 * bordered split section with a preheader + heading + description + CTA on the
 * left and a product visual on the right. Adapted to the Operations Console
 * palette; benefits checklist added; the right visual is the live-operations
 * event feed (converted from the old hex to op tokens).
 */

import { motion } from 'motion/react';
import { ArrowRight, CheckCircle2, GitPullRequest, ShieldCheck, Clock } from 'lucide-react';
import Link from 'next/link';
import { homeMarketingContent } from '@/lib/marketing-content';

const eventIcons = [GitPullRequest, ShieldCheck, Clock];

export default function Solution() {
  const { solution } = homeMarketingContent;

  return (
    <section className="op-section op-light" aria-label="The solution">
      <div className="op-wrap">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-2xl p-8 md:p-12" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -34px rgba(16,24,40,0.16)' }}>
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
            {/* Left — copy */}
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
              <p className="op-eyebrow mb-4">{solution.eyebrow}</p>
              <h2 className="font-[family-name:var(--font-display)] font-extrabold tracking-tight" style={{ fontSize: 'clamp(1.9rem, 3.5vw, 2.8rem)', letterSpacing: '-0.028em', lineHeight: 1.07, color: 'var(--op-ink)' }}>{solution.title}</h2>
              <p className="mt-4 text-[17px]" style={{ lineHeight: 1.47, color: 'var(--op-ink-soft)' }}>{solution.description}</p>
              <ul className="mt-6 space-y-3">
                {solution.benefits.map((b) => (
                  <li key={b} className="flex items-start gap-2.5 text-[15px]" style={{ color: 'var(--op-ink-soft)' }}>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--op-indigo)' }} />
                    <span style={{ lineHeight: 1.5 }}>{b}</span>
                  </li>
                ))}
              </ul>
              <Link href={solution.link.href} className="mt-8 inline-flex items-center gap-1.5 text-[17px] transition-colors" style={{ color: 'var(--op-indigo)' }}>
                {solution.link.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>

            {/* Right — live event feed */}
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}>
              <div className="overflow-hidden rounded-[18px]" style={{ border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -20px rgba(16,24,40,0.16)' }}>
                <div className="flex items-center justify-between px-5 py-3.5" style={{ background: 'var(--op-paper-2)', borderBottom: '1px solid var(--op-line)' }}>
                  <span className="text-[12px] font-semibold" style={{ color: 'var(--op-ink)' }}>Live operations</span>
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: 'var(--op-approved)' }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--op-approved)' }} />
                    {solution.liveStatusLabel}
                  </span>
                </div>
                <div className="space-y-2.5 p-4" style={{ background: 'var(--op-paper)' }}>
                  {solution.events.map((event, i) => {
                    const Icon = eventIcons[i] ?? Clock;
                    const isHigh = event.risk === 'high';
                    return (
                      <div key={event.label} className="rounded-[11px] p-3.5" style={{ border: isHigh ? '1px solid var(--op-pending-soft, #fdeecd)' : '1px solid var(--op-line)', background: isHigh ? 'color-mix(in srgb, var(--op-pending-soft, #fdeecd) 40%, transparent)' : 'var(--op-paper-2)' }}>
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: event.accentColor }}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold" style={{ letterSpacing: '-0.01em', color: 'var(--op-ink)' }}>{event.label}</p>
                            <p className="mt-0.5 text-[11px]" style={{ color: 'var(--op-muted)' }}>{event.detail}</p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]" style={{ background: isHigh ? 'var(--op-pending-soft, #fdeecd)' : 'var(--op-approved-soft, #e7f6ee)', color: isHigh ? 'var(--op-pending)' : 'var(--op-approved)' }}>{event.risk}</span>
                            <span className="text-[11px]" style={{ color: 'var(--op-muted)' }}>{event.time}</span>
                          </div>
                        </div>
                        {isHigh && (
                          <div className="mt-3 flex gap-2">
                            <button className="flex-1 rounded-full py-1.5 text-[12px] font-medium text-white transition-colors" style={{ background: 'var(--op-indigo)' }}>Approve</button>
                            <button className="flex-1 rounded-full py-1.5 text-[12px] font-medium transition-colors" style={{ border: '1px solid var(--op-line)', color: 'var(--op-muted)' }}>Review diff</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
