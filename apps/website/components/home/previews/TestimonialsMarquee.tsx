'use client';

/**
 * PREVIEW — adaptation of 21st.dev `shadcnui-blocks/testimonials-13` (marquee)
 * to the Operations Console palette + real AgentFarm testimonials. Auto-scrolls,
 * pauses on hover. Custom CSS marquee (author's Marquee util not shipped).
 */

import * as React from 'react';
import { homeMarketingContent } from '@/lib/marketing-content';

type Item = { name: string; role: string; initials: string; quote: string; metric?: string };

function TCard({ t }: { t: Item }) {
  return (
    <div className="w-[360px] shrink-0 rounded-2xl p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>{t.initials}</span>
        <div>
          <p className="text-[14px] font-semibold" style={{ color: 'var(--op-ink)' }}>{t.name}</p>
          <p className="text-[12px]" style={{ color: 'var(--op-muted)' }}>{t.role}</p>
        </div>
      </div>
      {t.metric && <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--op-indigo)' }}>{t.metric}</p>}
      <p className="mt-2 text-[15px] leading-relaxed" style={{ color: 'var(--op-ink-soft)' }}>&ldquo;{t.quote}&rdquo;</p>
    </div>
  );
}

export function TestimonialsMarquee() {
  const { testimonials } = homeMarketingContent;
  const loop: Item[] = [...testimonials.items, ...testimonials.items]; // duplicate for a seamless track

  return (
    <section className="w-full overflow-hidden px-6 py-20 sm:py-28" style={{ background: 'var(--op-paper-2)', color: 'var(--op-ink)' }}>
      <style>{`@keyframes af-mq { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .af-mq-track { display:flex; gap:20px; width:max-content; animation: af-mq 70s linear infinite; }
        .af-mq-wrap:hover .af-mq-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce){ .af-mq-track{ animation:none; } }`}</style>

      <div className="mx-auto mb-14 max-w-xl text-center">
        <p className="text-sm font-medium uppercase tracking-widest" style={{ color: 'var(--op-indigo)' }}>{testimonials.eyebrow}</p>
        <h2 className="mt-3 text-balance font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl">{testimonials.title}</h2>
        <p className="mt-4" style={{ color: 'var(--op-muted)' }}>{testimonials.description}</p>
      </div>

      <div className="af-mq-wrap relative" style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)', maskImage: 'linear-gradient(to right, transparent, black 6%, black 94%, transparent)' }}>
        <div className="af-mq-track">
          {loop.map((t, i) => <TCard key={i} t={t} />)}
        </div>
      </div>
    </section>
  );
}

export default TestimonialsMarquee;
