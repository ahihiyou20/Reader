'use client';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ArticleClient, FeedItem } from '@/lib/content/types';
import { setArticleData } from '@/lib/data';
import { startSession } from '@/lib/actions';
import { detectLang, translate } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { Ambient } from './chrome/Ambient';
import { BottomNav } from './chrome/BottomNav';
import { KeyHints } from './chrome/KeyHints';
import { LangMenu } from './chrome/LangMenu';
import { Toast } from './chrome/Toast';
import { TopBar } from './chrome/TopBar';
import { Feed } from './feed/Feed';
import { Poster, type PosterProps } from './feed/Poster';
import { setOptCovers, type OptCovers } from '@/lib/covers';
import { chromeP } from './feed/nav';
import { useFeedList } from './feed/useFeedList';
import { preloadOverlays } from './overlays/preload';
import { useMounted, useStageSync } from './hooks';

const BigHeart = dynamic(() => import('./chrome/BigHeart').then((m) => m.BigHeart), { ssr: false });
const CreatePanel = dynamic(() => import('./overlays/CreatePanel').then((m) => m.CreatePanel), { ssr: false });
const ExplorePanel = dynamic(() => import('./overlays/ExplorePanel').then((m) => m.ExplorePanel), { ssr: false });
const ProfilePanel = dynamic(() => import('./overlays/ProfilePanel').then((m) => m.ProfilePanel), { ssr: false });
const SearchPanel = dynamic(() => import('./overlays/SearchPanel').then((m) => m.SearchPanel), { ssr: false });
const Sheets = dynamic(() => import('./overlays/Sheets').then((m) => m.Sheets), { ssr: false });
const MessagesPanel = dynamic(() => import('./overlays/SocialPanels').then((m) => m.MessagesPanel), { ssr: false });
const NotificationsPanel = dynamic(() => import('./overlays/SocialPanels').then((m) => m.NotificationsPanel), { ssr: false });

export interface PreviewData {
  item: FeedItem;
  article: ArticleClient;
}

export function ReaderApp({
  initialSlug,
  preview,
  poster,
  covers,
  children,
}: {
  initialSlug?: string;
  preview?: PreviewData;
  poster?: PosterProps;
  covers?: OptCovers;
  children?: React.ReactNode;
}) {
  if (covers) setOptCovers(covers);
  useStageSync();
  return (
    <Shell initialSlug={initialSlug} preview={preview} poster={poster}>
      {children}
    </Shell>
  );
}

