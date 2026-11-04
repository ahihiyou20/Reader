'use client';
import { motion } from 'framer-motion';
import { prefersReducedMotion, spring } from '@/lib/motion';

/**
 * Selection marker. Render it inside the selected item only; every Indicator with the same layoutId
 * is one shared element, so framer-motion slides it from the old item to the new one on a spring.
 */
export function Indicator({ layoutId, className = '' }: { layoutId: string; className?: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      className={`indicator ${className}`}
      data-indicator=""
      aria-hidden="true"
      transition={prefersReducedMotion() ? { duration: 0 } : spring.default}
    />
  );
}
