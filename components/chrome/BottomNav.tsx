'use client';
import { m, useTransform } from 'framer-motion';
import { MessageCircleMore, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { needsGoogle } from '@/lib/actions';
import { clamp } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';
import { chromeP } from '../feed/nav';

/** CMP-14: three floating buttons; hidden on Comments & Apply and while the keyboard is open. */
export function BottomNav() {
  const t = useT();
  const openOverlay = useUI((s) => s.openOverlay);
  const y = useTransform(chromeP, (p) => clamp(p - 1, 0, 1) * 140);
  const plusScale = useTransform(chromeP, (p) => 1 - 0.22 * clamp(p, 0, 1));
  const keyboard = useKeyboardOpen();
  return (
    <m.nav className="bnav" style={{ y: keyboard ? 160 : y }} aria-label={t('home')}>
      <button className="nb side search" type="button" aria-label={t('search')} onClick={() => openOverlay('search')}>
        <Search className="ic" strokeWidth={2.4} aria-hidden="true" />
      </button>
      <m.div className="plusw" style={{ scale: plusScale }}>
        <button
          className="nb plus"
          type="button"
          aria-label={t('createTitle')}
          onClick={() => {
            if (!needsGoogle('create')) openOverlay('create');
          }}
        >
          <Plus className="ic" strokeWidth={2.8} aria-hidden="true" />
        </button>
      </m.div>
      <button className="nb side chat" type="button" aria-label={t('messages')} onClick={() => openOverlay('messages')}>
        <MessageCircleMore className="ic" aria-hidden="true" />
      </button>
    </m.nav>
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
