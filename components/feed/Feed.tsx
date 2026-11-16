'use client';
// FeedPager (vertical, between articles) + ArticlePager (horizontal, cover ⇄ details ⇄ comments & apply).
// Gesture rules: docs/02 §5 and docs/03 §5 — axis lock at 10 px, 1:1 tracking, momentum projection,
// velocity handoff, rubber-band at the edges, interruptible at any time.

import { m, useTransform } from 'framer-motion';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { preloadImage, prefetchArticle } from '@/lib/data';
import { pickPage, prefersReducedMotion, rubberClamp, sampleVelocity } from '@/lib/motion';
import { toggleLike, toggleSave } from '@/lib/actions';
import { preloadTitleFaces } from '@/lib/title';
import { useUI } from '@/stores/ui';
import { optCover } from '@/lib/covers';
import { coverSource } from '../CoverMedia';
import { useSize, useT } from '../hooks';
import { ArticlePage } from './ArticlePage';
import { EndCard } from './EndCard';
import {
  chromeP,
  commitInFlight,
  feedP,
  goToArticle,
  layout,
  onSlideReach,
  registerFade,
  relayout,
  setArticleView,
  setFeedSlugs,
  slideReach,
  targetArticle,
  targetView,
  viewP,
} from './nav';

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  axis: 'x' | 'y' | null;
  slug: string | undefined;
  view: number;
  w0: number;
  h0: number;
  fp: number;
  vp: number;
  samples: Array<{ t: number; x: number; y: number }>;
  target: Element;
  blockX: boolean;
}

