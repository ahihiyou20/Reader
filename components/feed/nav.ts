'use client';
// Imperative navigation shared by the feed gestures, buttons and keyboard (docs/02 §5).
// Offsets live in motion values, never in React state, so dragging does not re-render.
import { animate, motionValue, type MotionValue } from 'framer-motion';
import { startTransition } from 'react';
import { clamp, prefersReducedMotion, springFor } from '@/lib/motion';
import { useUI, type View } from '@/stores/ui';

export const layout = { w: 390, h: 844, total: 1 };
export const feedY = motionValue(0);
/** 0 = cover, 1 = details, 2 = comments & apply, for the active article (drives the chrome). */
export const chromeP = motionValue(0);

const xs = new Map<string, MotionValue<number>>();
export function viewX(slug: string): MotionValue<number> {
  let x = xs.get(slug);
  if (!x) {
    x = motionValue(-(useUI.getState().views[slug] ?? 0) * layout.w);
    xs.set(slug, x);
  }
  return x;
}

export function relayout(w: number, h: number) {
  layout.w = w;
  layout.h = h;
  const { index, views } = useUI.getState();
  feedY.stop();
  feedY.set(-index * h);
  for (const [slug, x] of xs) {
    x.stop();
    x.set(-(views[slug] ?? 0) * w);
  }
}

const fadeEls = new Map<string, HTMLElement>();
export function registerFade(key: string, el: HTMLElement | null) {
  if (el) fadeEls.set(key, el);
  else fadeEls.delete(key);
}
function fade(key: string) {
  fadeEls.get(key)?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
}

export function goToArticle(target: number, velocity = 0, instant = false) {
  const ui = useUI.getState();
  const t = clamp(target, 0, Math.max(0, layout.total - 1));
  const changed = t !== ui.index;
  if (changed) startTransition(() => useUI.getState().setIndex(t));
  if (instant || prefersReducedMotion()) {
    feedY.stop();
    feedY.set(-t * layout.h);
    if (changed && !instant) fade('feed');
    return;
  }
  animate(feedY, -t * layout.h, springFor(velocity));
}

export function setArticleView(slug: string, target: number, velocity = 0, instant = false) {
  const t = clamp(target, 0, 2) as View;
  const x = viewX(slug);
  const changed = t !== (useUI.getState().views[slug] ?? 0);
  useUI.getState().setView(slug, t);
  if (instant || prefersReducedMotion()) {
    x.stop();
    x.set(-t * layout.w);
    if (changed && !instant) fade(slug);
    return;
  }
  animate(x, -t * layout.w, springFor(velocity));
}

export function activeSlug(): string | undefined {
  return currentItems[useUI.getState().index];
}
let currentItems: string[] = [];
export function setFeedSlugs(slugs: string[]) {
  currentItems = slugs;
  layout.total = slugs.length + 1; // + end card
}
