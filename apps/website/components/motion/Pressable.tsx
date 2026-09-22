'use client';

/**
 * Pressable primitives — the single biggest "a human made this" signal.
 * Feedback lives on the press (whileTap), not on release, and rides a snappy
 * critically-damped spring so it can be interrupted. Hover adds a small lift.
 *
 * MotionButton  — for buttons / chips / clickable controls.
 * MotionCard    — for interactive cards / list rows (lift + press).
 * Both auto-honor reduced motion via MotionConfig at the provider.
 */

import { motion, type HTMLMotionProps } from 'motion/react';
import { spring } from './springs';

export function MotionButton({ children, ...props }: HTMLMotionProps<'button'>) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      transition={spring.snappy}
      {...props}
    >
      {children}
    </motion.button>
  );
}

export function MotionCard({ children, lift = 4, ...props }: HTMLMotionProps<'div'> & { lift?: number }) {
  return (
    <motion.div
      whileHover={{ y: -lift }}
      whileTap={{ scale: 0.994 }}
      transition={spring.smooth}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/** Prop bundle to sprinkle press feedback onto any existing motion element. */
export const pressable = {
  whileTap: { scale: 0.96 },
  transition: spring.snappy,
} as const;
