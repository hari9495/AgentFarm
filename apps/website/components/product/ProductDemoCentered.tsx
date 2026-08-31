/**
 * Product demo — Option B (centered, video-first). A large 16:9 framed player
 * with a single play affordance and a caption strip. Cleaner than the flow mock.
 * Operations Console palette + productPageContent.demo.
 */

import { Play, Clock } from 'lucide-react';
import { productPageContent as C } from '@/lib/marketing-content';

export default function ProductDemoCentered() {
  return (
    <div className="op-wrap-narrow text-center">
      <p className="op-eyebrow">{C.demo.badge}</p>
      <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.demo.title}</h2>
      <p className="mt-4 mx-auto max-w-xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{C.demo.description}</p>

      <div className="mt-10">
        <div className="group relative mx-auto aspect-video w-full max-w-3xl overflow-hidden rounded-2xl"
          style={{ border: '1px solid var(--op-line)', background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 70%)', boxShadow: '0 30px 60px -30px rgba(16,24,40,0.28)' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <button className="flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition-transform group-hover:scale-105" style={{ background: 'var(--op-indigo)' }} aria-label="Play demo">
              <Play className="ml-1 h-8 w-8" fill="currentColor" />
            </button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-3" style={{ background: 'linear-gradient(to top, rgba(16,24,40,0.10), transparent)' }}>
            <span className="font-[family-name:var(--font-mono)] text-[12px]" style={{ color: 'var(--op-ink-soft)' }}>Intake → Working → Approval → Delivered</span>
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', color: 'var(--op-muted)' }}><Clock className="h-3 w-3" /> 90 sec</span>
          </div>
        </div>
      </div>
    </div>
  );
}
