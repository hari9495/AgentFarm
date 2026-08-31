/**
 * Option A — unified contact card, adapted from 21st.dev `efferd/contact-card`:
 * one bordered block with corner plus-marks, title + description + contact-info
 * grid on the left and the form (as children) in a recessed panel on the right.
 * Operations Console palette.
 */

import { Plus, type LucideIcon } from 'lucide-react';

export interface ContactInfoItem { icon: LucideIcon; label: string; lines: string[] }

export default function ContactCardSection({ title, description, info, children }: { title: string; description: string; info: ContactInfoItem[]; children: React.ReactNode }) {
  return (
    <div className="op-wrap">
      <div className="relative mx-auto grid max-w-5xl grid-cols-1 rounded-2xl md:grid-cols-2 lg:grid-cols-3" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -30px rgba(16,24,40,0.22)' }}>
        <Plus className="absolute -left-3 -top-3 h-6 w-6" style={{ color: 'var(--op-line-strong, #c7cdd6)' }} />
        <Plus className="absolute -right-3 -top-3 h-6 w-6" style={{ color: 'var(--op-line-strong, #c7cdd6)' }} />
        <Plus className="absolute -bottom-3 -left-3 h-6 w-6" style={{ color: 'var(--op-line-strong, #c7cdd6)' }} />
        <Plus className="absolute -bottom-3 -right-3 h-6 w-6" style={{ color: 'var(--op-line-strong, #c7cdd6)' }} />

        <div className="flex flex-col justify-between lg:col-span-2">
          <div className="space-y-5 px-6 py-8 md:p-8">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight md:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>{title}</h2>
            <p className="max-w-xl text-[15px] md:text-[16px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{description}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {info.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-start gap-3 py-2">
                    <div className="rounded-lg p-2.5" style={{ background: 'var(--op-indigo-soft)' }}>
                      <Icon className="h-4 w-4" style={{ color: 'var(--op-indigo)' }} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: 'var(--op-ink)' }}>{item.label}</p>
                      {item.lines.map((l) => <p key={l} className="text-[12px]" style={{ color: 'var(--op-muted)' }}>{l}</p>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex h-full w-full items-center border-t p-6 md:col-span-1 md:border-l md:border-t-0" style={{ borderColor: 'var(--op-line)', background: 'var(--op-paper-2)' }}>
          <div className="w-full">{children}</div>
        </div>
      </div>
    </div>
  );
}
