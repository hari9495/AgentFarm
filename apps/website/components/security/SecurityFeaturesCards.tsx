/**
 * Option B — security architecture grid as solid op-lift cards: icon chip +
 * title + bullet list. Same feature-grid archetype (gooseui-style icon cards),
 * warmer/more contained than the dashed-cell Option A.
 */

import { Shield, type LucideIcon } from 'lucide-react';
import { securityIconMap, type SecurityFeature } from './security-icons';

export default function SecurityFeaturesCards({ title, subtitle, features }: { title: string; subtitle: string; features: readonly SecurityFeature[] }) {
  return (
    <div className="op-wrap">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight md:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{title}</h2>
        <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{subtitle}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => {
          const Icon: LucideIcon = securityIconMap[f.icon] ?? Shield;
          return (
            <div key={f.title} className="op-lift rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[10px]" style={{ background: 'var(--op-indigo-soft)' }}>
                <Icon className="h-5 w-5" style={{ color: 'var(--op-indigo)' }} />
              </div>
              <h3 className="mb-3 text-[15px] font-semibold" style={{ letterSpacing: '-0.015em', color: 'var(--op-ink)' }}>{f.title}</h3>
              <ul className="space-y-1.5">
                {f.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--op-indigo)' }} />
                    <span className="text-[13px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
