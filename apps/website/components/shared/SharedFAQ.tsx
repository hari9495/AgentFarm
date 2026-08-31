'use client';

/**
 * Shared FAQ — adapted from 21st.dev `moumensoliman/faq-section-shadcnui`:
 * animated accordion cards with an icon header. Operations Console palette.
 * Reused across marketing pages.
 */

import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, HelpCircle } from 'lucide-react';

export interface FAQItem { question: string; answer: string }

export default function SharedFAQ({ heading = 'Frequently asked questions', subtitle, faqs }: { heading?: string; subtitle?: string; faqs: FAQItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <div className="w-full px-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <span className="mb-4 inline-flex rounded-full p-3" style={{ background: 'var(--op-indigo-soft)' }} aria-hidden="true">
            <HelpCircle className="h-7 w-7" style={{ color: 'var(--op-indigo)' }} />
          </span>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{heading}</h2>
          {subtitle && <p className="text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{subtitle}</p>}
        </div>

        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const qId = `${baseId}-q-${index}`;
            const aId = `${baseId}-a-${index}`;
            const isOpen = open === index;
            return (
              <div key={faq.question} className="overflow-hidden rounded-2xl" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                <button type="button" onClick={() => setOpen(isOpen ? null : index)} aria-expanded={isOpen} aria-controls={aId} id={qId}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left">
                  <span className="text-[16px] font-semibold" style={{ color: 'var(--op-ink)' }}>{faq.question}</span>
                  <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }} aria-hidden="true">
                    <ChevronDown className="h-5 w-5" style={{ color: 'var(--op-indigo)' }} />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: 'easeInOut' }} role="region" id={aId} aria-labelledby={qId}>
                      <p className="px-6 pb-5 text-[15px] leading-relaxed" style={{ color: 'var(--op-muted)' }}>{faq.answer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
