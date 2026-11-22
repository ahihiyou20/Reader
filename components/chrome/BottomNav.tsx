'use client';
import { MDiv, MNav } from '@/components/Motion';
import { animate, m, useMotionValue, useTransform } from 'framer-motion';
import { Compass, Home, LibraryBig, MessageCircleMore, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { needsGoogle } from '@/lib/actions';
import { clamp, rubberClamp, spring } from '@/lib/motion';
import type { Overlay } from '@/stores/ui';
import { switchTab, useUI } from '@/stores/ui';
import { preloadCreate, preloadExplore, preloadLibrary, preloadSearch, preloadSocial } from '../overlays/preload';
import { useReducedMotion, useT } from '../hooks';
import { chromeP, goHome } from '../feed/nav';

const TABS: Array<{ id: 'home' | Overlay; cls: string; icon: typeof Home; label: 'home' | 'exploreTitle' | 'search' | 'library' | 'messages'; short: 'tabHome' | 'tabExplore' | 'tabSearch' | 'tabLibrary' | 'tabChats'; preload?: () => unknown }> = [
  { id: 'home', cls: 'home', icon: Home, label: 'home', short: 'tabHome' },
  { id: 'explore', cls: 'explore', icon: Compass, label: 'exploreTitle', short: 'tabExplore', preload: preloadExplore },
  { id: 'search', cls: 'search', icon: Search, label: 'search', short: 'tabSearch', preload: preloadSearch },
  { id: 'library', cls: 'library', icon: LibraryBig, label: 'library', short: 'tabLibrary', preload: preloadLibrary },
  { id: 'messages', cls: 'chat', icon: MessageCircleMore, label: 'messages', short: 'tabChats', preload: preloadSocial },
];

/** Tabs the bar stays visible over. */
const OVER: Overlay[] = ['explore', 'search', 'library', 'messages'];

/**
 * CMP-14: the app's navigation as one liquid-glass bar. Phones: a floating capsule of tabs at the foot
 * with the + button beside it. Wide screens: the same bar standing upright at the right edge, above the
 * like/save/share rail. The selected tab carries a lens of brighter glass that slides between tabs.
 * As on iOS, the lens can be held and dragged: it lifts, follows the finger along the bar, and the tab
 * under it on release is chosen. It leaves on Comments & Apply and while the keyboard is open.
 */
export function BottomNav() {
  const t = useT();
  const top = useUI((s) => s.overlays[s.overlays.length - 1]);
  const stage = useUI((s) => s.stage);
  const upright = stage.endsWith('landscape');
  // Off towards its own edge: down on phones, left or right when the bar stands at a side.
  const edge = stage === 'compact-landscape' ? -1 : 1;
  const away = useTransform(chromeP, (p) => clamp(p - 1, 0, 1) * 160 * edge);
  const plusScale = useTransform(chromeP, (p) => 1 - 0.18 * clamp(p, 0, 1));
  const keyboard = useKeyboardOpen();
  const still = useReducedMotion();
  // While reading, the bar folds to icons only and gives the text more room, as iOS tab bars do on scroll.
  const [mini, setMini] = useState(false);
  // On Comments & Apply the bar has slid away: hidden, so nothing behind its old place takes a tap.
  const [gone, setGone] = useState(false);
  useEffect(
    () =>
      chromeP.on('change', (p) => {
        setMini(p > 0.5);
        setGone(p > 1.5);
      }),
    [],
  );
  const go = (id: 'home' | Overlay) => {
    if (id === 'home') goHome();
    // One destination at a time: a tab switches screens, it does not stack them.
    else switchTab(id);
  };
  // Over a tab's page the bar is whole and in place, whatever state the article behind it left it in.
  const over = Boolean(top && OVER.includes(top));
  const folded = mini && !over;
  const hidden = gone && !over;
  const active = TABS.findIndex(({ id }) => (id === 'home' ? !top : top === id));
  const lens = useLens(active, folded, still, (i) => go(TABS[i].id));
  const offset = keyboard ? 200 * edge : over ? 0 : away;
  return (
    <MNav className="bnav" data-over={over || undefined} data-mini={folded || undefined} data-gone={hidden || keyboard || undefined} inert={hidden || undefined} data-region="dock" style={upright ? { x: offset } : { y: offset }} aria-label={t('menu')}>
      <div className="gtabs glass" ref={lens.bar} data-lifted={lens.lifted || undefined} {...lens.handlers}>
        <m.span className="lens" aria-hidden="true" style={lens.style} />
        {TABS.map(({ id, cls, icon: Icon, label, short, preload }, i) => {
          const on = i === active;
          return (
            <button
              key={id}
              className={`nb tab ${cls}`}
              type="button"
              aria-label={t(label)}
              aria-current={on ? 'page' : undefined}
              data-under={lens.under === i || undefined}
              ref={(el) => {
                lens.tabs.current[i] = el;
              }}
              onClick={() => {
                if (!lens.dragged()) go(id);
              }}
              onPointerDown={preload}
              onMouseEnter={preload}
              onFocus={preload}
            >
              <Icon className="ic" strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
              <span className="lbl" aria-hidden="true">
                {t(short)}
              </span>
            </button>
          );
        })}
      </div>
      <MDiv className="plusw" style={{ scale: over ? 1 : plusScale }}>
        <button
          className="nb plus"
          type="button"
          aria-label={t('createTitle')}
          onClick={() => {
            if (!needsGoogle('create')) useUI.getState().openOverlay('create');
          }}
          onPointerDown={preloadCreate}
          onMouseEnter={preloadCreate}
          onFocus={preloadCreate}
        >
          <Plus className="ic" strokeWidth={2.6} aria-hidden="true" />
        </button>
      </MDiv>
    </MNav>
  );
}

/**
 * The lens: placed on the selected tab (a spring when the tab changes, at once with reduced motion) and
 * draggable. A press that moves 8 px along the bar, or stays down 220 ms, lifts it; from then the lens
 * chases the finger on a stiff spring, rubber-banding past the first and last tab.
 */
function useLens(active: number, mini: boolean, still: boolean, choose: (i: number) => void) {
  const bar = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(0);
  const [lifted, setLifted] = useState(false);
  const [under, setUnder] = useState<number | null>(null);
  const press = useRef<{ id: number; x0: number; y0: number; x: number; y: number; on: boolean; timer: number } | null>(null);
  const swallow = useRef(false);
  const underRef = useRef<number | null>(null);
  const placed = useRef(false);

  const place = useCallback(
    (i: number, move: boolean) => {
      const t = tabs.current[i];
      // No selected tab (a profile or settings is open): the lens waits out of sight where it was.
      opacity.set(t ? 1 : 0);
      if (!t || !t.offsetWidth) return;
      const how = move && placed.current && !still ? spring.flick : { duration: 0 };
      animate(x, t.offsetLeft, how);
      animate(y, t.offsetTop, how);
      width.set(t.offsetWidth);
      height.set(t.offsetHeight);
      placed.current = true;
    },
    [x, y, width, height, opacity, still],
  );
  useLayoutEffect(() => place(active, true), [active, place]);
  const activeNow = useRef(active);
  activeNow.current = active;
  // Tabs change size when the bar folds or the stage changes: keep the lens on its tab. One observer for
  // the bar's life: a new one per tab change reported every size at once and cut the slide to a jump.
  useEffect(() => {
    const ro = new ResizeObserver(() => !press.current?.on && place(activeNow.current, false));
    for (const t of tabs.current) if (t) ro.observe(t);
    return () => ro.disconnect();
  }, [place]);

  const follow = (cx: number, cy: number) => {
    const g = bar.current!.getBoundingClientRect();
    // The bar's own layout says which way it runs (short laptop screens lay the upright bar flat).
    const upright = getComputedStyle(bar.current!).flexDirection === 'column';
    const along = upright ? cy - g.top : cx - g.left;
    const size = upright ? height.get() : width.get();
    const first = tabs.current[0]!;
    const last = tabs.current[tabs.current.length - 1]!;
    const lo = upright ? first.offsetTop : first.offsetLeft;
    const hi = upright ? last.offsetTop : last.offsetLeft;
    const to = rubberClamp(along - size / 2, lo, hi, upright ? g.height : g.width);
    animate(upright ? y : x, to, still ? { duration: 0 } : { type: 'spring', stiffness: 760, damping: 48 });
    let best = 0;
    tabs.current.forEach((t, i) => {
      const c = (t: HTMLButtonElement) => (upright ? t.offsetTop + t.offsetHeight / 2 : t.offsetLeft + t.offsetWidth / 2);
      if (t && Math.abs(c(t) - along) < Math.abs(c(tabs.current[best]!) - along)) best = i;
    });
    if (best !== underRef.current) {
      underRef.current = best;
      setUnder(best);
      navigator.vibrate?.(6);
    }
  };
  const lift = () => {
    const p = press.current;
    if (!p || p.on) return;
    p.on = true;
    swallow.current = true;
    window.clearTimeout(p.timer);
    bar.current?.setPointerCapture(p.id);
    animate(scale, 1.14, still ? { duration: 0 } : spring.pop);
    setLifted(true);
    follow(p.x, p.y);
  };
  const end = (pick: boolean) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (!p.on) return;
    animate(scale, 1, still ? { duration: 0 } : spring.flick);
    setLifted(false);
    const i = underRef.current;
    underRef.current = null;
    setUnder(null);
    if (pick && i !== null && i !== active) choose(i);
    else place(active, true);
  };
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      swallow.current = false;
      // Folded, the bar holds one tab: nothing to drag to.
      if (e.button !== 0 || mini || active < 0) return;
      const p = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, on: false, timer: 0 };
      p.timer = window.setTimeout(lift, 220);
      press.current = p;
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (p.on) follow(p.x, p.y);
      else if (Math.hypot(p.x - p.x0, p.y - p.y0) > 8) lift();
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
  };
  return {
    bar,
    tabs,
    lifted,
    under,
    handlers,
    // Reduced motion: the lens is placed, never moved, so it sits by its offsets and not a transform.
    style: still ? { left: x, top: y, width, height, opacity } : { x, y, width, height, scale, opacity },
    /** True once for the click that ends a drag, so releasing over a tab does not also press it. */
    dragged: () => {
      const d = swallow.current;
      swallow.current = false;
      return d;
    },
  };
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const base = { h: window.innerHeight };
    const on = () => {
      if (vv.height > base.h) base.h = vv.height;
      const focused = document.activeElement?.matches?.('input, textarea');
      setOpen(Boolean(focused) && vv.height < base.h * 0.78);
    };
    vv.addEventListener('resize', on);
    window.addEventListener('focusin', on);
    window.addEventListener('focusout', () => setTimeout(on, 50));
    return () => {
      vv.removeEventListener('resize', on);
      window.removeEventListener('focusin', on);
    };
  }, []);
  return open;
}
