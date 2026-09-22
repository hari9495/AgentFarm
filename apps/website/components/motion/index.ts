/**
 * Motion system — the shared interaction layer for the whole product.
 * Import from '@/components/motion'. Every primitive is reduced-motion-safe
 * and grounded in Apple's fluid-interface springs (see springs.ts).
 */

export { spring, easeOut, projectMomentum } from './springs';
export { Reveal, RevealGroup, RevealItem } from './Reveal';
export { MotionButton, MotionCard, pressable } from './Pressable';
export { Skeleton, SkeletonCard } from './Skeleton';
export { StatusPulse } from './StatusPulse';
export { PageTransition } from './PageTransition';
export { Sheet } from './Sheet';
export { AnimatedNumber } from '@/components/ui/AnimatedNumber';
