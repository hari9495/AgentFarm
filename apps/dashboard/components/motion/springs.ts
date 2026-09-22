/**
 * Shared spring presets — the physical backbone of the motion system.
 *
 * Grounded in Apple's "Designing Fluid Interfaces" (WWDC 2018): springs are
 * interruptible and velocity-aware, so motion can be grabbed and reversed
 * mid-flight. Default UI is critically damped (bounce 0); bounce is reserved for
 * momentum-driven interactions (a flick, a drag release) — never for something
 * that merely faded in.
 *
 * Motion's `bounce` + `duration` map to Apple's damping + response.
 */

import type { Transition } from 'motion/react';

export const spring = {
  /** Default UI move/settle — critically damped, no overshoot (Apple: damping 1.0 / response 0.4). */
  smooth: { type: 'spring', bounce: 0, duration: 0.4 },
  /** Snappy press/toggle feedback. */
  snappy: { type: 'spring', bounce: 0, duration: 0.26 },
  /** Momentum interaction (flick/drag release) — a little bounce, only because a gesture preceded it. */
  momentum: { type: 'spring', bounce: 0.22, duration: 0.42 },
  /** Gentle content arrival (reveals) — calm, non-distracting. */
  gentle: { type: 'spring', bounce: 0, duration: 0.55 },
  /** Drawer / sheet (Apple: damping 0.8 / response 0.3). */
  sheet: { type: 'spring', bounce: 0.18, duration: 0.34 },
} satisfies Record<string, Transition>;

/** The op-system entrance easing, for the rare CSS/tween case. */
export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Momentum projection (Apple's exact decay form) — where a flick would come to rest. */
export function projectMomentum(velocity: number, decelerationRate = 0.998): number {
  return (velocity / 1000) * (decelerationRate / (1 - decelerationRate));
}