function Shell({
  initialSlug,
  preview,
  poster,
  children,
}: {
  initialSlug?: string;
  preview?: PreviewData;
  poster?: PosterProps;
  children?: React.ReactNode;
}) {
  const mounted = useMounted();
  const app = useRef<HTMLDivElement>(null);
  const [heart, setHeart] = useState<{ x: number; y: number; id: number } | null>(null);
  const [fading, setFading] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const hasOverlay = useUI((s) => s.overlays.length > 0 || s.sheet !== null || s.langMenu);
  const hasPanel = useUI((s) => s.overlays.length > 0);
  const shouldMountDeferred = deferred || hasOverlay;
  const previewItems = useRef<FeedItem[] | undefined>(undefined);
  if (preview && previewItems.current?.[0] !== preview.item) {
    setArticleData(preview.article);
    previewItems.current = [preview.item];
  }
  const items = useFeedList(preview ? previewItems.current : undefined);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hasOverlay) {
      setDeferred(true);
      return;
    }
    if ('requestIdleCallback' in window) {
      const handle = (
        window as unknown as {
          requestIdleCallback: (fn: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback(() => setDeferred(true), { timeout: 1000 });
      return () => {
        if ('cancelIdleCallback' in window) {
          (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(handle);
        }
      };
    }
    const timer = setTimeout(() => setDeferred(true), 1000);
    return () => clearTimeout(timer);
  }, [hasOverlay]);

  useEffect(() => {
    const lang = detectLang();
    useUI.setState({ lang, startSlug: initialSlug ?? null });
    document.documentElement.lang = lang;
    document.getElementById('seo')?.setAttribute('hidden', '');

    const runIdle = (cb: () => void) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        return (window as unknown as { requestIdleCallback: (fn: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(cb, { timeout: 2000 });
      }
      return setTimeout(cb, 500);
    };

    runIdle(() => {
      startSession();
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && !preview) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      }
      preloadOverlays();
    });

    const offline = () => useUI.getState().showToast(translate(useUI.getState().lang, 'offline'));
    window.addEventListener('offline', offline);
    return () => window.removeEventListener('offline', offline);
  }, [initialSlug, preview]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStart = (e: Event) => {
      const target = (e.target as Element | null)?.closest(
        'button, a, [role="button"], [role="menuitemradio"], [role="tab"], input[type="checkbox"], .pill, .btn, .act-btn, .hint, .ritem, .card, .step, .chip',
      ) as HTMLElement | null;
      if (target) {
        target.dataset.pressed = 'true';
      }
    };
    const onEnd = () => {
      document.querySelectorAll('[data-pressed="true"]').forEach((el) => {
        el.removeAttribute('data-pressed');
      });
    };
    window.addEventListener('touchstart', onStart, { passive: true, capture: true });
    window.addEventListener('touchend', onEnd, { passive: true, capture: true });
    window.addEventListener('touchcancel', onEnd, { passive: true, capture: true });
    window.addEventListener('pointerdown', onStart, { passive: true, capture: true });
    window.addEventListener('pointerup', onEnd, { passive: true, capture: true });
    window.addEventListener('pointercancel', onEnd, { passive: true, capture: true });
    return () => {
      window.removeEventListener('touchstart', onStart, { capture: true });
      window.removeEventListener('touchend', onEnd, { capture: true });
      window.removeEventListener('touchcancel', onEnd, { capture: true });
      window.removeEventListener('pointerdown', onStart, { capture: true });
      window.removeEventListener('pointerup', onEnd, { capture: true });
      window.removeEventListener('pointercancel', onEnd, { capture: true });
    };
  }, []);

  // The feed mounts as a transition: React renders it in slices, so the poster keeps painting and no
  // single long task blocks the first screen.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = app.current;
    if (!el) return;
    const sync = (p: number) => {
      const on = p > 1.5 ? 'true' : 'false';
      if (el.dataset.engage !== on) el.dataset.engage = on;
    };
    sync(chromeP.get());
    return chromeP.on('change', sync);
  }, [ready]);

  const onDoubleTap = useCallback((x: number, y: number) => setHeart({ x, y, id: Date.now() }), []);
  const clearHeart = useCallback(() => setHeart(null), []);

  useEffect(() => {
    if (mounted && items && !ready) startTransition(() => setReady(true));
  }, [mounted, items, ready]);

  useEffect(() => {
    if (ready && !fading) {
      setFading(true);
    }
  }, [ready, fading]);

  if (!ready || !items) {
    return (
      <div className="app">
        {poster ? (
          <Poster {...poster} />
        ) : (
          <div className="splash" aria-busy="true">
            <div className="splash-logo" aria-hidden="true">
              R
            </div>
          </div>
        )}
        {children}
      </div>
    );
  }
  return (
    <>
      <div className="app" ref={app} data-has-panel={hasPanel ? 'true' : undefined}>
        {poster && <Poster {...poster} fading={fading} />}
        <TopBar />
        <Feed items={items} onDoubleTap={onDoubleTap} />
        {heart && <BigHeart key={heart.id} x={heart.x} y={heart.y} onDone={clearHeart} />}
        <BottomNav />
        {shouldMountDeferred && (
          <>
            <KeyHints />
            <LangMenu />
            <ExplorePanel />
            <SearchPanel />
            <MessagesPanel />
            <NotificationsPanel />
            <ProfilePanel />
            <CreatePanel />
            <Sheets />
            <Toast />
          </>
        )}
        {children}
      </div>
      {shouldMountDeferred && <Ambient items={items} />}
    </>
  );
}
