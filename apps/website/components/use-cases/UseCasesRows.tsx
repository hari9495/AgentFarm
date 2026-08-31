/**
 * Use cases — Option A (alternating rows). Adapted from 21st.dev
 * `shadcnblocks/feature-2` (media + text row) to Operations Console: each case
 * is a zig-zag row, narrative on one side and a CaseScorecard on the other.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cases } from './cases-data';
import CaseScorecard from './CaseScorecard';

export default function UseCasesRows() {
  return (
    <div className="op-wrap flex flex-col gap-20 md:gap-28">
      {cases.map((c, i) => {
        const Icon = c.icon;
        const flip = i % 2 === 1;
        return (
          <div key={c.audience} className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
            <div className={flip ? 'md:order-2' : ''}>
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--op-indigo)' }}>
                <Icon className="h-4 w-4" /> {c.audience}
              </p>
              <h2 className="mt-3 font-[family-name:var(--font-display)] font-extrabold tracking-tight" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', letterSpacing: '-0.025em', lineHeight: 1.1, color: 'var(--op-ink)' }}>{c.headline}</h2>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{c.story}</p>
              <Link href="/marketplace" className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--op-indigo)' }}>Explore the roles <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className={flip ? 'md:order-1' : ''}>
              <CaseScorecard c={c} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
