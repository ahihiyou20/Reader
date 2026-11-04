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

/**
 * Timing tokens in ms (ARCHITECTURE.md §3). app/globals.css mirrors each as `--dur-<key>`;
 * tests/unit/motion-tokens.test.ts keeps the two in sync and inside the craft bands.
 */
export const dur = {
  press: 120, // :active feedback
  release: 200, // back to rest after a press
  hover: 150,
  focus: 120,
  small: 180, // menus, popovers, toasts entering
  exit: 120, // the same leaving
  medium: 250, // heading settle, section focus
  count: 220, // CountRoll digit slide
  fill: 260, // like/save fill
  draw: 220, // checklist tick stroke
  crossfade: 160, // reduced-motion and no-View-Transition fallback
  decode: 400, // image fade-in once decoded
  stage: 420, // stage change (rotation) View Transition
  sweep: 600, // KEY POINT and marker sweep
} as const;

/** Delay between items of a group entrance, in ms (30–80 band). */
export const stagger = { list: 40, menu: 20 } as const;

/** :active scale for pressable things. */
export const pressScale = { icon: 0.96, card: 0.98 } as const;

/** CSS `linear()` of spring.default (critically damped, response 0.4 s) sampled over dur.stage. */
export const springCSS =
  'linear(0 0%, 0.065 6.3%, 0.2 12.5%, 0.351 18.8%, 0.491 25%, 0.61 31.3%, 0.707 37.5%, 0.783 43.8%, 0.841 50%, 0.885 56.3%, 0.917 62.5%, 0.941 68.8%, 0.958 75%, 0.97 81.3%, 0.979 87.5%, 0.985 93.8%, 1 100%)';

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
