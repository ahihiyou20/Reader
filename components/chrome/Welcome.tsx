'use client';
import { useEffect, useRef } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { pick } from '@/lib/i18n';
import { useReading } from '@/stores/reading';
import { useUI } from '@/stores/ui';
import { useCategoryName } from '../feed/CoverView';
import { useReducedMotion, useT } from '../hooks';
import { coverThumb } from '../overlays/ArticleCard';

/**
 * First-visit welcome: "Xin chào, mình là Pagemoor" over a quiet rain film, what the app offers, and
 * three most-read articles. Shown once; Settings can bring it back.
 */
export function Welcome({ items }: { items: FeedItem[] }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const portrait = useUI((s) => s.stage.endsWith('portrait'));
  const still = useReducedMotion();
  const start = useRef<HTMLButtonElement>(null);
  const done = (slug?: string) => {
    useReading.getState().setWelcomed(true);
    if (slug) useUI.getState().startFeed({ category: null, slug });
  };
  useEffect(() => {
    start.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && done();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const src = portrait ? '/welcome/rain-v' : '/welcome/rain';
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label={`${t('wHello')} ${t('wIam')} Pagemoor`}>
      {still ? (
        <img className="welcome-bg" src={`${src}-poster.webp`} alt="" />
      ) : (
        <video className="welcome-bg" key={src} src={`${src}.mp4`} poster={`${src}-poster.webp`} muted loop playsInline autoPlay />
      )}
      <div className="welcome-shade" />
      <header className="welcome-nav">
        <img src="/icons/logo-120.png" alt="" width={40} height={40} />
        <span>Pagemoor</span>
        <button type="button" onClick={() => done()}>
          {t('wSkip')}
          <i aria-hidden="true" />
        </button>
      </header>
      <div className="welcome-body">
        <div className="welcome-left">
          <h1>
            <span className="scr">
              {t('wHello')}
              <small>{t('wIam')}</small>
            </span>
            <span className="ser">Pagemoor</span>
          </h1>
          <p className="welcome-tag">
            {t('tagline')} {t('wTag2')}
          </p>
          <dl className="welcome-info">
            {(
              [
                ['wAnytime', 'wAnytimeSub'],
                ['wLangs', 'wLangsSub'],
                ['wListen', 'wListenSub'],
                ['wFree', 'wFreeSub'],
              ] as const
            ).map(([k, sub], i) => (
              <div key={k} style={{ ['--d' as string]: i }}>
                <dt>{t(k)}</dt>
                <dd>{t(sub, { n: Math.floor(items.length / 10) * 10 })}</dd>
              </div>
            ))}
          </dl>
          <button className="welcome-start" type="button" ref={start} onClick={() => done()}>
            {t('wStart')}
            <i aria-hidden="true" />
          </button>
        </div>
        <div className="welcome-picks" aria-label={t('wMostRead')}>
          {items.slice(0, 3).map((item, i) => (
            <Pick key={item.slug} item={item} n={i + 1} title={pick(item.title, lang) ?? ''} label={t('wMostRead')} onOpen={() => done(item.slug)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Pick({ item, n, title, label, onOpen }: { item: FeedItem; n: number; title: string; label: string; onOpen: () => void }) {
  const cat = useCategoryName(item.category);
  return (
    <button type="button" onClick={onOpen} style={{ ['--d' as string]: n, ['--dominant' as string]: item.cover.dominant }}>
      <img src={coverThumb(item)} alt="" loading="lazy" decoding="async" draggable={false} onError={(e) => (e.currentTarget.hidden = true)} />
      <em>No. 0{n}</em>
      <span>
        <b>{label}</b> · <i>{cat}</i>
      </span>
      <strong>{title}</strong>
    </button>
  );
}
