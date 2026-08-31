/**
 * Pricing-page feature comparison — plan-vs-plan matrix across Starter+/Pro+/
 * Enterprise. Values consistent with the marketplace plan tiers. Operations
 * Console palette; Pro+ column highlighted. Horizontal scroll on small screens.
 */

import { Check, Minus } from 'lucide-react';

type Cell = boolean | string;
const TIERS = ['Starter+', 'Pro+', 'Enterprise'] as const;

const ROWS: { label: string; values: [Cell, Cell, Cell] }[] = [
  { label: 'AI workers', values: ['2', '5', 'Unlimited'] },
  { label: 'Task executions / month', values: ['2,000', '10,000', 'Unlimited'] },
  { label: 'Repositories & workspaces', values: ['Up to 10', 'Unlimited', 'Unlimited'] },
  { label: 'Integrations', values: ['Core', 'Expanded', 'All + custom'] },
  { label: 'Approval routing', values: [true, 'Custom workflows', 'Custom + policy packs'] },
  { label: 'Evidence / audit trail', values: [true, true, 'Immutable'] },
  { label: 'Analytics', values: ['Baseline', 'Team + rollout', 'Advanced + exports'] },
  { label: 'Support', values: ['Email', 'Priority', 'Dedicated + SLA'] },
  { label: 'SSO / SAML', values: [false, false, true] },
  { label: 'Tenant-isolated runtime', values: [false, false, true] },
  { label: 'Custom connectors & policy packs', values: [false, false, true] },
];

function CellView({ v, pop }: { v: Cell; pop: boolean }) {
  if (v === true) return <Check className="mx-auto h-4 w-4" style={{ color: pop ? 'var(--op-indigo)' : 'var(--op-approved)' }} strokeWidth={2.6} />;
  if (v === false) return <Minus className="mx-auto h-4 w-4" style={{ color: 'var(--op-line-strong, #aeb6b4)' }} />;
  return <span className="text-[13px]" style={{ color: pop ? 'var(--op-ink)' : 'var(--op-ink-soft)', fontWeight: pop ? 600 : 400 }}>{v}</span>;
}

export default function PricingComparison() {
  return (
    <div className="op-wrap">
      <h2 className="mb-10 text-center op-h2" style={{ fontSize: 'clamp(1.7rem, 3vw, 2.3rem)', letterSpacing: '-0.025em' }}>Compare every plan</h2>
      <div className="mx-auto max-w-[960px] overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
        <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th className="px-6 py-5 text-[13px] font-semibold" style={{ color: 'var(--op-muted)', borderBottom: '1px solid var(--op-line)' }}>Features</th>
              {TIERS.map((t) => {
                const pop = t === 'Pro+';
                return (
                  <th key={t} className="px-4 py-5 text-center text-[13px] font-bold uppercase tracking-[0.08em]"
                    style={{ color: pop ? 'var(--op-indigo)' : 'var(--op-ink)', borderBottom: '1px solid var(--op-line)', background: pop ? 'var(--op-indigo-soft)' : 'transparent' }}>
                    {t}{pop && <span className="ml-1 rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: 'var(--op-indigo)', color: '#fff' }}>Popular</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={row.label}>
                <td className="px-6 py-3.5 text-[14px]" style={{ color: 'var(--op-ink)', borderBottom: ri < ROWS.length - 1 ? '1px solid var(--op-line)' : 'none' }}>{row.label}</td>
                {row.values.map((v, ci) => {
                  const pop = ci === 1;
                  return (
                    <td key={ci} className="px-4 py-3.5 text-center align-middle"
                      style={{ borderBottom: ri < ROWS.length - 1 ? '1px solid var(--op-line)' : 'none', background: pop ? 'color-mix(in srgb, var(--op-indigo-soft) 45%, transparent)' : 'transparent' }}>
                      <CellView v={v} pop={pop} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
