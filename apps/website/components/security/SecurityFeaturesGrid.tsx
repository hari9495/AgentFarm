'use client';

/**
 * Option A — security architecture grid, adapted from 21st.dev
 * `efferd/grid-feature-cards`: connected cells with dashed dividers, thin icons,
 * subtle blur-in reveal. Extended to render each feature's bullet list.
 */

import { motion, useReducedMotion } from 'motion/react';
import { Shield, type LucideIcon } from 'lucide-react';
import { securityIconMap, type SecurityFeature } from './security-icons';

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

export default function SecurityFeaturesGrid({ title, subtitle, features }: { title: string; subtitle: string; features: readonly SecurityFeature[] }) {
  return (
    <div className="op-wrap">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight md:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{title}</h2>
        <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{subtitle}</p>
      </Reveal>

      <Reveal delay={0.3} className="mx-auto mt-10 max-w-6xl">
        <div className="grid grid-cols-1 border border-dashed sm:grid-cols-2 lg:grid-cols-3" style={{ borderColor: 'var(--op-line)' }}>
          {features.map((f) => {
            const Icon: LucideIcon = securityIconMap[f.icon] ?? Shield;
            return (
              <div key={f.title} className="relative p-6" style={{ borderRight: '1px dashed var(--op-line)', borderBottom: '1px dashed var(--op-line)' }}>
                <Icon className="size-6" strokeWidth={1.25} aria-hidden style={{ color: 'var(--op-indigo)' }} />
                <h3 className="mt-6 text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{f.title}</h3>
                <ul className="mt-3 space-y-1.5">
                  {f.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--op-indigo)' }} />
                      <span className="text-[13px] font-light leading-relaxed" style={{ color: 'var(--op-muted)' }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Reveal>
    </div>
  );
}
