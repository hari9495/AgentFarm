/**
 * Adapted from 21st.dev `7ovr/how-it-works-2` (How It Works Timeline) — a
 * vertical timeline of numbered, icon-circled steps with a connecting line.
 * Retinted to the Operations Console palette; content is executionFlow.
 */

import { Rocket, Plug, ShieldCheck, type LucideIcon } from 'lucide-react';
import { productPageContent as C } from '@/lib/marketing-content';

const stepIcons: LucideIcon[] = [Rocket, Plug, ShieldCheck];

export default function HowItWorksTimeline() {
  return (
    <div className="op-wrap-narrow">
      <div className="mb-14">
        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-widest" style={{ borderColor: 'var(--op-line)', color: 'var(--op-indigo)' }}>How it works</span>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>From setup to live in three steps</h2>
        <p className="mt-3" style={{ color: 'var(--op-muted)' }}>AgentFarms is designed for momentum — go from launch to approval-aware delivery without a single support ticket.</p>
      </div>

      <ol className="flex flex-col">
        {C.executionFlow.map((step, index) => {
          const Icon = stepIcons[index] ?? Rocket;
          const isLast = index === C.executionFlow.length - 1;
          return (
            <li key={step.step} className="flex gap-6">
              <div className="flex flex-col items-center">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--op-indigo-soft)', border: '1px solid var(--op-line)' }}>
                  <Icon className="size-5" style={{ color: 'var(--op-indigo)' }} aria-hidden="true" />
                </span>
                {!isLast && <span className="mt-1 w-px flex-1" style={{ background: 'var(--op-line)' }} />}
              </div>
              <div className={isLast ? 'pb-0' : 'pb-10'}>
                <div className="flex items-center gap-2">
                  <span className="font-[family-name:var(--font-mono)] text-[12px] font-bold" style={{ color: 'var(--op-indigo)' }}>{step.step}</span>
                  <h3 className="text-base font-semibold" style={{ color: 'var(--op-ink)' }}>{step.title}</h3>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--op-muted)' }}>{step.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
