'use client';

/**
 * Shared comparison table — generalized from 21st.dev `kokonutd/pricing-table`:
 * clickable column headers that highlight a column, a matrix of cells that can
 * be values (text) or 'yes'/'no'/'partial' (rendered as icons). Operations
 * Console palette. Used for the pricing value matrix and the compare matrix.
 */

import * as React from 'react';
import { Check, X, Minus } from 'lucide-react';

export type Cell = string; // any text, or 'yes' | 'no' | 'partial'
export interface ComparisonColumn { key: string; label: string; highlight?: boolean }
export interface ComparisonRow { label: string; cells: Cell[] }

function CellView({ v }: { v: Cell }) {
  if (v === 'yes') return <Check className="mx-auto h-5 w-5" style={{ color: 'var(--op-indigo)' }} strokeWidth={2.4} />;
  if (v === 'no') return <X className="mx-auto h-5 w-5" style={{ color: 'var(--op-line-strong, #aeb6b4)' }} />;
  if (v === 'partial') return <Minus className="mx-auto h-5 w-5" style={{ color: 'var(--op-pending)' }} />;
  return <span className="text-[13px]" style={{ color: 'var(--op-ink-soft)' }}>{v}</span>;
}

export default function ComparisonTable({ columns, rows, selectable = true, defaultSelected }: {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  selectable?: boolean;
  defaultSelected?: string;
}) {
  const initial = defaultSelected ?? columns.find((c) => c.highlight)?.key ?? columns[0]?.key;
  const [selected, setSelected] = React.useState<string>(initial);

  return (
    <div className="mx-auto max-w-4xl overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--op-line)' }}>
      <div className="min-w-[640px]">
        {/* header */}
        <div className="grid" style={{ gridTemplateColumns: `minmax(0,1.4fr) repeat(${columns.length}, minmax(0,1fr))`, background: 'var(--op-paper)', borderBottom: '1px solid var(--op-line)' }}>
          <div className="p-4 text-[13px] font-semibold" style={{ color: 'var(--op-muted)' }}>Features</div>
          {columns.map((col) => {
            const on = selected === col.key;
            const Comp = selectable ? 'button' : 'div';
            return (
              <Comp key={col.key} {...(selectable ? { type: 'button', onClick: () => setSelected(col.key) } : {})}
                className="p-4 text-center text-[13px] font-bold"
                style={{ color: on || col.highlight ? 'var(--op-indigo)' : 'var(--op-ink)', background: on ? 'var(--op-indigo-soft)' : col.highlight ? 'color-mix(in srgb, var(--op-indigo-soft) 45%, transparent)' : 'transparent', cursor: selectable ? 'pointer' : 'default' }}>
                {col.label}
              </Comp>
            );
          })}
        </div>
        {/* rows */}
        {rows.map((row, ri) => (
          <div key={row.label} className="grid items-center" style={{ gridTemplateColumns: `minmax(0,1.4fr) repeat(${columns.length}, minmax(0,1fr))`, borderTop: ri === 0 ? 'none' : '1px solid var(--op-line)', background: ri % 2 === 0 ? 'var(--op-paper)' : 'var(--op-paper-2)' }}>
            <div className="p-4 text-[14px]" style={{ color: 'var(--op-ink)' }}>{row.label}</div>
            {columns.map((col, ci) => {
              const on = selected === col.key;
              return (
                <div key={col.key} className="p-4 text-center" style={{ background: on ? 'color-mix(in srgb, var(--op-indigo-soft) 40%, transparent)' : 'transparent' }}>
                  <CellView v={row.cells[ci]} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
