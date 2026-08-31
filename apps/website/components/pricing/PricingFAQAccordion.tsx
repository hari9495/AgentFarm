'use client';

/**
 * Pricing-page FAQ — centered animated accordion over pricingPageContent.faqs.
 * Operations Console palette.
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, Minus } from 'lucide-react';
import { pricingPageContent } from '@/lib/marketing-content';

export default function PricingFAQAccordion() {
  const faqs = pricingPageContent.faqs;
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <div className="op-wrap-narrow">
      <h2 className="mb-10 text-center op-h2" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', letterSpacing: '-0.025em' }}>Frequently asked questions</h2>
      <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
        {faqs.map(({ q, a }, i) => {
          const isOpen = open === i;
          return (
            <div key={q} style={{ borderBottom: i < faqs.length - 1 ? '1px solid var(--op-line)' : 'none' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-[var(--op-paper-2)]">
                <span className="text-[15px] font-semibold" style={{ color: 'var(--op-ink)', letterSpacing: '-0.015em' }}>{q}</span>
                <span className="shrink-0" style={{ color: 'var(--op-indigo)' }}>{isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
                    <p className="px-6 pb-5 text-[14px]" style={{ lineHeight: 1.6, color: 'var(--op-muted)' }}>{a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
