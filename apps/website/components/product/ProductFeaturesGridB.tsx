'use client';

/**
 * Adapted from 21st.dev `efferd/grid-feature-cards` — minimal features section:
 * connected cells with dashed dividers, thin icons, subtle scroll reveal.
 * Retinted to the Operations Console palette; content is productPageContent.features.
 */

import { Code2, Zap, Shield, Server, TestTube2, Activity, GitBranch, Layout, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { productPageContent as C } from '@/lib/marketing-content';

const featureIcons: LucideIcon[] = [Code2, Zap, Shield, Server, TestTube2, Activity, GitBranch, Layout];

function Reveal({ delay = 0.1, className, children }: { delay?: number; className?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div initial={{ filter: 'blur(4px)', translateY: -8, opacity: 0 }} whileInView={{ filter: 'blur(0px)', translateY: 0, opacity: 1 }}
      viewport={{ once: true }} transition={{ delay, duration: 0.8 }} className={className}>
      {children}
    </motion.div>
  );
}

export default function ProductFeaturesGridB() {
  return (
    <div className="op-wrap">
      <div className="mx-auto max-w-3xl space-y-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight md:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.featuresHeader.title}</h2>
          <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{C.featuresHeader.description}</p>
        </Reveal>
      </div>

      <Reveal delay={0.3} className="mx-auto mt-10 max-w-6xl">
        <div className="grid grid-cols-1 border border-dashed sm:grid-cols-2 md:grid-cols-4" style={{ borderColor: 'var(--op-line-strong, #aeb6b4)' }}>
          {C.features.map((f, i) => {
            const Icon = featureIcons[i] ?? Zap;
            return (
              <div key={f.title} className="relative p-6" style={{ borderRight: '1px dashed var(--op-line)', borderBottom: '1px dashed var(--op-line)' }}>
                <Icon className="size-6" strokeWidth={1} aria-hidden style={{ color: 'var(--op-ink-soft)' }} />
                <h3 className="mt-8 text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{f.title}</h3>
                <p className="mt-2 text-[13px] font-light leading-relaxed" style={{ color: 'var(--op-muted)' }}>{f.description}</p>
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}
