'use client';

/**
 * Option B — careers listing, adapted from 21st.dev `educalvolpz/job-listing`:
 * shared-layout (layoutId) cards that expand on click into a detail panel with
 * the full role description + Apply. Retinted to the op palette; the component's
 * usehooks-ts dependency is inlined as a tiny click-outside effect.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { ArrowRight, MapPin, Clock } from 'lucide-react';

export interface Role {
  title: string;
  department: string;
  location: string;
  type: string;
  description: string;
  href: string;
}

export default function CareersCards({ roles }: { roles: Role[] }) {
  const [active, setActive] = useState<Role | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setActive(null); }
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setActive(null); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClick); };
  }, []);

  return (
    <div className="op-wrap-narrow relative">
      <AnimatePresence>
        {active && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 backdrop-blur-sm" style={{ background: 'rgba(16,24,40,0.14)' }} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <motion.div ref={ref} layoutId={`role-${active.title}`} className="flex w-full max-w-lg flex-col gap-4 p-6" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', borderRadius: 16, boxShadow: '0 30px 70px -30px rgba(16,24,40,0.35)' }}>
              <div className="flex items-center gap-3">
                <motion.span layoutId={`role-badge-${active.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{active.department.slice(0, 2).toUpperCase()}</motion.span>
                <div>
                  <motion.p layoutId={`role-title-${active.title}`} className="text-[16px] font-semibold" style={{ color: 'var(--op-ink)' }}>{active.title}</motion.p>
                  <motion.p layoutId={`role-meta-${active.title}`} className="text-[12px]" style={{ color: 'var(--op-muted)' }}>{active.department} · {active.location} · {active.type}</motion.p>
                </div>
              </div>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[14px]" style={{ lineHeight: 1.55, color: 'var(--op-ink-soft)' }}>{active.description}</motion.p>
              <Link href={active.href} className="inline-flex w-fit items-center gap-1.5 rounded-full px-5 py-2 text-[14px] font-medium text-white" style={{ background: 'var(--op-indigo)' }}>Apply for this role <ArrowRight className="h-4 w-4" /></Link>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-3">
        {roles.map((r) => (
          <motion.button key={r.title} layoutId={`role-${r.title}`} onClick={() => setActive(r)} className="op-lift flex w-full items-center gap-4 p-4 text-left" style={{ background: 'var(--op-paper)', border: '1px solid var(--op-line)', borderRadius: 12 }}>
            <motion.span layoutId={`role-badge-${r.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-[13px] font-bold" style={{ background: 'var(--op-indigo-soft)', color: 'var(--op-indigo)' }}>{r.department.slice(0, 2).toUpperCase()}</motion.span>
            <div className="min-w-0 flex-1">
              <motion.p layoutId={`role-title-${r.title}`} className="text-[15px] font-semibold" style={{ color: 'var(--op-ink)' }}>{r.title}</motion.p>
              <motion.p layoutId={`role-meta-${r.title}`} className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]" style={{ color: 'var(--op-muted)' }}>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{r.location}</span>
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{r.type}</span>
                <span>{r.department}</span>
              </motion.p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0" style={{ color: 'var(--op-muted)' }} />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