export function Feed({ items, onDoubleTap }: { items: FeedItem[]; onDoubleTap: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(ref);
  const index = useUI((s) => s.index);
  const version = useUI((s) => s.feedVersion);
  const t = useT();
  const total = items.length + 1;
  const y = useTransform(feedP, (p) => `${-p * 100}%`);

  // Keep the shared layout in sync with the measured size and the list. The gesture handlers read
  // the list through a ref: re-binding them when the full feed replaces the head would drop a drag
  // in progress and leave the page stuck where the finger let go.
  const live = useRef({ items, onDoubleTap });
  useEffect(() => {
    setFeedSlugs(items);
    live.current = { items, onDoubleTap };
  }, [items, onDoubleTap]);
  useEffect(() => {
    relayout(w, h);
  }, [w, h]);
  useEffect(() => {
    // A new feed (Explore, Library, the menu) starts at the top without sliding there; the new first
    // article comes into focus instead of cutting in.
    feedP.stop();
    feedP.set(useUI.getState().index);
    if (version > 0 && !prefersReducedMotion())
      ref.current?.animate(
        [
          { opacity: 0, transform: 'scale(1.035)', filter: 'blur(10px)' },
          { opacity: 1, transform: 'none', filter: 'blur(0)' },
        ],
        { duration: 560, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
      );
  }, [version]);

  // The chrome (bottom nav, language pill) follows the active article's horizontal position.
  const activeSlug = items[index]?.slug;
  useEffect(() => {
    if (!activeSlug) {
      chromeP.set(0);
      return;
    }
    const p = viewP(activeSlug);
    const sync = (v: number) => chromeP.set(v);
    sync(p.get());
    return p.on('change', sync);
  }, [activeSlug]);

  // FR-04: prefetch the next two articles and their covers (deferred to idle to protect hydration & first paint).
  useEffect(() => {
    if (items[index]) prefetchArticle(items[index].slug);
    if (items[index]) preloadTitleFaces(items[index].category);
    // Title faces are small and shared by a whole category: fetch them a few covers ahead, so a cover
    // never arrives before its lettering (keys or a hard flick can pass several covers in a second).
    const ahead = () => {
      for (let k = -1; k <= 5; k++) if (items[index + k]) preloadTitleFaces(items[index + k].category);
    };

    // The same file the cover's <img> will ask for, so the swipe lands on a decoded image.
    const landscape = useUI.getState().stage.endsWith('landscape');
    const warm = (k: number) => {
      const it = items[index + k];
      if (!it) return;
      prefetchArticle(it.slug);
      const { src, srcSet, sizes } = coverSource(it.cover, optCover(it.slug), landscape);
      preloadImage(src, srcSet, sizes);
    };
    // The next cover cannot wait for idle time: a quick swipe reaches it within a second.
    warm(1);
    if (typeof window === 'undefined') return;
    if ('requestIdleCallback' in window) {
      const handle = (
        window as unknown as {
          requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(
        () => {
          ahead();
          for (const k of [2, 3, -1]) warm(k);
        },
        { timeout: 2000 },
      );
      return () => {
        if ('cancelIdleCallback' in window) {
          (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(handle);
        }
      };
    }
    const timer = setTimeout(() => {
      ahead();
      for (const k of [2, 3, -1]) warm(k);
    }, 500);
    return () => clearTimeout(timer);
  }, [index, items]);

  // ---------- Pointer gestures ----------
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let g: Gesture | null = null;
    let justDragged = false;
    let lastTap: { t: number; x: number; y: number } | null = null;
    const lastScroll = new WeakMap<Element, number>();
    const onScroll = (e: Event) => lastScroll.set(e.target as Element, performance.now());
    el.addEventListener('scroll', onScroll, { capture: true, passive: true });

    const down = (e: PointerEvent) => {
      if (e.button > 0 || g) return;
      const target = e.target as Element;
      if (target.closest('input, textarea, select, form, [data-no-drag]')) return;
      feedP.stop();
      commitInFlight();
      const ui = useUI.getState();
      const slug = live.current.items[ui.index]?.slug;
      const vp = slug ? viewP(slug) : null;
      vp?.stop();
      const scroller = target.closest('.dscroll, .escroll');
      g = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        axis: null,
        slug,
        view: slug ? targetView(slug) : 0,
        w0: layout.w,
        h0: layout.h,
        fp: feedP.get(),
        vp: vp ? vp.get() : 0,
        samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }],
        target,
        blockX: Boolean(scroller && performance.now() - (lastScroll.get(scroller) ?? 0) < 100),
      };
    };

    const move = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      g.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      if (g.samples.length > 24) g.samples.shift();
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      if (!g.axis) {
        if (Math.hypot(dx, dy) < 10) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        // Vertical drags inside Details / Comments are native scrolling.
        if (g.axis === 'y' && g.view !== 0) return abandon();
        if (g.axis === 'x' && (g.blockX || !g.slug)) return abandon();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}
      }
      const dxPages = dx / g.w0;
      const dyPages = dy / g.h0;
      if (g.axis === 'x' && g.slug) viewP(g.slug).set(rubberClamp(g.vp - dxPages, 0, 2, 1));
      else if (g.axis === 'y') feedP.set(rubberClamp(g.fp - dyPages, 0, layout.total - 1, 1));
    };

    const abandon = () => {
      if (!g) return;
      const G = g;
      g = null;
      settle(G);
    };

    // Put anything we stopped mid-animation back on its page.
    const settle = (G: Gesture) => {
      if (G.slug) setArticleView(G.slug, G.view);
      goToArticle(targetArticle());
    };

    const end = (e: PointerEvent) => {
      if (!g || e.pointerId !== g.id) return;
      const G = g;
      g = null;
      if (!G.axis) {
        settle(G);
        if (e.type === 'pointerup') tap(e, G);
        return;
      }
      justDragged = true;
      setTimeout(() => (justDragged = false), 60);
      const last = G.samples[G.samples.length - 1];
      const recent = last && e.timeStamp - last.t <= 120;
      const sampleNow = recent ? last.t : e.timeStamp;
      if (G.axis === 'x' && G.slug) {
        const v = recent
          ? sampleVelocity(
              G.samples.map((s) => ({ t: s.t, v: s.x })),
              sampleNow,
            )
          : 0;
        const page = pickPage(-(viewP(G.slug).get() * layout.w), v, layout.w, G.view, 0, 2);
        setArticleView(G.slug, page, v);
      } else if (G.axis === 'y') {
        const v = recent
          ? sampleVelocity(
              G.samples.map((s) => ({ t: s.t, v: s.y })),
              sampleNow,
            )
          : 0;
        const i = targetArticle();
        const page = pickPage(-(feedP.get() * layout.h), v, layout.h, i, 0, layout.total - 1);
        goToArticle(page, v);
      }
    };

    // Double-tap on the cover background likes the article (style guide §8: not on buttons or title).
    const tap = (e: PointerEvent, G: Gesture) => {
      const onBackground = G.target.closest('.view.cover') && !G.target.closest('button, a, .ctitle, .rail, .crow, [role="button"]');
      if (!onBackground || !G.slug) return;
      if (lastTap && e.timeStamp - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40) {
        lastTap = null;
        toggleLike(G.slug, true);
        const r = el.getBoundingClientRect();
        live.current.onDoubleTap(e.clientX - r.left, e.clientY - r.top);
      } else lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    };

    const swallowClick = (e: MouseEvent) => {
      if (justDragged) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    // Trackpads and mouse wheels: one page per gesture.
    let wheelLock = 0;
    const wheel = (e: WheelEvent) => {
      const index = targetArticle();
      const slug = live.current.items[index]?.slug;
      const view = slug ? targetView(slug) : 0;
      const horiz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!horiz && view !== 0) return;
      if ((e.target as Element).closest('.panel, .sheet')) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock) return;
      const d = horiz ? e.deltaX : e.deltaY;
      if (Math.abs(d) < 12) return;
      wheelLock = now + 650;
      if (horiz && slug) setArticleView(slug, view + Math.sign(d));
      else if (!horiz) goToArticle(index + Math.sign(d));
    };

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    el.addEventListener('click', swallowClick, true);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('scroll', onScroll, { capture: true });
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      el.removeEventListener('click', swallowClick, true);
      el.removeEventListener('wheel', wheel);
    };
  }, []);

  // ---------- Keyboard: the same spring as a swipe (instant when the reader asks for reduced motion) ----------
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ui = useUI.getState();
      if (ui.overlays.length || ui.sheet || ui.langMenu) return;
      const index = targetArticle();
      const slug = items[index]?.slug;
      const view = slug ? targetView(slug) : 0;
      if (e.key === 'ArrowDown' && view === 0) {
        e.preventDefault();
        goToArticle(index + 1);
      } else if (e.key === 'ArrowUp' && view === 0) {
        e.preventDefault();
        goToArticle(index - 1);
      } else if (e.key === 'ArrowRight' && slug) {
        e.preventDefault();
        setArticleView(slug, view + 1);
      } else if (e.key === 'ArrowLeft' && slug) {
        e.preventDefault();
        setArticleView(slug, view - 1);
      } else if ((e.key === 'l' || e.key === 'L') && slug) toggleLike(slug);
      else if ((e.key === 's' || e.key === 'S') && slug) toggleSave(slug);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [items]);

  const reach = useSyncExternalStore(onSlideReach, slideReach, () => null);
  const windowStart = Math.max(0, Math.min(index, reach ?? index) - 1);
  const windowEnd = Math.min(total - 1, Math.max(index, reach ?? index) + 1);
  const pages: number[] = [];
  for (let i = windowStart; i <= windowEnd; i++) pages.push(i);

  return (
    <div className="feed" ref={ref} role="feed" aria-busy={false} aria-label={t('appName')}>
      <m.div className="track" style={{ y }} ref={(el) => registerFade('feed', el)}>
        {pages.map((i) =>
          i < items.length ? (
            <ArticlePage
              key={items[i].slug}
              item={items[i]}
              index={i}
              total={items.length}
              top={`${i * 100}%`}
              active={i === index}
              priority={i === 0}
            />
          ) : (
            <EndCard key="__end" index={i} top={`${i * 100}%`} active={i === index} />
          ),
        )}
      </m.div>
    </div>
  );
}
