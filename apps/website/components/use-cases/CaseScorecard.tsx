/** Shared "scorecard" visual for a use case — audience header + the 4 results
 *  as check rows. Replaces stock photos with an on-brand outcome card. */

import { Check, ShieldCheck } from 'lucide-react';
import type { UseCase } from './cases-data';
import { featureTint } from '@/components/shared/feature-icon-palette';

export default function CaseScorecard({ c, index = 0 }: { c: UseCase; index?: number }) {
  const Icon = c.icon;
  const tint = featureTint(index);
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 50px -28px rgba(16,24,40,0.22)' }}>
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: tint.bg, color: tint.color }}><Icon className="h-5 w-5" /></span>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: 'var(--op-ink)' }}>{c.audience}</p>
          <p className="font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>outcomes</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {c.results.map((r) => (
          <div key={r} className="flex items-start gap-2.5 rounded-lg px-3 py-2" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.6} style={{ color: 'var(--op-approved)' }} />
            <span className="text-[13px]" style={{ color: 'var(--op-ink-soft)', lineHeight: 1.4 }}>{r}</span>
          </div>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>
        <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--op-evidence)' }} /> Governed · every action audited
      </p>
    </div>
  );
}
