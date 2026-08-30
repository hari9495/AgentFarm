'use client';

/**
 * Home testimonials — staggered editorial grid. Adapted from 21st.dev
 * `efferd/testimonials-3`: three staggered columns, quote glyph, a highlighted
 * metric line, and avatar initials. Retinted to the Operations Console palette;
 * content is the real homeMarketingContent testimonials.
 */

import * as React from 'react';
import { homeMarketingContent } from '@/lib/marketing-content';

function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </svg>
  );
}

type Item = { name: string; role: string; initials: string; quote: string; metric?: string };

function Card({ t }: { t: Item }) {
  return (
    <figure className="op-lift relative flex flex-col justify-between gap-5 rounded-2xl px-7 pt-7 pb-6"
      style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <blockquote className="flex flex-col gap-4">
        <QuoteIcon className="size-6 shrink-0 stroke-1" />
        {t.metric && <p className="text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--op-indigo)' }}>{t.metric}</p>}
        <p className="text-base leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>{t.quote}</p>
      </blockquote>
      <figcaption className="flex items-center gap-3 pt-2" style={{ borderTop: '1px solid var(--op-line)' }}>
        <span className="flex size-9 items-center justify-center rounded-full text-[12px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{t.initials}</span>
        <div className="flex flex-col">
          <cite className="text-sm font-medium not-italic" style={{ color: 'var(--op-ink)' }}>{t.name}</cite>
          <p className="text-xs" style={{ color: 'var(--op-muted)' }}>{t.role}</p>
        </div>
      </figcaption>
    </figure>
  );
}

export default function TestimonialsStaggered() {
  const { testimonials } = homeMarketingContent;
  const items: Item[] = testimonials.items.slice(0, 6);
  const cols: Item[][] = [[], [], []];
  items.forEach((t, i) => cols[i % 3].push(t));

  return (
    <section className="w-full px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper-2)', color: 'var(--op-ink)' }} aria-label="Customer testimonials">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-16 max-w-xl text-center">
          <p className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--op-indigo)' }}>{testimonials.eyebrow}</p>
          <h2 className="mt-3 text-balance font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl">{testimonials.title}</h2>
          <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{testimonials.description}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {cols.map((col, c) => (
            <div
              key={c}
              className="flex flex-col gap-6 md:translate-y-[calc(2.5rem*var(--c))]"
              style={{ ['--c' as string]: c } as React.CSSProperties}
            >
              {col.map((t) => <Card key={t.name} t={t} />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
