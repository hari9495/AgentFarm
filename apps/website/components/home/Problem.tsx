'use client';

/**
 * The problem — rebuilt from 21st.dev `uilayout.contact/stats-bento`: a mixed-size
 * bento of pain-point stats (one large primary card + three smaller ones). Adapted
 * to the Operations Console light palette (the pull's solid-primary slab is swapped
 * for a light card per the no-saturated-panels rule); keeps AnimatedNumber + each
 * item's accent color.
 */

import { motion } from 'motion/react';
import { homeMarketingContent } from '@/lib/marketing-content';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

export default function Problem() {
  const { problem } = homeMarketingContent;
  const [primary, ...rest] = problem.items;

  return (
    <section aria-label="The problem" className="op-soft" style={{ paddingTop: 96, paddingBottom: 96 }}>
      <div className="op-wrap">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mb-12 text-center">
          <p className="mb-4 font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.16em]" style={{ color: 'var(--op-pending)' }}>{problem.eyebrow}</p>
          <h2 className="mx-auto max-w-3xl font-[family-name:var(--font-display)] font-extrabold" style={{ fontSize: 'clamp(2.1rem, 4.2vw, 3.2rem)', letterSpacing: '-0.03em', lineHeight: 1.04, color: 'var(--op-ink)' }}>{problem.title}</h2>
          <p className="mx-auto mt-4 max-w-xl text-[17px]" style={{ lineHeight: 1.47, color: 'var(--op-muted)' }}>{problem.description}</p>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 md:grid-rows-2">
          {/* Primary — large */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex flex-col justify-between overflow-hidden rounded-3xl p-10 md:col-span-3 md:row-span-2" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -34px rgba(16,24,40,0.18)' }}>
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.5]" style={{ background: 'repeating-linear-gradient(45deg, var(--op-line) 0px 1px, transparent 1px 12px)', maskImage: 'radial-gradient(ellipse 80% 55% at 100% 0%, #000 60%, transparent 110%)', WebkitMaskImage: 'radial-gradient(ellipse 80% 55% at 100% 0%, #000 60%, transparent 110%)' }} />
            <div className="relative">
              <span className="mb-6 inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={{ background: `color-mix(in srgb, ${primary.accentColor} 16%, transparent)`, color: primary.accentColor }}>{primary.statLabel}</span>
              <p className="font-[family-name:var(--font-display)] text-6xl font-extrabold leading-none tracking-tighter">
                <AnimatedNumber value={primary.stat} style={{ background: 'linear-gradient(120deg, var(--op-ink) 40%, var(--op-indigo))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', display: 'inline-block' }} />
              </p>
            </div>
            <div className="relative mt-8">
              <p className="text-[17px] font-semibold" style={{ color: 'var(--op-ink)' }}>{primary.title}</p>
              <p className="mt-1.5 max-w-sm text-sm" style={{ lineHeight: 1.55, color: 'var(--op-muted)' }}>{primary.description}</p>
            </div>
          </motion.div>

          {/* Rest — smaller cards */}
          {rest.map((item, i) => (
            <motion.div key={item.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.5, delay: 0.08 * (i + 1), ease: [0.22, 1, 0.36, 1] }}
              className={`op-lift flex flex-col justify-between rounded-3xl p-7 ${i === 0 ? 'md:col-span-3' : i === 1 ? 'md:col-span-1' : 'md:col-span-2'}`} style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
              <div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--op-muted)' }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-[2px]" style={{ background: item.accentColor }} />{item.statLabel}
                </span>
                <p className="mt-2 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight" style={{ color: 'var(--op-ink)' }}><AnimatedNumber value={item.stat} /></p>
              </div>
              <div className="mt-4">
                <p className="text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{item.title}</p>
                <p className="mt-1 text-[13px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{item.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
