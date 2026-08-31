/**
 * Per-step product mocks for the how-it-works showcase — one relevant UI mock
 * per step statement (instead of stock photos). Operations Console palette.
 * Index maps to howItWorksPageContent.steps order.
 */

import { Bot, Check, Clock, Plug, ShieldCheck, BarChart3 } from 'lucide-react';

const cardStyle: React.CSSProperties = { background: 'var(--op-paper)', border: '1px solid var(--op-line)', borderRadius: 16, boxShadow: '0 20px 44px -26px rgba(16,24,40,0.22)' };
const chip = (bg: string, color: string): React.CSSProperties => ({ background: bg, color, borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700 });

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md p-5" style={cardStyle}>
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#e1483d' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#d98a00' }} /><span className="h-2.5 w-2.5 rounded-full" style={{ background: '#0ea968' }} />
        <span className="ml-2 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

const roles = [
  { name: 'Backend Developer', on: true },
  { name: 'QA Tester', on: false },
  { name: 'Support Triage', on: false },
  { name: 'Ops Follow-through', on: false },
];
const connectors = ['GitHub', 'Jira', 'Slack', 'Email'];

export default function StepMock({ index }: { index: number }) {
  switch (index) {
    case 0: // Choose a specialist worker
      return (
        <Frame label="agentfarm · roles">
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.name} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: r.on ? 'var(--op-indigo-soft)' : 'var(--op-paper-2)', border: `1px solid ${r.on ? 'var(--op-indigo)' : 'var(--op-line)'}` }}>
                <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: 'var(--op-ink)' }}><Bot className="h-4 w-4" style={{ color: r.on ? 'var(--op-indigo)' : 'var(--op-muted)' }} /> {r.name}</span>
                {r.on && <span style={chip('var(--op-indigo)', '#fff')}>Selected</span>}
              </div>
            ))}
          </div>
          <button className="mt-4 w-full rounded-lg py-2 text-[13px] font-semibold text-white" style={{ background: 'var(--op-indigo)' }}>Deploy worker</button>
        </Frame>
      );
    case 1: // Define identity and escalation
      return (
        <Frame label="agentfarm · persona">
          <div className="space-y-3 text-[13px]">
            <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--op-muted)' }}>Name</p><div className="rounded-lg px-3 py-2" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>Dev Worker · Payments</div></div>
            <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--op-muted)' }}>Operating boundary</p><div className="rounded-lg px-3 py-2" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)', color: 'var(--op-ink-soft)' }}>payments-service repo only</div></div>
            <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--op-pending-soft)' }}>
              <span style={{ color: 'var(--op-ink)' }}>Escalate HIGH-risk to human</span><span style={chip('var(--op-pending)', '#fff')}>ON</span>
            </div>
          </div>
        </Frame>
      );
    case 2: // Connect the real systems
      return (
        <Frame label="agentfarm · connectors">
          <div className="grid grid-cols-2 gap-2">
            {connectors.map((c) => (
              <div key={c} className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: 'var(--op-ink)' }}><Plug className="h-4 w-4" style={{ color: 'var(--op-evidence)' }} /> {c}</span>
                <Check className="h-4 w-4" style={{ color: 'var(--op-approved)' }} strokeWidth={2.6} />
              </div>
            ))}
          </div>
          <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}>Scoped least-privilege · revocable</p>
        </Frame>
      );
    case 3: // Assign work and classify risk
      return (
        <Frame label="agentfarm · task">
          <p className="text-[13px] font-semibold" style={{ color: 'var(--op-ink)' }}>Deploy hotfix to production</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--op-muted)' }}>Classified before it runs</p>
          <div className="mt-4 space-y-2">
            {[['Read repo', 'LOW', 'var(--op-approved)', 'var(--op-approved-soft)'], ['Open PR', 'LOW', 'var(--op-approved)', 'var(--op-approved-soft)'], ['Deploy to prod', 'HIGH', 'var(--op-blocked)', '#fdecea']].map(([a, r, c, bg]) => (
              <div key={a} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                <span className="text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>{a}</span><span style={chip(bg as string, c as string)}>{r}</span>
              </div>
            ))}
          </div>
        </Frame>
      );
    case 4: // Review what matters (approval gate)
      return (
        <Frame label="agentfarm · approvals">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--op-line)', background: 'var(--op-paper-2)' }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--op-ink)' }}>Developer agent</span>
              <span className="inline-flex items-center gap-1" style={chip('var(--op-pending-soft)', 'var(--op-pending)')}><Clock className="h-3 w-3" /> Awaiting approval</span>
            </div>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>Deploy hotfix to production</p>
            <div className="mt-4 flex gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ background: 'var(--op-approved)' }}><Check className="h-3.5 w-3.5" /> Approve</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold" style={{ borderColor: 'var(--op-line)', color: 'var(--op-ink-soft)' }}>Reject</span>
            </div>
          </div>
          <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}><ShieldCheck className="mr-1 inline h-3 w-3" style={{ color: 'var(--op-evidence)' }} /> Logged to the audit trail</p>
        </Frame>
      );
    default: // Scale with visibility
      return (
        <Frame label="agentfarm · insights">
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            {[['46', 'PRs merged'], ['184', 'tasks'], ['100%', 'audited']].map(([v, l]) => (
              <div key={l} className="rounded-lg py-3" style={{ background: 'var(--op-paper-2)', border: '1px solid var(--op-line)' }}>
                <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold" style={{ color: 'var(--op-ink)' }}>{v}</p>
                <p className="text-[11px]" style={{ color: 'var(--op-muted)' }}>{l}</p>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-1.5" style={{ height: 70 }}>
            {[40, 55, 48, 70, 62, 85, 78].map((h, i) => (
              <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 5 ? 'var(--op-indigo)' : 'var(--op-indigo-soft)' }} />
            ))}
          </div>
          <p className="mt-3 font-[family-name:var(--font-mono)] text-[11px]" style={{ color: 'var(--op-muted)' }}><BarChart3 className="mr-1 inline h-3 w-3" style={{ color: 'var(--op-indigo)' }} /> Throughput trending up</p>
        </Frame>
      );
  }
}
