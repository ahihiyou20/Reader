'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { translate, type MessageKey, type Vars } from '@/lib/i18n';
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
