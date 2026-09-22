'use client';

/**
 * Sheet — a physical drawer you can throw closed with a flick.
 *
 * Apple "Designing Fluid Interfaces": tracks the pointer 1:1 while dragging,
 * then dismisses on *velocity* (a fast flick closes even from a small drag) or
 * distance, handing the release velocity to the settle spring so there's no seam
 * between drag and animation. Rubber-bands at the closed edge. Translucent
 * material (backdrop-filter) so content reads underneath. Reduced-motion +
 * reduced-transparency degrade gracefully; Esc + scrim close; body scroll locks.
 */

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'motion/react';
import { useEffect, type ReactNode } from 'react';
import { spring } from './springs';

const DISTANCE = 120; // px past which a slow drag dismisses
const VELOCITY = 480; // px/s past which a flick dismisses regardless of distance

export function Sheet({
  open,
  onClose,
  children,
  side = 'right',
  label = 'Panel',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: 'right' | 'bottom';
  label?: string;
}) {
  const reduce = useReducedMotion();
  const axis = side === 'bottom' ? 'y' : 'x';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const closed = side === 'bottom' ? { y: '100%' } : { x: '100%' };
  const openPos = side === 'bottom' ? { y: 0 } : { x: 0 };

  function onDragEnd(_: unknown, info: PanInfo) {
    const offset = axis === 'y' ? info.offset.y : info.offset.x;
    const velocity = axis === 'y' ? info.velocity.y : info.velocity.x;
    if (offset > DISTANCE || velocity > VELOCITY) onClose();
  }

  const panelPos =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl'
      : 'inset-y-0 right-0 w-full max-w-md';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" aria-modal role="dialog" aria-label={label}>
          {/* Scrim — dims + separates, click to close */}
          <motion.div
            className="absolute inset-0"
            style={{ background: 'rgba(16,24,40,0.28)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
          />
          {/* Panel — translucent material, draggable to dismiss */}
          <motion.div
            className={`absolute overflow-y-auto ${panelPos}`}
            style={{
              background: 'color-mix(in srgb, var(--op-paper) 88%, transparent)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              borderLeft: side === 'right' ? '1px solid var(--op-line)' : undefined,
              borderTop: side === 'bottom' ? '1px solid var(--op-line)' : undefined,
              boxShadow: '0 -8px 60px -20px rgba(16,24,40,0.35)',
            }}
            initial={closed}
            animate={openPos}
            exit={closed}
            transition={spring.sheet}
            drag={reduce ? false : axis}
            dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
            dragElastic={{ top: 0.04, bottom: 0.9, left: 0.04, right: 0.9 }}
            onDragEnd={onDragEnd}
          >
            {side === 'bottom' && (
              <div className="flex justify-center pt-3" aria-hidden>
                <span className="h-1.5 w-10 rounded-full" style={{ background: 'var(--op-line-strong, #cbd2d0)' }} />
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
