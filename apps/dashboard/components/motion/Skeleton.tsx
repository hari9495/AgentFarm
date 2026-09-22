'use client';

/**
 * Skeleton — a loading placeholder that reads as "content is arriving," not
 * "the app froze." A slow, low-contrast shimmer sweeps across; reduced-motion
 * shows a static tinted block (the shimmer is a comprehension aid, not essential).
 */

import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/app/lib/utils';

export function Skeleton({ className, rounded = 'rounded-lg' }: { className?: string; rounded?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('relative overflow-hidden', rounded, className)} style={{ background: 'var(--bg-deep)' }} aria-hidden>
      {!reduce && (
        <motion.div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)' }}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.35 }}
        />
      )}
    </div>
  );
}

/** A common "card is loading" cluster: title line + two body lines. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl p-6', className)} style={{ background: 'var(--card)', border: '1px solid var(--line)' }}>
      <Skeleton className="h-10 w-10" rounded="rounded-xl" />
      <Skeleton className="mt-5 h-4 w-2/3" />
      <Skeleton className="mt-2.5 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
    </div>
  );
}
