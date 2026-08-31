/**
 * Option A — careers listing, adapted from 21st.dev `shadcnblockscom/careers-4`:
 * roles grouped by department, each a row with title link + location/type pills.
 * Operations Console palette; enriched with a one-line role description.
 */

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export interface Role {
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
  href: string;
}

export default function CareersList({ heading, roles }: { heading: string; roles: Role[] }) {
  const categories = Array.from(new Set(roles.map((r) => r.department)));
  return (
    <div className="op-wrap">
      <h2 className="font-[family-name:var(--font-display)] text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ letterSpacing: '-0.025em', color: 'var(--op-ink)' }}>{heading}</h2>
      <p className="mt-2 text-[15px]" style={{ color: 'var(--op-muted)' }}>{roles.length} positions currently open</p>
      <div className="mx-auto mt-10 flex flex-col gap-12">
        {categories.map((cat) => (
          <div key={cat}>
            <h3 className="pb-4 text-lg font-bold" style={{ borderBottom: '1px solid var(--op-line)', color: 'var(--op-ink)' }}>{cat}</h3>
            {roles.filter((r) => r.department === cat).map((r) => (
              <div key={r.title} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '1px solid var(--op-line)' }}>
                <div className="min-w-0">
                  <Link href={r.href} className="text-[16px] font-semibold hover:underline" style={{ color: 'var(--op-ink)' }}>{r.title}</Link>
                  <p className="mt-1 max-w-2xl text-[13px]" style={{ lineHeight: 1.5, color: 'var(--op-muted)' }}>{r.description}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full px-3 py-1 text-[12px] font-medium" style={{ border: '1px solid var(--op-line)', color: 'var(--op-muted)' }}>{r.location}</span>
                  <span className="rounded-full px-3 py-1 text-[12px] font-medium" style={{ border: '1px solid var(--op-line)', color: 'var(--op-muted)' }}>{r.type}</span>
                  <Link href={r.href} className="inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[13px] font-medium text-white" style={{ background: 'var(--op-indigo)' }}>Apply <ArrowRight className="h-3.5 w-3.5" /></Link>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
