'use client';
import { useEffect, useRef, useState } from 'react';
import { useUI } from '@/stores/ui';
import { animate, useMotionValue } from 'framer-motion';
import { sampleVelocity, spring } from '@/lib/motion';

export function Toast() {
  const toast = useUI((s) => s.toast);
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const y = useMotionValue(120);
  const opacity = useMotionValue(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      el.style.transform = `translate(-50%, ${y.get()}px)`;
      el.style.opacity = String(opacity.get());
    };
    const offY = y.on('change', update);
    const offOp = opacity.on('change', update);
    return () => {
      offY();
      offOp();
    };
  }, [y, opacity]);

  useEffect(() => {
    if (!toast?.text) return;
    setText(toast.text);
    setShow(true);
    y.set(120);
    opacity.set(1);
    animate(y, 0, spring.sheet);

    const id = setTimeout(() => {
      animate(opacity, 0, { duration: 0.25, onComplete: () => setShow(false) });
    }, 2400);

    return () => clearTimeout(id);
  }, [toast, y, opacity]);

  // Touch handlers for swipe down
  useEffect(() => {
    const el = ref.current;
    if (!el || !show) return;

    let startY = 0;
    let startOffsetY = 0;
    let samples: Array<{ t: number; v: number }> = [];

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      startOffsetY = y.get();
      samples = [{ t: e.timeStamp, v: startY }];
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const cy = e.touches[0].clientY;
      const dy = cy - startY;
      samples.push({ t: e.timeStamp, v: cy });
      if (samples.length > 10) samples.shift();
      if (dy > 0) {
        y.set(startOffsetY + dy);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const v = sampleVelocity(samples, e.timeStamp);
      const dy = y.get() - startOffsetY;
      if (dy > 40 || v > 200) {
        // Carry out and dismiss
        animate(y, y.get() + 200, { ...spring.sheet, velocity: v });
        animate(opacity, 0, { duration: 0.2, onComplete: () => setShow(false) });
      } else {
        // Snap back
        animate(y, 0, spring.sheet);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [show, y, opacity]);

  return (
    <div
      ref={ref}
      className={`toast${show ? ' show' : ''}`}
      role="status"
      aria-live="polite"
      style={{
        pointerEvents: show ? 'auto' : 'none',
        touchAction: 'none',
        transition: 'none',
        transform: `translate(-50%, ${y.get()}px)`,
        opacity: opacity.get(),
      }}
    >
      {text}
    </div>
  );
}
