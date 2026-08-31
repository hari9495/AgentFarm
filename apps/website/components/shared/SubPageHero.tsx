/**
 * Shared sub-page hero — split layout adapted from 21st.dev `felipemenezes098/hero-02`.
 * Copy on the left, a `visual` node on the right (a product mock/illustration).
 * Operations Console palette. The standard hero for every marketing sub-page.
 */

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export interface SubPageHeroProps {
  eyebrow: string;
  titleLead: string;
  titleAccent?: string;
  description: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  visual?: React.ReactNode;
}

export default function SubPageHero({ eyebrow, titleLead, titleAccent, description, primary, secondary, visual }: SubPageHeroProps) {
  return (
    <section className="op-light relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 45% at 15% 0%, var(--op-indigo-soft), transparent 60%)' }} />
      <div className={`op-wrap relative grid items-center gap-12 ${visual ? 'md:grid-cols-2' : ''}`} style={{ paddingTop: 80, paddingBottom: 72 }}>
        <div>
          <p className="op-eyebrow">{eyebrow}</p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] font-extrabold" style={{ fontSize: 'clamp(2.4rem, 4.6vw, 3.6rem)', letterSpacing: '-0.03em', lineHeight: 1.04, color: 'var(--op-ink)' }}>
            {titleLead}{titleAccent && <> <span style={{ color: 'var(--op-indigo)' }}>{titleAccent}</span></>}
          </h1>
          <p className="mt-5 max-w-lg text-[1.075rem] leading-relaxed" style={{ color: 'var(--op-muted)' }}>{description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={primary.href} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{primary.label} <ArrowRight className="h-4 w-4" /></Link>
            {secondary && <Link href={secondary.href} className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>{secondary.label}</Link>}
          </div>
        </div>
        {visual && (
          <div className="flex items-center justify-center rounded-2xl p-8" style={{ background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 65%)', outline: '1px solid rgba(16,24,40,0.06)' }}>
            {visual}
          </div>
        )}
      </div>
    </section>
  );
}
