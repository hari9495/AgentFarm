'use client';

/**
 * Option A — changelog adapted from 21st.dev `shadcnblockscom/changelog-1`:
 * a sticky-scroll timeline where the version + date rail sticks on the left and
 * the release detail scrolls on the right. Operations Console palette; keeps the
 * status filter + status pills + tags. Badge/Button reduced to native + op tokens.
 */

import { useState } from 'react';
import Link from 'next/link';
import { statusStyle, filterEntries, type ChangelogEntry } from './changelog-shared';

export default function ChangelogTimeline({ entries, filters }: { entries: readonly ChangelogEntry[]; filters: readonly string[] }) {
  const [filter, setFilter] = useState('All');
  const shown = filterEntries(entries, filter);

  return (
    <div className="op-wrap-narrow">
      <div className="mb-10 flex flex-wrap gap-2">
        {filters.map((f) => {
          const on = filter === f;
          return (
            <button key={f} onClick={() => setFilter(f)} className="rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors"
              style={{ background: on ? 'var(--op-indigo)' : 'var(--op-paper)', color: on ? '#fff' : 'var(--op-muted)', border: on ? 'none' : '1px solid var(--op-line)' }}>
              {f}
            </button>
          );
        })}
      </div>

      <div className="space-y-14 md:space-y-16">
        {shown.map((entry, i) => {
          const sc = statusStyle[entry.status] ?? statusStyle.planned;
          const body = entry.summary ?? entry.description;
          return (
            <div key={`${entry.title}-${i}`} className="relative flex flex-col gap-4 md:flex-row md:gap-12">
              <div className="top-24 flex h-min w-56 shrink-0 flex-wrap items-center gap-2 md:sticky">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                {entry.version && <span className="font-[family-name:var(--font-mono)] text-[13px] font-semibold" style={{ color: 'var(--op-indigo)' }}>{entry.version}</span>}
                <span className="text-[12px] font-medium" style={{ color: 'var(--op-muted)' }}>{entry.date}</span>
              </div>
              <div className="flex flex-col">
                {entry.versionSlug ? (
                  <Link href={`/changelog/${entry.versionSlug}`}><h2 className="mb-2 text-[18px] font-bold leading-tight transition-colors hover:text-[color:var(--op-indigo)] md:text-2xl" style={{ color: 'var(--op-ink)' }}>{entry.title}</h2></Link>
                ) : (
                  <h2 className="mb-2 text-[18px] font-bold leading-tight md:text-2xl" style={{ color: 'var(--op-ink)' }}>{entry.title}</h2>
                )}
                {body && <p className="text-[14px] md:text-[15px]" style={{ lineHeight: 1.55, color: 'var(--op-muted)' }}>{body}</p>}
                {entry.highlights && entry.highlights.length > 0 && (
                  <ul className="mt-4 ml-4 space-y-1.5 text-[14px]" style={{ color: 'var(--op-muted)' }}>
                    {entry.highlights.map((h) => <li key={h} className="list-disc" style={{ lineHeight: 1.5 }}>{h}</li>)}
                  </ul>
                )}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {entry.tags.map((tag) => <span key={tag} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{tag}</span>)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
