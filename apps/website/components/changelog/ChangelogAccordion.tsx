'use client';

/**
 * Option B — changelog adapted from 21st.dev `cnippet.dev/v-accordion-10`:
 * a collapsible per-version accordion. Version + status + date in the trigger;
 * summary, highlights, and tags in the expanded panel. Operations Console palette;
 * the radix accordion reduced to a useState open-set + motion (no radix dep).
 */

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { statusStyle, filterEntries, type ChangelogEntry } from './changelog-shared';

export default function ChangelogAccordion({ entries, filters }: { entries: readonly ChangelogEntry[]; filters: readonly string[] }) {
  const [filter, setFilter] = useState('All');
  const shown = filterEntries(entries, filter);
  const [open, setOpen] = useState<Set<number>>(new Set([0]));

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <div className="op-wrap-narrow">
      <div className="mb-8 flex flex-wrap gap-2">
        {filters.map((f) => {
          const on = filter === f;
          return (
            <button key={f} onClick={() => { setFilter(f); setOpen(new Set([0])); }} className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
              style={{ background: on ? 'var(--op-indigo)' : 'var(--op-paper)', color: on ? '#fff' : 'var(--op-muted)', border: on ? 'none' : '1px solid var(--op-line)' }}>
              {f}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid var(--op-line)', background: 'var(--op-paper)' }}>
        {shown.map((entry, i) => {
          const sc = statusStyle[entry.status] ?? statusStyle.planned;
          const isOpen = open.has(i);
          const body = entry.summary ?? entry.description;
          return (
            <div key={`${entry.title}-${i}`} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--op-line)' }}>
              <button onClick={() => toggle(i)} className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left">
                <div className="flex flex-wrap items-center gap-2.5">
                  {entry.version && <span className="font-[family-name:var(--font-mono)] text-[14px] font-semibold" style={{ color: 'var(--op-ink)' }}>{entry.version}</span>}
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                  <span className="text-[13px]" style={{ color: 'var(--op-muted)' }}>{entry.date}</span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" style={{ color: 'var(--op-muted)', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} style={{ overflow: 'hidden' }}>
                    <div className="px-6 pb-5">
                      {entry.versionSlug ? (
                        <Link href={`/changelog/${entry.versionSlug}`}><h3 className="mb-1.5 text-[16px] font-semibold transition-colors hover:text-[color:var(--op-indigo)]" style={{ color: 'var(--op-ink)' }}>{entry.title}</h3></Link>
                      ) : (
                        <h3 className="mb-1.5 text-[16px] font-semibold" style={{ color: 'var(--op-ink)' }}>{entry.title}</h3>
                      )}
                      {body && <p className="text-[14px]" style={{ lineHeight: 1.55, color: 'var(--op-muted)' }}>{body}</p>}
                      {entry.highlights && entry.highlights.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {entry.highlights.map((h) => (
                            <li key={h} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--op-muted)' }}>
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: 'var(--op-indigo)' }} />
                              <span style={{ lineHeight: 1.5 }}>{h}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {entry.tags.map((tag) => <span key={tag} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{tag}</span>)}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
