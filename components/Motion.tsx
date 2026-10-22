'use client';
// Elements whose transform/opacity follow MotionValues, written straight to the DOM (no React render
// per frame, docs/03 §5.1 rule 10). Lighter than framer-motion's motion components: we only need
// motion values, `animate()` and `useTransform()` from the library.
import { isMotionValue, type MotionValue } from 'framer-motion';
import { createElement, forwardRef, useCallback, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes } from 'react';

type MV = MotionValue<number>;
export interface MotionStyle extends Omit<CSSProperties, 'opacity' | 'scale' | 'x' | 'y'> {
  x?: MV | number;
  y?: MV | number;
  scale?: MV | number;
  opacity?: MV | number;
}
type Props = Omit<HTMLAttributes<HTMLElement>, 'style'> & { style?: MotionStyle; inert?: boolean };

const val = (v: MV | number | undefined, d: number) => (v === undefined ? d : isMotionValue(v) ? v.get() : v);

function make(tag: 'div' | 'nav' | 'h2') {
  return forwardRef<HTMLElement, Props>(function MotionElement({ style = {}, ...rest }, forwarded) {
    const { x, y, scale, opacity, ...css } = style;
    const node = useRef<HTMLElement | null>(null);
    const apply = useCallback(() => {
      const el = node.current;
      if (!el) return;
      const tx = val(x, 0);
      const ty = val(y, 0);
      const s = val(scale, 1);
      el.style.transform = tx || ty || s !== 1 ? `translate3d(${tx}px, ${ty}px, 0)${s !== 1 ? ` scale(${s})` : ''}` : '';
      if (opacity !== undefined) el.style.opacity = String(val(opacity, 1));
    }, [x, y, scale, opacity]);
    useLayoutEffect(() => {
      apply();
      const offs = [x, y, scale, opacity].filter(isMotionValue).map((v) => (v as MV).on('change', apply));
      return () => offs.forEach((off) => off());
    }, [apply, x, y, scale, opacity]);
    const ref = useCallback(
      (el: HTMLElement | null) => {
        node.current = el;
        if (typeof forwarded === 'function') forwarded(el);
        else if (forwarded) forwarded.current = el;
      },
      [forwarded],
    );
    return createElement(tag, { ...rest, ref, style: css });
  });
}

export const MDiv = make('div');
export const MNav = make('nav');
export const MH2 = make('h2');
