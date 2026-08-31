/**
 * Adapted from 21st.dev `gooseui/features-grid` — icon + title + description
 * cards in a responsive grid. Retinted to the Operations Console palette;
 * content is productPageContent.features (8 capabilities).
 */

import { Code2, Zap, Shield, Server, TestTube2, Activity, GitBranch, Layout, type LucideIcon } from 'lucide-react';
import { productPageContent as C } from '@/lib/marketing-content';
import { featureTint } from '@/components/shared/feature-icon-palette';

const featureIcons: LucideIcon[] = [Code2, Zap, Shield, Server, TestTube2, Activity, GitBranch, Layout];

export default function ProductFeaturesGrid() {
  return (
    <div className="op-wrap">
      <div className="mb-12 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight md:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.featuresHeader.title}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg" style={{ color: 'var(--op-muted)' }}>{C.featuresHeader.description}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {C.features.map((f, i) => {
          const Icon = featureIcons[i] ?? Zap;
          const t = featureTint(i);
          return (
            <div key={f.title} className="op-lift rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl" style={{ background: t.bg }}>
                <Icon className="size-6" style={{ color: t.color }} />
              </div>
              <h3 className="mb-2 font-semibold tracking-tight" style={{ color: 'var(--op-ink)' }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--op-muted)' }}>{f.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
