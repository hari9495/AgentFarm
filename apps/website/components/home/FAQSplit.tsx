'use client';

/**
 * Home FAQ — split editorial layout: sticky heading + description + a
 * "Book a demo" card on the left, an animated accordion on the right.
 * Operations Console palette; reads the real homeMarketingContent.faq.
 */

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Minus } from 'lucide-react';
import { homeMarketingContent } from '@/lib/marketing-content';

export default function FAQSplit() {
  const { faq } = homeMarketingContent;
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper)', color: 'var(--op-ink)' }} aria-label="FAQ">
      <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        {/* Left — heading */}
        <div className="md:sticky md:top-24 md:self-start">
          <p className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--op-indigo)' }}>{faq.eyebrow}</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05 }}>{faq.title}</h2>
          <p className="mt-4 max-w-sm" style={{ color: 'var(--op-muted)' }}>{faq.description}</p>
          <div className="mt-6 rounded-2xl p-5" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
            <p className="text-sm font-semibold" style={{ color: 'var(--op-ink)' }}>Still have questions?</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--op-muted)' }}>Talk to our team and we’ll walk you through it.</p>
            <Link href="/book-demo" className="mt-3 inline-flex text-sm font-semibold" style={{ color: 'var(--op-indigo)' }}>Book a demo →</Link>
          </div>
        </div>

        {/* Right — accordion */}
        <div className="flex flex-col">
          {faq.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.question} style={{ borderTop: '1px solid var(--op-line)', borderBottom: i === faq.items.length - 1 ? '1px solid var(--op-line)' : 'none' }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left" aria-expanded={isOpen}>
                  <span className="text-base font-medium" style={{ color: 'var(--op-ink)' }}>{item.question}</span>
                  <span className="shrink-0" style={{ color: 'var(--op-indigo)' }}>{isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
                      <p className="pb-5 pr-8 text-[15px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{item.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
