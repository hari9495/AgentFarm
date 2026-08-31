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
import { featureTint } from '@/components/shared/feature-icon-palette';
import StepMock from './StepMock';

const AUTOPLAY = 3500;

export default function FeatureStepsShowcase() {
  const steps = C.steps;
  const [current, setCurrent] = React.useState(0);
  const [progress, setProgress] = React.useState(0);

  // Advance one step at a time. Depends on progress/current and re-arms a single
  // timeout each tick — no nested state setters (which double-fire in Strict Mode
  // and made it skip steps).
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (progress < 100) {
        setProgress(progress + 100 / (AUTOPLAY / 100));
      } else {
        setCurrent((current + 1) % steps.length);
        setProgress(0);
      }
    }, 100);
    return () => clearTimeout(t);
  }, [progress, current, steps.length]);

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
                  style={active ? { background: featureTint(i).color, color: '#fff', transform: 'scale(1.08)' } : { background: 'var(--op-paper-2)', border: '1px solid var(--op-line)', color: 'var(--op-muted)' }}>
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

        <div className="relative order-1 flex h-[320px] items-center justify-center overflow-hidden rounded-2xl md:order-2 md:h-[460px]" style={{ border: '1px solid var(--op-line)', background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 70%)' }}>
          <AnimatePresence mode="wait">
            {steps.map((step, i) => i === current && (
              <motion.div key={step.number} className="absolute inset-0 flex items-center justify-center p-6"
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} transition={{ duration: 0.45, ease: 'easeInOut' }}>
                <StepMock index={i} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
