'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArticleClient, FeedItem } from '@/lib/content/types';
import { setArticleData } from '@/lib/data';
import { startSession } from '@/lib/actions';
import { detectLang, translate } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { BigHeart } from './chrome/BigHeart';
import { BottomNav } from './chrome/BottomNav';
import { LangMenu } from './chrome/LangMenu';
import { Toast } from './chrome/Toast';
import { TopBar } from './chrome/TopBar';
import { Feed } from './feed/Feed';
import { chromeP } from './feed/nav';
import { useFeedList } from './feed/useFeedList';
import { CreatePanel } from './overlays/CreatePanel';
import { ExplorePanel } from './overlays/ExplorePanel';
import { ProfilePanel } from './overlays/ProfilePanel';
import { SearchPanel } from './overlays/SearchPanel';
import { Sheets } from './overlays/Sheets';
import { MessagesPanel, NotificationsPanel } from './overlays/SocialPanels';
import { useMounted } from './hooks';

export interface PreviewData {
  item: FeedItem;
  article: ArticleClient;
}

export function ReaderApp({ initialSlug, preview, children }: { initialSlug?: string; preview?: PreviewData; children?: React.ReactNode }) {
  return (
    <Shell initialSlug={initialSlug} preview={preview}>
      {children}
    </Shell>
  );
}

function Shell({ initialSlug, preview, children }: { initialSlug?: string; preview?: PreviewData; children?: React.ReactNode }) {
  const mounted = useMounted();
  const app = useRef<HTMLDivElement>(null);
  const [heart, setHeart] = useState<{ x: number; y: number; id: number } | null>(null);
  const previewItems = useRef<FeedItem[] | undefined>(undefined);
  if (preview && previewItems.current?.[0] !== preview.item) {
    setArticleData(preview.article);
    previewItems.current = [preview.item];
  }
  const items = useFeedList(preview ? previewItems.current : undefined);

  useEffect(() => {
    const lang = detectLang();
    useUI.setState({ lang, startSlug: initialSlug ?? null });
    document.documentElement.lang = lang;
    document.getElementById('seo')?.setAttribute('hidden', '');
    startSession();
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production' && !preview) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const offline = () => useUI.getState().showToast(translate(useUI.getState().lang, 'offline'));
    window.addEventListener('offline', offline);
    return () => window.removeEventListener('offline', offline);
  }, [initialSlug, preview]);

  useEffect(() => {
    const el = app.current;
    if (!el) return;
    const sync = (p: number) => {
      const on = p > 1.5 ? 'true' : 'false';
      if (el.dataset.engage !== on) el.dataset.engage = on;
    };
    sync(chromeP.get());
    return chromeP.on('change', sync);
  }, [mounted, items]);

  const onDoubleTap = useCallback((x: number, y: number) => setHeart({ x, y, id: Date.now() }), []);
  const clearHeart = useCallback(() => setHeart(null), []);

  if (!mounted || !items) {
    return (
      <div className="app">
        <div className="splash" aria-busy="true">
          <div className="splash-logo" aria-hidden="true">
            R
          </div>
        </div>
        {children}
      </div>
    );
  }
  return (
    <div className="app" ref={app}>
      <Feed items={items} onDoubleTap={onDoubleTap} />
      {heart && <BigHeart key={heart.id} x={heart.x} y={heart.y} onDone={clearHeart} />}
      <TopBar />
      <BottomNav />
      <LangMenu />
      <ExplorePanel />
      <SearchPanel />
      <MessagesPanel />
      <NotificationsPanel />
      <ProfilePanel />
      <CreatePanel />
      <Sheets />
      <Toast />
      {children}
    </div>
  );
}
