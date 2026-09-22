'use client';

/**
 * PageTransition — wrap a page's content so it enters as one calm move (fade +
 * small rise) instead of snapping in. Keyed by pathname so App Router route
 * changes re-trigger it. Reduced-motion → plain fade.
 */

import { motion, useReducedMotion } from 'motion/react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { spring } from './springs';

export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={spring.smooth}
    >
      {children}
    </motion.div>
  );
}
