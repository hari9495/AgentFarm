/**
 * Option B — book-a-demo layout adapted from 21st.dev `designali-in/book-a-demo-3`:
 * two columns — breadcrumb + heading + value checklist + a "works with the tools
 * you run" logo strip on the left, a bordered form card on the right. Operations
 * Console palette; @aliimam logos swapped for our real connector SVGs.
 */

import { Check } from 'lucide-react';
import { ConnectorLogo } from '@/components/integrations/IntegrationsCardGrid';
import { whatToExpect } from './book-demo-data';
import BookDemoForm from './BookDemoForm';

const TRUST_LOGOS = ['GitHub', 'Slack', 'Jira', 'Salesforce', 'Linear', 'Gmail'];

export default function BookDemoSectionB() {
  return (
    <div className="op-wrap">
      <div className="grid gap-10 lg:grid-cols-2">
        {/* Left — copy + trust */}
        <div className="space-y-6">
          <p className="font-[family-name:var(--font-mono)] text-[13px]" style={{ color: 'var(--op-muted)' }}>Contact / Book a demo</p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-extrabold tracking-tight md:text-5xl" style={{ letterSpacing: '-0.03em', lineHeight: 1.05, color: 'var(--op-ink)' }}>See a governed AI worker in action</h1>
          <p className="max-w-md text-[16px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>30 minutes with the AgentFarms team. We&apos;ll show a live worker, answer your governance questions, and help scope the right starting workflow.</p>
          <ul className="space-y-3">
            {whatToExpect.map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: 'var(--op-indigo-soft)' }}>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.6} style={{ color: 'var(--op-indigo)' }} />
                </span>
                <span className="text-[14px]" style={{ color: 'var(--op-ink-soft)' }}>{item}</span>
              </li>
            ))}
          </ul>
          <div className="pt-2">
            <p className="mb-4 text-[13px] font-semibold" style={{ color: 'var(--op-ink)' }}>Works with the tools you already run</p>
            <div className="flex flex-wrap items-center gap-3">
              {TRUST_LOGOS.map((name) => <ConnectorLogo key={name} name={name} size={40} />)}
            </div>
          </div>
        </div>

        {/* Right — form card */}
        <div className="rounded-2xl p-7 md:p-8" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', boxShadow: '0 24px 56px -30px rgba(16,24,40,0.2)' }}>
          <h2 className="mb-6 text-[18px] font-semibold" style={{ letterSpacing: '-0.018em', color: 'var(--op-ink)' }}>Schedule your session</h2>
          <BookDemoForm />
        </div>
      </div>
    </div>
  );
}
