/**
 * Option A — book-a-demo layout adapted from 21st.dev `designali-in/book-a-demo-1`:
 * a bordered section with a big centered heading, then a two-column split —
 * value checklist + "what to expect" on the left, the form on the right with a
 * dividing border. Operations Console palette; @aliimam icons swapped for lucide.
 */

import { Check, Clock, Video } from 'lucide-react';
import { whatToExpect } from './book-demo-data';
import BookDemoForm from './BookDemoForm';

export default function BookDemoSectionA() {
  return (
    <div className="op-wrap">
      <div className="rounded-2xl" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
        <div className="px-6 py-10 text-center md:py-14">
          <p className="op-eyebrow mb-4">Book a demo</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight md:text-5xl" style={{ letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--op-ink)' }}>See a governed AI worker in action</h1>
          <p className="mx-auto mt-4 max-w-md text-[16px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>30 minutes with the AgentFarms team — a live worker, your governance questions answered, and help scoping the right starting workflow.</p>
        </div>

        <div className="grid gap-0 lg:grid-cols-2" style={{ borderTop: '1px solid var(--op-line)' }}>
          <div className="space-y-6 p-6 md:p-10">
            <div className="mb-2 flex items-center gap-2">
              <Video className="h-5 w-5" style={{ color: 'var(--op-indigo)' }} />
              <span className="text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>What to expect</span>
            </div>
            <ul className="space-y-3">
              {whatToExpect.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.6} style={{ color: 'var(--op-indigo)' }} />
                  <span className="text-[14px]" style={{ lineHeight: 1.5, color: 'var(--op-ink-soft)' }}>{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3 rounded-2xl p-5" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
              <Clock className="h-5 w-5 shrink-0" style={{ color: 'var(--op-muted)' }} />
              <div>
                <p className="text-[14px] font-semibold" style={{ color: 'var(--op-ink)' }}>30 minutes, video call</p>
                <p className="text-[13px]" style={{ color: 'var(--op-muted)' }}>Google Meet or Zoom — your choice</p>
              </div>
            </div>
          </div>

          <div className="p-6 md:p-10" style={{ borderTop: '1px solid var(--op-line)' }}>
            <div className="lg:border-l lg:pl-10" style={{ borderColor: 'var(--op-line)' }}>
              <h2 className="mb-6 text-[18px] font-semibold" style={{ letterSpacing: '-0.018em', color: 'var(--op-ink)' }}>Schedule your session</h2>
              <BookDemoForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
