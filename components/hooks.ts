'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { translate, type MessageKey, type Vars } from '@/lib/i18n';
import { prefersReducedMotion, stagger } from '@/lib/motion';
import { isLandscape, stageOf, STAGES, type Stage } from '@/lib/stage';
import { withStageTransition } from '@/lib/transition';
import { useUI } from '@/stores/ui';

export const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useT() {
  const lang = useUI((s) => s.lang);
  return useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, vars), [lang]);
}

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

export function useSize<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [size, setSize] = useState({ w: 390, h: 844 });
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/**
 * Ties an open layer (panel, sheet) to browser history, so the Back button or gesture closes it.
 * Closing from the UI pops our own history entry.
 */
let layerSeq = 0;
export function useHistoryLayer(open: boolean, onClose: () => void) {
  const id = useRef<number | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const my = ++layerSeq;
    id.current = my;
    history.pushState({ ...(history.state ?? {}), readerLayer: my }, '');
    const onPop = (e: PopStateEvent) => {
      const top = (e.state?.readerLayer as number | undefined) ?? 0;
      if (top < my && id.current === my) {
        id.current = null;
        close.current();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (id.current === my) {
        id.current = null;
        if (history.state?.readerLayer === my) history.back();
      }
    };
  }, [open]);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useStageSync() {
  useEffect(() => {
    const root = document.documentElement;
    const initial = root.getAttribute('data-stage') as Stage | null;
    if (initial && STAGES.includes(initial)) {
      useUI.getState().setStage(initial);
    } else {
      const s = stageOf(window.innerWidth, window.innerHeight);
      root.setAttribute('data-stage', s);
      useUI.getState().setStage(s);
    }

    // A device rotation is already animated by the system. A View Transition on top of it captures a
    // half-rotated snapshot and flashes it (iOS Safari fires several resizes while it rotates), so a
    // rotation only switches the layout; the morph is kept for window resizes (desktop, split view).
    const coarse = window.matchMedia('(pointer: coarse)');
    let orientation = screen.orientation?.type;
    let rotatedAt = -Infinity;
    const onRotate = () => (rotatedAt = performance.now());

    const sync = () => {
      const next = stageOf(window.innerWidth, window.innerHeight);
      const current = useUI.getState().stage;
      const type = screen.orientation?.type;
      if (type !== orientation || (coarse.matches && isLandscape(next) !== isLandscape(current))) onRotate();
      orientation = type;
      if (next === current) return;
      const apply = () =>
        flushSync(() => {
          root.setAttribute('data-stage', next);
          useUI.getState().setStage(next);
        });
      if (performance.now() - rotatedAt < 1000) apply();
      else void withStageTransition(apply);
    };

    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', onRotate);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', onRotate);
      vv?.removeEventListener('resize', sync);
    };
  }, []);
}

/**
 * How many items of a list to render while it arrives: the first `first` one after another,
 * `stagger.list` ms apart, then the rest at once. Starts again each time `active` turns on or `key`
 * changes; while inactive it keeps its count, so a closing panel does not empty itself.
 */
export function useStaggeredCount(total: number, active: boolean, key: unknown, first = 8): number {
  const [n, setN] = useState(0);
  useIsoLayoutEffect(() => {
    if (!active) return;
    if (!total || prefersReducedMotion()) {
      setN(total);
      return;
    }
    let shown = 1;
    // From when the first item is put up, not from the first frame after it: opening a panel can delay
    // that frame by a good part of the interval.
    let last = performance.now();
    let raf = 0;
    setN(1);
    // Timed on animation frames, as search results are: a busy main thread delays an interval and
    // then fires two of them back to back.
    const step = (now: number) => {
      if (now - last >= stagger.list) {
        last = now;
        shown++;
        if (shown >= Math.min(first, total)) return setN(total);
        setN(shown);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [total, active, key, first]);
  return n;
}
