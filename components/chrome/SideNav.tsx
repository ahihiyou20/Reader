'use client';
import { Compass, Home, LibraryBig, Settings, UserRound } from 'lucide-react';
import { useEffect } from 'react';
import type { Overlay } from '@/stores/ui';
import { useUI } from '@/stores/ui';
import { preloadExplore, preloadLibrary, preloadProfile, preloadSettings } from '../overlays/preload';
import { useT } from '../hooks';

const ITEMS: Array<{ id: 'home' | Overlay; icon: typeof Home; label: 'forYou' | 'exploreTitle' | 'library' | 'profile' | 'settings'; preload?: () => unknown }> = [
  { id: 'home', icon: Home, label: 'forYou' },
  { id: 'explore', icon: Compass, label: 'exploreTitle', preload: preloadExplore },
  { id: 'library', icon: LibraryBig, label: 'library', preload: preloadLibrary },
  { id: 'profile', icon: UserRound, label: 'profile', preload: preloadProfile },
  { id: 'settings', icon: Settings, label: 'settings', preload: preloadSettings },
];

/** Main navigation drawer, opened from the logo in the top bar: For You, Explore, Library, Profile, Settings. */
export function SideNav() {
  const t = useT();
  const open = useUI((s) => s.navOpen);
  const top = useUI((s) => s.overlays[s.overlays.length - 1]);
  const close = () => useUI.setState({ navOpen: false });
  const go = (id: 'home' | Overlay) => {
    // One destination at a time: the menu switches screens, it does not stack them.
    if (id === 'home') useUI.getState().startFeed({ category: null });
    else useUI.setState({ overlays: [id] });
    close();
  };
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  return (
    <>
      {open && <div className="click-shield dim" onPointerDown={close} />}
      <nav className={`sidenav${open ? ' open' : ''}`} aria-label={t('menu')} inert={!open || undefined}>
        <div className="sidenav-brand">
          <img src="/icons/logo-120.png" alt="" width={44} height={44} draggable={false} />
          <span>Pagemoor</span>
        </div>
        {ITEMS.map(({ id, icon: Icon, label, preload }) => (
          <button key={id} type="button" aria-current={(id === 'home' ? !top : top === id) ? 'page' : undefined} onClick={() => go(id)} onPointerDown={preload} onMouseEnter={preload} onFocus={preload}>
            <Icon className="ic" aria-hidden="true" />
            {t(label)}
          </button>
        ))}
        <p className="sidenav-foot">{t('tagline')}</p>
      </nav>
    </>
  );
}
