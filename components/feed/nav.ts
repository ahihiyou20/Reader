'use client';
// Imperative navigation shared by the feed gestures, buttons and keyboard (docs/02 §5).
// Offsets live in motion values, never in React state, so dragging does not re-render.
import { animate, motionValue, type MotionValue } from 'framer-motion';
import { clamp, prefersReducedMotion, springFor } from '@/lib/motion';
import { useUI, type View } from '@/stores/ui';

export const layout = { w: 390, h: 844, total: 1 };
export const feedP = motionValue(0);
/** 0 = cover, 1 = details, 2 = comments & apply, for the active article (drives the chrome). */
export const chromeP = motionValue(0);

const ps = new Map<string, MotionValue<number>>();
export function viewP(slug: string): MotionValue<number> {
  let p = ps.get(slug);
  if (!p) {
    p = motionValue<number>(useUI.getState().views[slug] ?? 0);
    ps.set(slug, p);
  }
  return p;
}

export function relayout(w: number, h: number) {
  layout.w = w;
  layout.h = h;
}

const fadeEls = new Map<string, HTMLElement>();
export function registerFade(key: string, el: HTMLElement | null) {
  if (el) fadeEls.set(key, el);
  else fadeEls.delete(key);
}
function fade(key: string) {
  fadeEls.get(key)?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
}

let inFlightTarget: number | null = null;
export function targetArticle(): number {
  return inFlightTarget ?? useUI.getState().index;
}

export function goToArticle(target: number, velocity = 0, instant = false) {
  const ui = useUI.getState();
  const t = clamp(target, 0, Math.max(0, layout.total - 1));
  inFlightTarget = t;
  const changed = t !== ui.index;
  if (changed) useUI.getState().setIndex(t);
  const velocityInPages = -velocity / Math.max(1, layout.h);
  if (instant || prefersReducedMotion()) {
    feedP.stop();
    feedP.set(t);
    inFlightTarget = null;
    if (changed && !instant) fade('feed');
    return;
  }
  const anim = animate(feedP, t, { ...springFor(velocity), velocity: velocityInPages });
  anim.then(() => {
    if (inFlightTarget === t) inFlightTarget = null;
  });
}

export function setArticleView(slug: string, target: number, velocity = 0, instant = false) {
  const t = clamp(target, 0, 2) as View;
  const p = viewP(slug);
  const changed = t !== (useUI.getState().views[slug] ?? 0);
  useUI.getState().setView(slug, t);
  const velocityInPages = -velocity / Math.max(1, layout.w);
  if (instant || prefersReducedMotion()) {
    p.stop();
    p.set(t);
    if (changed && !instant) fade(slug);
    return;
  }
  animate(p, t, { ...springFor(velocity), velocity: velocityInPages });
}

let currentItems: readonly { slug: string }[] | string[] = [];
export function setFeedSlugs(items: string[] | readonly { slug: string }[]) {
  currentItems = items;
  layout.total = items.length + 1; // + end card
}
export function activeSlug(): string | undefined {
  const item = currentItems[useUI.getState().index];
  return typeof item === 'string' ? item : item?.slug;
}
