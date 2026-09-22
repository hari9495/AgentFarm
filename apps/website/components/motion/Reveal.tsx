'use client';

/**
 * Reveal — content that arrives rather than pops. Grounded in the "hint in the
 * direction of the gesture" idea: a small upward translate + fade reads as the
 * content settling into place. Reduced-motion collapses to a plain cross-fade
 * (handled by useReducedMotion, and again by MotionConfig at the provider).
 */

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { spring } from './springs';

export function Reveal({
  children,
  className,
  delay = 0,
  y = 14,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once, margin: '-60px' }}
      transition={{ ...spring.gentle, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Wrap a list/grid; direct <RevealItem> children arrive in a gentle stagger. */
export function RevealGroup({
  children,
  className,
  stagger = 0.06,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  once?: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once, margin: '-60px' }}
      variants={{ show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className, y = 14 }: { children: ReactNode; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, y },
        show: reduce ? { opacity: 1 } : { opacity: 1, y: 0, transition: spring.gentle },
      }}
    >
      {children}
    </motion.div>
  );
}
