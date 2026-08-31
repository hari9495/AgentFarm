'use client';

/**
 * Use cases — Option B (tabbed explorer). Adapted from 21st.dev
 * `shadcnblocks/feature108` (tabs + content panel) to Operations Console. Pick
 * an audience tab → its narrative + a CaseScorecard. useState, not Radix.
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cases } from './cases-data';
import CaseScorecard from './CaseScorecard';
import { featureTint } from '@/components/shared/feature-icon-palette';

export default function UseCasesTabs() {
  const [active, setActive] = React.useState(0);
  const c = cases[active];

  return (
    <div className="op-wrap">
      <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
        {cases.map((t, i) => {
          const Icon = t.icon;
          const on = i === active;
          const tint = featureTint(i);
          return (
            <button key={t.audience} type="button" onClick={() => setActive(i)}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors"
              style={on ? { background: tint.bg, color: tint.color, border: `1px solid ${tint.color}` } : { color: 'var(--op-muted)', border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
              <Icon className="h-4 w-4" style={{ color: tint.color }} /> {t.audience}
            </button>
          );
        })}
      </div>

      <div className="mx-auto max-w-screen-xl rounded-2xl p-6 lg:p-12" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--op-indigo)' }}>{c.audience}</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] font-extrabold tracking-tight" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.4rem)', letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--op-ink)' }}>{c.headline}</h2>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{c.story}</p>
            <Link href="/marketplace" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--op-indigo)' }}>Explore the roles <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <CaseScorecard c={c} index={active} />
        </div>
      </div>
    </div>
  );
}
