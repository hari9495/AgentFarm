'use client';

/**
 * StatusPulse — a small live indicator. A solid dot with a slow expanding ring
 * that fades out, so "live / running / online" reads as genuinely active.
 * Reduced-motion shows just the solid dot.
 */

import { motion, useReducedMotion } from 'motion/react';

export function StatusPulse({ color = 'var(--op-approved)', size = 8 }: { color?: string; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {!reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: color }}
          initial={{ scale: 1, opacity: 0.55 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1.8, ease: 'easeOut', repeat: Infinity }}
        />
      )}
      <span className="relative inline-flex rounded-full" style={{ width: size, height: size, background: color }} />
    </span>
  );
}
