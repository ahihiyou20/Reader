'use client';
import { MDiv, MNav } from '@/components/Motion';
import { useTransform } from 'framer-motion';
import { Compass, Home, LibraryBig, MessageCircleMore, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { needsGoogle } from '@/lib/actions';
import { clamp } from '@/lib/motion';
import type { Overlay } from '@/stores/ui';
import { useUI } from '@/stores/ui';
import { Indicator } from '@/components/ui/Indicator';
import { preloadCreate, preloadExplore, preloadLibrary, preloadSearch, preloadSocial } from '../overlays/preload';
import { useReducedMotion, useT } from '../hooks';
import { chromeP } from '../feed/nav';

const TABS: Array<{ id: 'home' | Overlay; cls: string; icon: typeof Home; label: 'home' | 'exploreTitle' | 'search' | 'library' | 'messages'; short: 'tabHome' | 'tabExplore' | 'tabSearch' | 'tabLibrary' | 'tabChats'; preload?: () => unknown }> = [
  { id: 'home', cls: 'home', icon: Home, label: 'home', short: 'tabHome' },
  { id: 'explore', cls: 'explore', icon: Compass, label: 'exploreTitle', short: 'tabExplore', preload: preloadExplore },
  { id: 'search', cls: 'search', icon: Search, label: 'search', short: 'tabSearch', preload: preloadSearch },
  { id: 'library', cls: 'library', icon: LibraryBig, label: 'library', short: 'tabLibrary', preload: preloadLibrary },
  { id: 'messages', cls: 'chat', icon: MessageCircleMore, label: 'messages', short: 'tabChats', preload: preloadSocial },
];

/**
 * CMP-14: the app's navigation as one liquid-glass bar. Phones: a floating capsule of tabs at the foot
 * with the + button beside it. Wide screens: the same bar standing upright at the right edge, above the
 * like/save/share rail. The selected tab carries a lens of brighter glass that slides between tabs.
 * It leaves on Comments & Apply and while the keyboard is open.
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
    if (id === 'home') useUI.getState().startFeed({ category: null });
    // One destination at a time: a tab switches screens, it does not stack them.
    else useUI.setState({ overlays: [id] });
  };
  const offset = keyboard ? 200 * edge : away;
  return (
    <MNav className="bnav" data-mini={mini || undefined} data-gone={gone || keyboard || undefined} inert={gone || undefined} data-region="dock" style={upright ? { x: offset } : { y: offset }} aria-label={t('menu')}>
      <div className="gtabs glass">
        {TABS.map(({ id, cls, icon: Icon, label, short, preload }) => {
          const on = id === 'home' ? !top : top === id;
          return (
            <button
              key={id}
              className={`nb tab ${cls}`}
              type="button"
              aria-label={t(label)}
              aria-current={on ? 'page' : undefined}
              onClick={() => go(id)}
              onPointerDown={preload}
              onMouseEnter={preload}
              onFocus={preload}
            >
              {/* The lens slides between tabs; with reduced motion it simply appears on the new one. */}
              {on && (still ? <span className="indicator lens" aria-hidden="true" /> : <Indicator layoutId="glass-tab" className="lens" />)}
              <Icon className="ic" strokeWidth={on ? 2.4 : 2} aria-hidden="true" />
              <span className="lbl" aria-hidden="true">
                {t(short)}
              </span>
            </button>
          );
        })}
      </div>
      <MDiv className="plusw" style={{ scale: plusScale }}>
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
