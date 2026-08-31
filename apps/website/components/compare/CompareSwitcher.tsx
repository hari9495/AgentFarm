'use client';

/**
 * Compare — Option B (competitor switcher). Pick an alternative → a focused
 * AgentFarms-vs-that head-to-head across all rows, with a lead summary.
 * Operations Console palette.
 */

import * as React from 'react';
import { CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { rows, competitors, type Value, type CompareKey } from './compare-data';

function Cell({ v }: { v: Value }) {
  if (v === 'yes') return <CheckCircle className="h-5 w-5" style={{ color: 'var(--op-indigo)' }} />;
  if (v === 'partial') return <MinusCircle className="h-5 w-5" style={{ color: 'var(--op-pending)' }} />;
  return <XCircle className="h-5 w-5" style={{ color: 'var(--op-line-strong, #aeb6b4)' }} />;
}

export default function CompareSwitcher() {
  const [key, setKey] = React.useState<CompareKey>('copilot');
  const label = competitors.find((c) => c.key === key)!.label;
  const lead = rows.filter((r) => r.AgentFarms === 'yes' && r[key] !== 'yes').length;

  return (
    <div className="op-wrap-narrow">
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        <span className="mr-1 text-[13px] font-medium" style={{ color: 'var(--op-muted)' }}>AgentFarms vs</span>
        {competitors.map((c) => {
          const on = key === c.key;
          return (
            <button key={c.key} type="button" onClick={() => setKey(c.key)} className="rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
              style={on ? { background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)', border: '1px solid var(--op-indigo)' } : { color: 'var(--op-muted)', border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
              {c.label}
            </button>
          );
        })}
      </div>

      <p className="mb-6 text-center text-[15px]" style={{ color: 'var(--op-ink-soft)' }}>
        AgentFarms leads on <span className="font-bold" style={{ color: 'var(--op-indigo)' }}>{lead} of {rows.length}</span> capabilities vs {label}.
      </p>

      <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)' }}>
        <div className="grid grid-cols-[1fr_88px_88px] items-center" style={{ background: 'var(--op-paper)', borderBottom: '1px solid var(--op-line)' }}>
          <div className="p-4 text-[13px] font-semibold" style={{ color: 'var(--op-muted)' }}>Capability</div>
          <div className="p-4 text-center text-[13px] font-bold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>AgentFarms</div>
          <div className="p-4 text-center text-[13px] font-bold" style={{ color: 'var(--op-ink)' }}>{label}</div>
        </div>
        {rows.map((row, i) => {
          const wins = row.AgentFarms === 'yes' && row[key] !== 'yes';
          return (
            <div key={row.feature} className="grid grid-cols-[1fr_88px_88px] items-center" style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--op-line)' : 'none', background: wins ? 'color-mix(in srgb, var(--op-indigo-soft) 30%, transparent)' : i % 2 === 0 ? 'var(--op-paper)' : 'var(--op-paper-2)' }}>
              <div className="p-4 text-[14px]" style={{ color: 'var(--op-ink)' }}>{row.feature}</div>
              <div className="flex justify-center p-4" style={{ background: 'color-mix(in srgb, var(--op-indigo-soft) 45%, transparent)' }}><Cell v={row.AgentFarms} /></div>
              <div className="flex justify-center p-4"><Cell v={row[key]} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
