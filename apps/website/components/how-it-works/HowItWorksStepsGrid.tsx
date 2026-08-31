/**
 * Adapted from 21st.dev `7ovr/how-it-works-1` (How It Works Steps) for the six
 * detailed how-it-works steps — numbered, icon-badged cards with a "detail" tag.
 * Operations Console palette; content is howItWorksPageContent.steps.
 */

import { ShoppingCart, Users, Link2, MessageSquare, CheckCircle, BarChart3, type LucideIcon } from 'lucide-react';
import { howItWorksPageContent as C } from '@/lib/marketing-content';

const stepIcons: LucideIcon[] = [ShoppingCart, Users, Link2, MessageSquare, CheckCircle, BarChart3];

export default function HowItWorksStepsGrid() {
  return (
    <div className="op-wrap">
      <h2 className="mb-10 text-center font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>
        How a worker gets to work
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {C.steps.map((step, i) => {
          const Icon = stepIcons[i] ?? ShoppingCart;
          return (
            <div key={step.number} className="op-lift relative rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
              <span className="absolute right-6 top-6 rounded-full px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] font-semibold tabular-nums" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{step.number}</span>
              <span className="flex size-12 items-center justify-center rounded-xl" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                <Icon className="size-5" style={{ color: 'var(--op-indigo)' }} aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-base font-semibold" style={{ color: 'var(--op-ink)' }}>{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--op-muted)' }}>{step.description}</p>
              <p className="mt-4 inline-flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px] font-semibold" style={{ color: 'var(--op-approved)' }}>✓ {step.detail}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
