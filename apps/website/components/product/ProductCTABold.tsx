/**
 * Product CTA — Option B (bold blue panel). Solid-indigo closing panel with
 * underlined headline + dual buttons. Adapted from the 21st.dev shadcnstore
 * cta family. Operations Console palette + productPageContent.cta.
 */

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { productPageContent as C } from '@/lib/marketing-content';

export default function ProductCTABold() {
  return (
    <div className="op-wrap">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl px-8 py-14 text-center sm:px-14 sm:py-16" style={{ background: 'var(--op-indigo)', boxShadow: '0 30px 60px -24px rgba(37,99,235,0.55)' }}>
        <span className="inline-flex items-center rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff' }}>14-day free trial · no card required</span>
        <h2 className="mx-auto mt-5 max-w-2xl font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight text-white sm:text-5xl" style={{ lineHeight: 1.04 }}>{C.cta.title}</h2>
        <p className="mx-auto mt-4 max-w-xl text-base sm:text-lg" style={{ color: 'rgba(255,255,255,0.82)' }}>{C.cta.description}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={C.cta.button.href} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold" style={{ color: 'var(--op-indigo)' }}>{C.cta.button.label} <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/how-it-works" className="inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-white" style={{ border: '1px solid rgba(255,255,255,0.5)' }}>How it works</Link>
        </div>
      </div>
    </div>
  );
}
