/**
 * Shared CTA — adapted from 21st.dev `shadcnblocks/cta11` (centered CTA card,
 * dual buttons). Operations Console palette; optional badge + trust items.
 * Reused across all marketing pages.
 */

import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';

export interface SharedCTAProps {
  heading: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  badge?: string;
  trustItems?: string[];
}

export default function SharedCTA({ heading, description, primary, secondary, badge, trustItems }: SharedCTAProps) {
  return (
    <div className="op-wrap flex items-center justify-center">
      <div className="flex w-full max-w-4xl flex-col items-center rounded-3xl p-8 text-center lg:p-16" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
        {badge && <span className="mb-5 inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{badge}</span>}
        <h3 className="mb-4 max-w-3xl font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight md:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{heading}</h3>
        <p className="mb-8 max-w-2xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{description}</p>
        <div className="flex w-full flex-col justify-center gap-3 sm:flex-row">
          {secondary && (
            <Link href={secondary.href} className="inline-flex h-11 items-center justify-center rounded-xl px-6 text-[15px] font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>{secondary.label}</Link>
          )}
          <Link href={primary.href} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{primary.label} <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {trustItems && trustItems.length > 0 && (
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {trustItems.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>
                <Check className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--op-indigo)' }} /> {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
