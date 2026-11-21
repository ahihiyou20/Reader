'use client';
import { ArrowRight, BookMarked, ChevronLeft, ChevronRight, Globe, Headphones, Pause, Play, Sparkles } from 'lucide-react';
import { animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { pick } from '@/lib/i18n';
import { useReading } from '@/stores/reading';
import { useUI } from '@/stores/ui';
import { useCategoryName } from '../feed/CoverView';
import { useReducedMotion, useT } from '../hooks';
import { CardMedia, coverThumb } from '../overlays/ArticleCard';

const FEATURES = [
  { key: 'wF1', icon: Globe },
  { key: 'wF2', icon: Sparkles },
  { key: 'wF3', icon: BookMarked },
  { key: 'wF4', icon: Headphones },
] as const;
/** How long one feature stays up before the next. */
const FEATURE_MS = 6000;

const hideBroken = (e: React.SyntheticEvent<HTMLImageElement>) => (e.currentTarget.hidden = true);
/**
 * A two-finger sideways swipe on a touchpad moves a row of cards one step. A trackpad sends a stream of
 * wheel events with momentum: the step fires once the swipe passes a threshold, then waits for the
 * stream to stop.
 */
function useSwipeStep(step: (d: 1 | -1) => void) {
  const acc = useRef(0);
  const quiet = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  return (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    clearTimeout(quiet.current);
    quiet.current = setTimeout(() => ((acc.current = 0), (fired.current = false)), 220);
    if (fired.current) return;
    acc.current += e.deltaX;
    if (Math.abs(acc.current) < 40) return;
    fired.current = true;
    step(acc.current > 0 ? 1 : -1);
  };
}

/** Place of a card in a row of cards turned towards the middle one. */
const flow = (i: number, active: number) => ({ ['--o' as string]: i - active, ['--a' as string]: Math.abs(i - active) });

/**
 * First-visit welcome, three screens: "Xin chào, mình là Pagemoor" over a quiet rain film, what the
 * app does, and featured articles. Shown once; Settings can bring it back.
 */
export function Welcome({ items }: { items: FeedItem[] }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const portrait = useUI((s) => s.stage.endsWith('portrait'));
  const still = useReducedMotion();
  const start = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  /** The chosen article is put in the feed first, then the welcome fades away to reveal it. */
  const done = (slug?: string) => {
    if (leaving) return;
    if (slug) useUI.getState().startFeed({ category: null, slug });
    if (still) return useReading.getState().setWelcomed(true);
    setLeaving(true);
  };
  const doneRef = useRef(done);
  doneRef.current = done;
  useEffect(() => {
    document.documentElement.removeAttribute('data-welcome');
    start.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && doneRef.current();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  /** Glide to a section. Snap points are lifted for the glide, or the browser would cut it short. */
  const to = (id: string) => {
    const box = root.current;
    const target = box?.querySelector<HTMLElement>(`#${id}`);
    if (!box || !target) return;
    if (still) return void (box.scrollTop = target.offsetTop);
    box.style.scrollSnapType = 'none';
    animate(box.scrollTop, target.offsetTop, {
      duration: 1.1,
      ease: [0.65, 0, 0.35, 1],
      onUpdate: (v) => (box.scrollTop = v),
      onComplete: () => (box.style.scrollSnapType = ''),
    });
  };
  // Covers kept in the repo come first: they show even when a remote image host is slow or down.
  const featured = [...items.filter((i) => coverThumb(i).startsWith('/')), ...items.filter((i) => !coverThumb(i).startsWith('/'))].slice(0, 6);
  // The film behind the greeting changes every day: one of the articles' motion covers, rain without one.
  const films = items.filter((i) => i.cover.video);
  const film = films[Math.floor(Date.now() / 86_400_000) % (films.length || 1)];
  const rain = portrait ? '/welcome/rain-v' : '/welcome/rain';
  const clip = film?.cover.video ? (!portrait && film.cover.video.wide) || film.cover.video.url : `${rain}.mp4`;
  const poster = film ? (portrait ? coverThumb(film) : coverWide(film)) : `${rain}-poster.webp`;
  return (
    <div
      className={`welcome${leaving ? ' leaving' : ''}`}
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`${t('wHello')} ${t('wIam')} Pagemoor`}
      onAnimationEnd={(e) => e.target === e.currentTarget && leaving && useReading.getState().setWelcomed(true)}
    >
      <section className="welcome-top">
        {still ? (
          <img className="welcome-bg" src={poster} alt="" />
        ) : (
          <video className="welcome-bg" key={clip} src={clip} poster={poster} muted loop playsInline autoPlay />
        )}
        <div className="welcome-shade" />
        <header className="welcome-nav">
          <img src="/icons/logo-120.png" alt="" width={40} height={40} />
          <span>Pagemoor</span>
          <button className="wlink" type="button" onClick={() => to('w-what')}>
            {t('wAbout')}
          </button>
          <button className="wlink" type="button" onClick={() => to('w-picks')}>
            {t('wFeatured')}
          </button>
          <button className="wskip" type="button" onClick={() => done()}>
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
            {featured.slice(0, 3).map((item, i) => (
              <Pick key={item.slug} item={item} n={i + 1} title={pick(item.title, lang) ?? ''} label={t('wMostRead')} onOpen={() => done(item.slug)} />
            ))}
          </div>
        </div>
      </section>
      <What backgrounds={featured.map(coverWide)} still={still} />
      <Featured items={featured} onOpen={done} />
    </div>
  );
}

const coverWide = (item: FeedItem) => item.cover.wide ?? coverThumb(item);

function Pick({ item, n, title, label, onOpen }: { item: FeedItem; n: number; title: string; label: string; onOpen: () => void }) {
  const cat = useCategoryName(item.category);
  return (
    <button type="button" onClick={onOpen} style={{ ['--d' as string]: n, ['--dominant' as string]: item.cover.dominant }}>
      <CardMedia item={item} />
      <em>No. 0{n}</em>
      <span>
        <b>{label}</b> · <i>{cat}</i>
      </span>
      <strong>{title}</strong>
    </button>
  );
}

/** "What does Pagemoor do?": four features, one at a time, moving on by themselves unless paused. */
function What({ backgrounds, still }: { backgrounds: string[]; still: boolean }) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(still);
  const swipe = useSwipeStep((d) => setActive((i) => (i + d + FEATURES.length) % FEATURES.length));
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => setActive((i) => (i + 1) % FEATURES.length), FEATURE_MS);
    return () => clearTimeout(id);
  }, [active, paused]);
  return (
    <section className="wfx" id="w-what" aria-label={t('wWhat')}>
      {backgrounds.slice(0, FEATURES.length).map((bg, i) => (
        <img key={bg} className={`wfx-bg${i === active ? ' on' : ''}`} src={bg} alt="" loading="lazy" decoding="async" onError={hideBroken} />
      ))}
      <div className="welcome-shade" />
      <h2 className="wlabel">{t('wWhat')}</h2>
      <div className="wflow" aria-live="polite" onWheel={swipe}>
        {FEATURES.map(({ key, icon: Icon }, i) => (
          <button key={key} type="button" className="wfx-card" style={flow(i, active)} aria-current={i === active} onClick={() => setActive(i)}>
            <Icon className="ic" aria-hidden="true" />
            <strong>{t(key)}</strong>
            <small>{t(`${key}Sub`)}</small>
            <p>{t(`${key}Body`)}</p>
          </button>
        ))}
      </div>
      <div className="wfx-bar">
        <button className="iconbtn" type="button" aria-label={paused ? t('wPlay') : t('wPause')} onClick={() => setPaused(!paused)}>
          {paused ? <Play className="ic" aria-hidden="true" /> : <Pause className="ic" aria-hidden="true" />}
        </button>
        {FEATURES.map(({ key }, i) => (
          <button key={key} type="button" className="wfx-tick" aria-label={t(key)} aria-current={i === active} onClick={() => setActive(i)}>
            <span>0{i + 1}</span>
            <i>{i === active && <i key={`${active}${paused}`} style={{ animationDuration: `${FEATURE_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }} />}</i>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Featured articles as a row of covers; the middle one opens. */
function Featured({ items, onOpen }: { items: FeedItem[]; onOpen: (slug?: string) => void }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const [active, setActive] = useState(Math.min(2, items.length - 1));
  const go = (d: number) => setActive((i) => (i + d + items.length) % items.length);
  const swipe = useSwipeStep(go);
  if (!items.length) return null;
  const n = (i: number) => String(i).padStart(2, '0');
  return (
    <section className="wcf" id="w-picks" aria-label={t('wFeatured')}>
      <img className="wfx-bg on" key={items[active].slug} src={coverThumb(items[active])} alt="" onError={hideBroken} />
      <div className="welcome-shade" />
      <h2 className="wlabel">{t('wFeatured')}</h2>
      <span className="wcf-count">
        {n(active + 1)} <i>/ {n(items.length)}</i>
      </span>
      <div className="wflow" onWheel={swipe}>
        {items.map((item, i) => (
          <FeaturedCard key={item.slug} item={item} title={pick(item.title, lang) ?? ''} style={flow(i, active)} on={i === active} onPick={() => (i === active ? onOpen(item.slug) : setActive(i))} />
        ))}
      </div>
      <button className="iconbtn wcf-arrow prev" type="button" aria-label={t('wPrev')} onClick={() => go(-1)}>
        <ChevronLeft className="ic" aria-hidden="true" />
      </button>
      <button className="iconbtn wcf-arrow next" type="button" aria-label={t('wNext')} onClick={() => go(1)}>
        <ChevronRight className="ic" aria-hidden="true" />
      </button>
      <button className="wcf-now" type="button" onClick={() => onOpen()}>
        {t('wReadNow')}
        <i aria-hidden="true" />
      </button>
    </section>
  );
}

function FeaturedCard({ item, title, style, on, onPick }: { item: FeedItem; title: string; style: React.CSSProperties; on: boolean; onPick: () => void }) {
  const t = useT();
  const cat = useCategoryName(item.category);
  return (
    <button type="button" className="wcf-card" style={{ ...style, ['--dominant' as string]: item.cover.dominant }} aria-current={on} onClick={onPick}>
      <CardMedia item={item} />
      <em>{cat}</em>
      <strong>{title}</strong>
      <span>
        {t('wReadArticle')}
        <ArrowRight className="ic" aria-hidden="true" />
      </span>
    </button>
  );
}
