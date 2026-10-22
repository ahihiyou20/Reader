// Motion tokens and helpers (docs/03 §5). Springs are described by bounce + duration,
// which maps to Apple's damping ratio + response.
import type { ValueAnimationTransition } from 'framer-motion';

export const spring = {
  default: { type: 'spring', bounce: 0, duration: 0.4 },
  flick: { type: 'spring', bounce: 0.15, duration: 0.4 },
  sheet: { type: 'spring', bounce: 0.2, duration: 0.3 },
  pop: { type: 'spring', bounce: 0.35, duration: 0.35 },
} satisfies Record<string, ValueAnimationTransition>;

export const FLICK = 500; // px/s

/** Where a flick would come to rest (UIScrollView deceleration rate 0.998). */
export const project = (v: number, d = 0.998) => ((v / 1000) * d) / (1 - d);

export const rubberband = (overshoot: number, dim: number, c = 0.55) =>
  (overshoot * dim * c) / (dim + c * Math.abs(overshoot));

/** Clamp with rubber-banding past the edges. */
export const rubberClamp = (v: number, min: number, max: number, dim: number) =>
  v > max ? max + rubberband(v - max, dim) : v < min ? min - rubberband(min - v, dim) : v;

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Pick the page to settle on after a drag: flicks follow the sign of the velocity, slow releases
 * follow the projected resting point. At most one page per release.
 */
export function pickPage(offset: number, velocity: number, size: number, index: number, min: number, max: number) {
  const target =
    Math.abs(velocity) >= FLICK ? index + (velocity < 0 ? 1 : -1) : Math.round(-(offset + project(velocity)) / size);
  return clamp(clamp(target, index - 1, index + 1), min, max);
}

export const springFor = (velocity: number): ValueAnimationTransition => ({
  ...(Math.abs(velocity) >= FLICK ? spring.flick : spring.default),
  velocity,
});

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Velocity (px/s) from pointer samples of the last 100 ms. */
export function sampleVelocity(samples: Array<{ t: number; v: number }>, now: number) {
  const s = samples.filter((q) => now - q.t <= 100);
  if (s.length < 2) return 0;
  const a = s[0];
  const b = s[s.length - 1];
  return (b.v - a.v) / Math.max(0.008, (b.t - a.t) / 1000);
}
