/**
 * Product demo — Option A (framed "worker run" mock). Browser-chrome frame with
 * a play button over the Intake → Working → Approval → Delivered flow.
 * Operations Console palette + productPageContent.demo.
 */

import { ArrowRight, Play } from 'lucide-react';
import { productPageContent as C } from '@/lib/marketing-content';

export default function ProductDemoFramed() {
  return (
    <>
      <div className="op-wrap-narrow text-center">
        <p className="op-eyebrow">{C.demo.badge}</p>
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ lineHeight: 1.05, color: 'var(--op-ink)' }}>{C.demo.title}</h2>
        <p className="mt-4 mx-auto max-w-xl text-[1.075rem]" style={{ color: 'var(--op-muted)' }}>{C.demo.description}</p>
      </div>
      <div className="op-wrap mt-10">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)', boxShadow: '0 30px 60px -30px rgba(16,24,40,0.25)' }}>
          <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--op-line)' }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#e1483d' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d98a00' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#0ea968' }} />
            <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>agentfarm · worker run</span>
          </div>
          <div className="flex flex-col items-center justify-center gap-8" style={{ minHeight: 360, padding: '48px 24px', background: 'linear-gradient(160deg, var(--op-indigo-soft), var(--op-paper-2) 70%)' }}>
            <button className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105" style={{ background: 'var(--op-indigo)' }} aria-label="Play demo">
              <Play className="ml-0.5 h-6 w-6" fill="currentColor" />
            </button>
            <div className="flex flex-wrap items-center justify-center gap-3 text-center">
              {['Intake', 'Working', 'Approval', 'Delivered'].map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <div className="rounded-xl px-4 py-2.5" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                    <span className="text-[13px] font-semibold" style={{ color: i === 2 ? 'var(--op-pending)' : 'var(--op-ink)' }}>{s}</span>
                  </div>
                  {i < 3 && <ArrowRight className="h-4 w-4" style={{ color: 'var(--op-muted)' }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
