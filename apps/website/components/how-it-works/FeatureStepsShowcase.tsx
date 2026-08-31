'use client';

/**
 * Adapted from 21st.dev `ayushmxxn/feature-section` (Feature Steps) — an
 * interactive step list (numbered → check) synced to an auto-advancing image
 * panel with a progress ring. Retinted to Operations Console; content is
 * howItWorksPageContent.steps.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { howItWorksPageContent as C } from '@/lib/marketing-content';

const AUTOPLAY = 3500;

export default function FeatureStepsShowcase() {
  const steps = C.steps;
  const [current, setCurrent] = React.useState(0);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        if (p < 100) return p + 100 / (AUTOPLAY / 100);
        setCurrent((c) => (c + 1) % steps.length);
        return 0;
      });
    }, 100);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="op-wrap">
      <h2 className="mb-10 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>
        How a worker gets to work
      </h2>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="order-2 space-y-6 md:order-1">
          {steps.map((step, i) => {
            const active = i === current;
            return (
              <motion.button key={step.number} type="button" onClick={() => { setCurrent(i); setProgress(0); }}
                className="flex w-full items-start gap-5 text-left" initial={{ opacity: 0.4 }} animate={{ opacity: active ? 1 : 0.4 }} transition={{ duration: 0.4 }}>
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all"
                  style={active ? { background: 'var(--op-indigo)', color: '#fff', transform: 'scale(1.08)' } : { background: 'var(--op-paper-2)', border: '1px solid var(--op-line)', color: 'var(--op-muted)' }}>
                  {i <= current ? '✓' : i + 1}
                </span>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--op-ink)' }}>{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--op-muted)' }}>{step.description}</p>
                </div>
              </motion.button>
            );
          })}
        </div>

        <div className="relative order-1 h-[260px] overflow-hidden rounded-2xl md:order-2 md:h-[440px]" style={{ border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.25)' }}>
          <AnimatePresence mode="wait">
            {steps.map((step, i) => i === current && (
              <motion.div key={step.number} className="absolute inset-0 overflow-hidden rounded-2xl"
                initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -80, opacity: 0 }} transition={{ duration: 0.5, ease: 'easeInOut' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={step.image} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: 'linear-gradient(to top, var(--op-paper), transparent)' }} />
                <div className="absolute bottom-4 left-4 rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', color: 'var(--op-indigo)' }}>{step.detail}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
