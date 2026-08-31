/**
 * Product CTA — Option A (clean light). Badge, headline, dual buttons.
 * Operations Console palette + productPageContent.cta.
 */

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { productPageContent as C } from '@/lib/marketing-content';

export default function ProductCTAClean() {
  return (
    <div className="op-wrap-narrow text-center">
      <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>14-day free trial · no card required</span>
      <h2 className="mx-auto mt-5 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ lineHeight: 1.04, color: 'var(--op-ink)' }}>{C.cta.title}</h2>
      <p className="mt-4 mx-auto max-w-xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{C.cta.description}</p>
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link href={C.cta.button.href} className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{C.cta.button.label} <ArrowRight className="h-4 w-4" /></Link>
        <Link href="/how-it-works" className="inline-flex h-11 items-center rounded-xl px-6 text-[15px] font-semibold" style={{ border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>How it works</Link>
      </div>
    </div>
  );
}
