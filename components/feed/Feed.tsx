'use client';
// FeedPager (vertical, between articles) + ArticlePager (horizontal, cover ⇄ details ⇄ comments & apply).
// Gesture rules: docs/02 §5 and docs/03 §5 — axis lock at 10 px, 1:1 tracking, momentum projection,
// velocity handoff, rubber-band at the edges, interruptible at any time.

import { MDiv } from '@/components/Motion';
import { useEffect, useRef, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { preloadImage, prefetchArticle } from '@/lib/data';
import { pickPage, rubberClamp, sampleVelocity } from '@/lib/motion';
import { toggleLike, toggleSave } from '@/lib/actions';
import { useUI } from '@/stores/ui';
import { useSize, useT } from '../hooks';
import { ArticlePage } from './ArticlePage';
import { EndCard } from './EndCard';
import { chromeP, feedY, goToArticle, layout, registerFade, relayout, setArticleView, setFeedSlugs, viewX } from './nav';

interface Gesture {
  id: number;
  x0: number;
  y0: number;
  axis: 'x' | 'y' | null;
  slug: string | undefined;
  view: number;
  fy: number;
  vx: number;
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
  const [, force] = useState(0);
  const total = items.length + 1;

  // Keep the shared layout in sync with the measured size and the list.
  useEffect(() => {
    setFeedSlugs(items.map((i) => i.slug));
  }, [items]);
  useEffect(() => {
    relayout(w, h);
    force((n) => n + 1);
  }, [w, h]);
  useEffect(() => {
    // A new feed (Explore, deep link) starts at the top without animating.
    feedY.stop();
    feedY.set(-useUI.getState().index * layout.h);
  }, [version]);

  // The chrome (bottom nav, language pill) follows the active article's horizontal position.
  const activeSlug = items[index]?.slug;
  useEffect(() => {
    if (!activeSlug) {
      chromeP.set(0);
      return;
    }
    const x = viewX(activeSlug);
    const sync = (v: number) => chromeP.set(-v / layout.w);
    sync(x.get());
    return x.on('change', sync);
  }, [activeSlug]);

  // FR-04: prefetch the next two articles and their covers.
  useEffect(() => {
    for (const k of [1, 2, -1]) {
      const it = items[index + k];
      if (!it) continue;
      prefetchArticle(it.slug);
      preloadImage(it.cover.type === 'video' ? it.cover.poster : it.cover.url);
    }
    if (items[index]) prefetchArticle(items[index].slug);
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
      const ui = useUI.getState();
      const slug = items[ui.index]?.slug;
      const x = slug ? viewX(slug) : null;
      feedY.stop();
      x?.stop();
      const scroller = target.closest('.dscroll, .escroll');
      g = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        axis: null,
        slug,
        view: slug ? (ui.views[slug] ?? 0) : 0,
        fy: feedY.get(),
        vx: x?.get() ?? 0,
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
        g.x0 = e.clientX;
        g.y0 = e.clientY;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {}
        return;
      }
      if (g.axis === 'x' && g.slug) viewX(g.slug).set(rubberClamp(g.vx + dx, -2 * layout.w, 0, layout.w));
      else if (g.axis === 'y') feedY.set(rubberClamp(g.fy + dy, -(layout.total - 1) * layout.h, 0, layout.h));
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
      goToArticle(useUI.getState().index);
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
      if (G.axis === 'x' && G.slug) {
        const v = sampleVelocity(
          G.samples.map((s) => ({ t: s.t, v: s.x })),
          e.timeStamp,
        );
        const x = viewX(G.slug).get();
        setArticleView(G.slug, pickPage(x, v, layout.w, G.view, 0, 2), v);
      } else if (G.axis === 'y') {
        const v = sampleVelocity(
          G.samples.map((s) => ({ t: s.t, v: s.y })),
          e.timeStamp,
        );
        const i = useUI.getState().index;
        goToArticle(pickPage(feedY.get(), v, layout.h, i, 0, layout.total - 1), v);
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
        onDoubleTap(e.clientX - r.left, e.clientY - r.top);
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
      const ui = useUI.getState();
      const slug = items[ui.index]?.slug;
      const view = slug ? (ui.views[slug] ?? 0) : 0;
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
      else if (!horiz) goToArticle(ui.index + Math.sign(d));
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
  }, [items, onDoubleTap]);

  // ---------- Keyboard (NFR-04): instant, no animation ----------
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ui = useUI.getState();
      if (ui.overlays.length || ui.sheet || ui.langMenu) return;
      const slug = items[ui.index]?.slug;
      const view = slug ? (ui.views[slug] ?? 0) : 0;
      if (e.key === 'ArrowDown' && view === 0) {
        e.preventDefault();
        goToArticle(ui.index + 1, 0, true);
      } else if (e.key === 'ArrowUp' && view === 0) {
        e.preventDefault();
        goToArticle(ui.index - 1, 0, true);
      } else if (e.key === 'ArrowRight' && slug) {
        e.preventDefault();
        setArticleView(slug, view + 1, 0, true);
      } else if (e.key === 'ArrowLeft' && slug) {
        e.preventDefault();
        setArticleView(slug, view - 1, 0, true);
      } else if ((e.key === 'l' || e.key === 'L') && slug) toggleLike(slug);
      else if ((e.key === 's' || e.key === 'S') && slug) toggleSave(slug);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [items]);

  const windowStart = Math.max(0, index - 1);
  const windowEnd = Math.min(total - 1, index + 1);
  const pages: number[] = [];
  for (let i = windowStart; i <= windowEnd; i++) pages.push(i);

  return (
    <div className="feed" ref={ref} role="feed" aria-busy={false} aria-label={t('appName')}>
      <MDiv className="track" style={{ y: feedY }} ref={(el) => registerFade('feed', el)}>
        {pages.map((i) =>
          i < items.length ? (
            <ArticlePage
              key={items[i].slug}
              item={items[i]}
              index={i}
              total={items.length}
              top={i * h}
              active={i === index}
              priority={i === 0}
            />
          ) : (
            <EndCard key="__end" top={i * h} />
          ),
        )}
      </MDiv>
    </div>
  );
}
