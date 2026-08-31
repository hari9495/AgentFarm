/**
 * Option B — two-column contact split, adapted from 21st.dev `shadcnspace/contact-01`
 * section layout: contact info + copy on the left (col-span-6), the form card on
 * the right (col-span-5). Operations Console palette.
 */

import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export interface ContactInfoItem { icon: LucideIcon; label: string; lines: string[] }

export default function ContactSplitSection({ eyebrow, title, description, info, children }: { eyebrow?: string; title: string; description: string; info: ContactInfoItem[]; children: React.ReactNode }) {
  return (
    <div className="op-wrap">
      <div className="grid grid-cols-12 items-start gap-8 md:gap-0">
        {/* Info + copy */}
        <div className="col-span-12 md:col-span-6">
          {eyebrow && <p className="op-eyebrow mb-3">{eyebrow}</p>}
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--op-ink)' }}>{title}</h1>
          <p className="mt-4 max-w-md text-[16px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{description}</p>
          <div className="mt-8 space-y-4">
            {info.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-start gap-3 rounded-2xl p-5" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)' }}>
                  <div className="rounded-lg p-2.5" style={{ background: 'var(--op-indigo-soft)' }}>
                    <Icon className="h-4 w-4" style={{ color: 'var(--op-indigo)' }} />
                  </div>
                  <div>
                    <p className="mb-0.5 text-[14px] font-semibold" style={{ color: 'var(--op-ink)' }}>{item.label}</p>
                    {item.lines.map((l) => <p key={l} className="text-[13px]" style={{ lineHeight: 1.6, color: 'var(--op-muted)' }}>{l}</p>)}
                  </div>
                </div>
              );
            })}
            <div className="rounded-2xl p-5" style={{ background: 'var(--op-indigo-soft)' }}>
              <p className="mb-1 text-[14px] font-semibold" style={{ color: 'var(--op-indigo-ink)' }}>Want a live demo instead?</p>
              <p className="mb-3 text-[13px]" style={{ lineHeight: 1.5, color: 'var(--op-ink-soft)' }}>Book a 30-minute session with the team and see a worker in action.</p>
              <Link href="/book-demo" className="inline-flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--op-indigo)' }}>Book a demo <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </div>

        <div className="hidden md:col-span-1 md:block" />

        {/* Form card */}
        <div className="col-span-12 md:col-span-5">
          <div className="rounded-2xl p-7" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -30px rgba(16,24,40,0.2)' }}>
            <h3 className="mb-6 text-[18px] font-semibold" style={{ letterSpacing: '-0.018em', color: 'var(--op-ink)' }}>Send us a message</h3>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
