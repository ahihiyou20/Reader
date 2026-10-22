'use client';
// Panels slide in from the right and close back to the right; sheets rise from the bottom.
// Both track the finger 1:1 when dragged to dismiss and hand the release velocity to the spring.
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion';
import { X, ChevronLeft } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { clamp, prefersReducedMotion, project, rubberband, sampleVelocity, spring } from '@/lib/motion';
import { useHistoryLayer, useT } from '../hooks';

function useDismissDrag(
  mv: MotionValue<number>,
  axis: 'x' | 'y',
  size: () => number,
  close: (velocity: number) => void,
  stay: (velocity: number) => void,
  accept?: (e: PointerEvent) => boolean,
) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      let d: null | { id: number; p0: number; o0: number; m0: number; lock: 'yes' | 'no' | null; samples: Array<{ t: number; v: number }> } =
        null;
      const down = (e: PointerEvent) => {
        if (e.button > 0 || (accept && !accept(e))) return;
        if ((e.target as Element).closest('input, textarea, select, [data-no-drag]')) return;
        d = {
          id: e.pointerId,
          p0: axis === 'x' ? e.clientX : e.clientY,
          o0: axis === 'x' ? e.clientY : e.clientX,
          m0: mv.get(),
          lock: null,
          samples: [{ t: e.timeStamp, v: axis === 'x' ? e.clientX : e.clientY }],
        };
      };
      const move = (e: PointerEvent) => {
        if (!d || e.pointerId !== d.id) return;
        const p = axis === 'x' ? e.clientX : e.clientY;
        const o = axis === 'x' ? e.clientY : e.clientX;
        const dm = p - d.p0;
        d.samples.push({ t: e.timeStamp, v: p });
        if (d.samples.length > 20) d.samples.shift();
        if (!d.lock) {
          if (Math.hypot(dm, o - d.o0) < 10) return;
          d.lock = Math.abs(dm) > Math.abs(o - d.o0) && dm > 0 ? 'yes' : 'no';
          if (d.lock === 'no') {
            d = null;
            return;
          }
          mv.stop();
          d.p0 = p;
          try {
            el.setPointerCapture(e.pointerId);
          } catch {}
          return;
        }
        const raw = d.m0 + (p - d.p0);
        mv.set(raw < 0 ? -rubberband(-raw, size()) : raw);
      };
      const up = (e: PointerEvent) => {
        if (!d || e.pointerId !== d.id) return;
        const D = d;
        d = null;
        if (D.lock !== 'yes') return;
        const v = sampleVelocity(D.samples, e.timeStamp);
        const projected = mv.get() + project(v);
        if (v > 500 || (v > -200 && projected > size() * 0.4)) close(v);
        else stay(v);
      };
      el.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      return () => {
        el.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mv, axis],
  );
}

/** Mounts children while open and during the exit animation. */
function usePresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return [mounted, () => setMounted(false)] as const;
}

export function Panel({
  open,
  onClose,
  label,
  className = '',
  title,
  header,
  children,
  closeIcon = 'back',
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  className?: string;
  title?: string;
  header?: ReactNode;
  children: ReactNode;
  closeIcon?: 'back' | 'x' | 'none';
}) {
  const t = useT();
  const [mounted, unmount] = usePresence(open);
  const x = useMotionValue(10_000);
  const ref = useRef<HTMLDivElement>(null);
  const width = () => ref.current?.clientWidth ?? 400;
  useHistoryLayer(open, onClose);

  useEffect(() => {
    if (!mounted) return;
    const w = width();
    if (open) {
      if (x.get() > w) x.set(w);
      if (prefersReducedMotion()) x.set(0);
      else animate(x, 0, spring.default);
    } else {
      if (prefersReducedMotion()) {
        x.set(w);
        unmount();
      } else animate(x, w, { ...spring.default, onComplete: unmount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);

  const drag = useDismissDrag(
    x,
    'x',
    width,
    (v) => {
      animate(x, width(), { ...spring.default, velocity: v });
      onClose();
    },
    (v) => animate(x, 0, { ...spring.sheet, velocity: v }),
    (e) => !(e.target as Element).closest('.chips.scroll, .carousel, [data-no-drag]'),
  );
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      cleanup.current?.();
      cleanup.current = drag(el) ?? undefined;
    },
    [drag],
  );
  const cleanup = useRef<(() => void) | undefined>(undefined);

  if (!mounted) return null;
  return (
    <motion.div
      ref={setRef}
      className={`panel ${className}`}
      style={{ x }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      inert={!open || undefined}
    >
      {(title !== undefined || header || closeIcon !== 'none') && (
        <div className="phead">
          {closeIcon !== 'none' && (
            <button className="iconbtn" type="button" onClick={onClose} aria-label={closeIcon === 'x' ? t('close') : t('back')}>
              {closeIcon === 'x' ? <X className="ic" aria-hidden="true" /> : <ChevronLeft className="ic" aria-hidden="true" />}
            </button>
          )}
          {header ?? <h2>{title}</h2>}
        </div>
      )}
      {children}
    </motion.div>
  );
}

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const [mounted, unmount] = usePresence(open);
  const y = useMotionValue(10_000);
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const height = () => ref.current?.clientHeight ?? 500;
  const backdrop = useTransform(y, (v) => clamp(1 - v / Math.max(1, height()), 0, 1));
  useHistoryLayer(open, onClose);

  useEffect(() => {
    if (!mounted) return;
    const h = height();
    if (open) {
      if (y.get() > h) y.set(h);
      if (prefersReducedMotion()) y.set(0);
      else animate(y, 0, spring.default);
      const first = ref.current?.querySelector<HTMLElement>('button, a, input, textarea');
      first?.focus({ preventScroll: true });
    } else {
      if (prefersReducedMotion()) {
        y.set(h);
        unmount();
      } else animate(y, h, { ...spring.default, onComplete: unmount });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);

  const drag = useDismissDrag(
    y,
    'y',
    height,
    (v) => {
      animate(y, height(), { ...spring.sheet, velocity: v });
      onClose();
    },
    (v) => animate(y, 0, { ...spring.sheet, velocity: v }),
    // Drag from the content only when it is scrolled to the top.
    (e) => (e.target as Element).closest('.sgrab') !== null || (body.current?.scrollTop ?? 0) <= 0,
  );
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      cleanup.current?.();
      cleanup.current = drag(el) ?? undefined;
    },
    [drag],
  );

  if (!mounted) return null;
  return (
    <>
      <motion.div className="backdrop" style={{ opacity: backdrop }} onClick={onClose} aria-hidden="true" />
      <motion.div ref={setRef} className="sheet" style={{ y }} role="dialog" aria-modal="true" aria-label={label} inert={!open || undefined}>
        <div className="sgrab" aria-hidden="true">
          <i />
        </div>
        <div className="sbody" ref={body}>
          {children}
        </div>
      </motion.div>
    </>
  );
}
