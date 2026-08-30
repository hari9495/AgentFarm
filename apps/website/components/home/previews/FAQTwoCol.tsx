'use client';

/**
 * PREVIEW — two-column FAQ: centered heading, question cards split across two
 * columns, each answer expands in place. Operations Console palette; reads the
 * real homeMarketingContent.faq. (21st.dev family: ruixen.ui/faqsection.)
 */

import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { homeMarketingContent } from '@/lib/marketing-content';

type QA = { question: string; answer: string };

function Item({ item, isOpen, onToggle }: { item: QA; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl px-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: isOpen ? '0 8px 24px -16px rgba(16,24,40,0.18)' : 'none' }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 py-5 text-left" aria-expanded={isOpen}>
        <span className="text-[15px] font-medium" style={{ color: 'var(--op-ink)' }}>{item.question}</span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform" style={{ color: 'var(--op-indigo)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} style={{ overflow: 'hidden' }}>
            <p className="pb-5 text-[14px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{item.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQTwoCol() {
  const { faq } = homeMarketingContent;
  const [open, setOpen] = React.useState<number | null>(0);
  const cols: { item: QA; idx: number }[][] = [[], []];
  faq.items.forEach((item, idx) => cols[idx % 2].push({ item, idx }));

  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper)', color: 'var(--op-ink)' }} aria-label="FAQ">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-14 max-w-xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--op-indigo)' }}>{faq.eyebrow}</p>
          <h2 className="mt-3 text-balance font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl">{faq.title}</h2>
          <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{faq.description}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {cols.map((col, c) => (
            <div key={c} className="flex flex-col gap-4">
              {col.map(({ item, idx }) => (
                <Item key={item.question} item={item} isOpen={open === idx} onToggle={() => setOpen(open === idx ? null : idx)} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default FAQTwoCol;
