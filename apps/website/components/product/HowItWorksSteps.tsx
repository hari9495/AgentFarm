/**
 * Adapted from 21st.dev `7ovr/how-it-works-1` (How It Works Steps) — numbered,
 * icon-badged step cards. Retinted to the Operations Console palette; content is
 * productPageContent.executionFlow (Rocket / Plug / ShieldCheck per step).
 */

import { Rocket, Plug, ShieldCheck, type LucideIcon } from 'lucide-react';
import { productPageContent as C } from '@/lib/marketing-content';

const stepIcons: LucideIcon[] = [Rocket, Plug, ShieldCheck];

export default function HowItWorksSteps() {
  return (
    <div className="op-wrap">
      <div className="mx-auto max-w-2xl text-center">
        <span className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--op-indigo)' }}>How it works</span>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>From setup to live in three steps</h2>
        <p className="mt-3" style={{ color: 'var(--op-muted)' }}>AgentFarms keeps the process simple, so your team spends time on outcomes, not configuration.</p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-3">
        {C.executionFlow.map((step, i) => {
          const Icon = stepIcons[i] ?? Rocket;
          return (
            <div key={step.step} className="op-lift relative rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <span className="absolute right-6 top-6 rounded-full px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] font-semibold tabular-nums" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{step.step}</span>
              <span className="flex size-12 items-center justify-center rounded-xl" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                <Icon className="size-5" style={{ color: 'var(--op-indigo)' }} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold" style={{ color: 'var(--op-ink)' }}>{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--op-muted)' }}>{step.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
