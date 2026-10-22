'use client';
import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/lib/motion';

/** Double-tap heart at the touch point (docs/03 §5.3). */
export function BigHeart({ x, y, onDone }: { x: number; y: number; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    const a = el.animate(
      reduce
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: 'scale(0.6)' },
            { opacity: 1, transform: 'scale(1.1)', offset: 0.25 },
            { opacity: 1, transform: 'scale(1)', offset: 0.4 },
            { opacity: 1, transform: 'scale(1)', offset: 0.75 },
            { opacity: 0, transform: 'scale(1) translateY(-24px)' },
          ],
      { duration: 820, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' },
    );
    a.onfinish = onDone;
    return () => a.cancel();
  }, [onDone]);
  return (
    <div className="bigheart" ref={ref} style={{ left: x, top: y }} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    </div>
  );
}
