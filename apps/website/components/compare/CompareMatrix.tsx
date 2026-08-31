/**
 * Compare — Option A (full matrix). AgentFarms vs Copilot / Contractor / Hire
 * across all rows. Operations Console palette; AgentFarms column highlighted.
 */

import { CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { rows, cols, type Value } from './compare-data';

function Cell({ v }: { v: Value }) {
  if (v === 'yes') return <CheckCircle className="mx-auto h-5 w-5" style={{ color: 'var(--op-indigo)' }} />;
  if (v === 'partial') return <MinusCircle className="mx-auto h-5 w-5" style={{ color: 'var(--op-pending)' }} />;
  return <XCircle className="mx-auto h-5 w-5" style={{ color: 'var(--op-line-strong, #aeb6b4)' }} />;
}

export default function CompareMatrix() {
  return (
    <div className="op-wrap">
      <div className="mx-auto max-w-4xl overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--op-line)' }}>
        <div className="min-w-[680px]">
          {/* header */}
          <div className="grid grid-cols-5" style={{ background: 'var(--op-paper)', borderBottom: '1px solid var(--op-line)' }}>
            <div className="p-4"><span className="text-[13px] font-semibold" style={{ color: 'var(--op-muted)' }}>Feature</span></div>
            {cols.map((col) => (
              <div key={col.key} className="p-4 text-center" style={col.highlight ? { background: 'var(--op-indigo-soft)' } : {}}>
                <span className="text-[13px] font-bold" style={{ color: col.highlight ? 'var(--op-indigo)' : 'var(--op-ink)' }}>{col.label}</span>
              </div>
            ))}
          </div>
          {/* rows */}
          {rows.map((row, i) => (
            <div key={row.feature} className="grid grid-cols-5 items-center" style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--op-line)' : 'none', background: i % 2 === 0 ? 'var(--op-paper)' : 'var(--op-paper-2)' }}>
              <div className="p-4"><span className="text-[14px]" style={{ color: 'var(--op-ink)' }}>{row.feature}</span></div>
              {cols.map((col) => (
                <div key={col.key} className="p-4" style={col.highlight ? { background: 'color-mix(in srgb, var(--op-indigo-soft) 55%, transparent)' } : {}}>
                  <Cell v={row[col.key]} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* legend */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-muted)' }}><CheckCircle className="h-4 w-4" style={{ color: 'var(--op-indigo)' }} /> Yes / Supported</span>
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-muted)' }}><MinusCircle className="h-4 w-4" style={{ color: 'var(--op-pending)' }} /> Partial</span>
        <span className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--op-muted)' }}><XCircle className="h-4 w-4" style={{ color: 'var(--op-line-strong, #aeb6b4)' }} /> Not supported</span>
      </div>
    </div>
  );
}
