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

// Gestures settle on a spring that runs on the main thread. The store (index, view) changes only once
// the spring has landed: committing it at release mounts the next article mid-slide, which blocks the
// main thread for 100 ms or more on phones and makes the slide stall, then jump (seen in iOS Safari).
// While a slide is in flight, gestures read the target from targetArticle() / targetView().
let inFlightTarget: number | null = null;
export function targetArticle(): number {
  return inFlightTarget ?? useUI.getState().index;
}

/** A new touch interrupts the slide: commit its target now so the pages around it are mounted. */
export function commitInFlight() {
  if (inFlightTarget === null) return;
  const t = inFlightTarget;
  inFlightTarget = null;
  useUI.getState().setIndex(t);
}

const viewTargets = new Map<string, View>();
export function targetView(slug: string): View {
  return viewTargets.get(slug) ?? useUI.getState().views[slug] ?? 0;
}

export function goToArticle(target: number, velocity = 0, instant = false) {
  const ui = useUI.getState();
  const t = clamp(target, 0, Math.max(0, layout.total - 1));
  const changed = t !== ui.index;
  const velocityInPages = -velocity / Math.max(1, layout.h);
  if (instant || prefersReducedMotion()) {
    inFlightTarget = null;
    feedP.stop();
    feedP.set(t);
    if (changed) ui.setIndex(t);
    if (changed && !instant) fade('feed');
    return;
  }
  inFlightTarget = t;
  animate(feedP, t, { ...springFor(velocity), velocity: velocityInPages }).then(() => {
    if (inFlightTarget !== t) return;
    inFlightTarget = null;
    useUI.getState().setIndex(t);
  });
}

export function setArticleView(slug: string, target: number, velocity = 0, instant = false) {
  const t = clamp(target, 0, 2) as View;
  const p = viewP(slug);
  const changed = t !== (useUI.getState().views[slug] ?? 0);
  const velocityInPages = -velocity / Math.max(1, layout.w);
  if (instant || prefersReducedMotion()) {
    viewTargets.delete(slug);
    p.stop();
    p.set(t);
    useUI.getState().setView(slug, t);
    if (changed && !instant) fade(slug);
    return;
  }
  viewTargets.set(slug, t);
  animate(p, t, { ...springFor(velocity), velocity: velocityInPages }).then(() => {
    if (viewTargets.get(slug) !== t) return;
    viewTargets.delete(slug);
    useUI.getState().setView(slug, t);
  });
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
