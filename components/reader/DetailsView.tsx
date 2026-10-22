'use client';
// SCR-02 Details: sections with focus/dim, collapsing header, KEY POINT, sources, dots (FR-05..FR-09).
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { ChevronDown, ChevronsRight, Library } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArticleClient, FeedItem } from '@/lib/content/types';
import { completeArticle, loadLiveCounts, rememberSection, shareArticle, toggleLike, toggleSave } from '@/lib/actions';
import { track } from '@/lib/analytics';
import { isFallback, pick } from '@/lib/i18n';
import { clamp, prefersReducedMotion } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { useShallow } from 'zustand/react/shallow';
import { countsFor, useUser } from '@/stores/user';
import { ActionButton } from '../ActionButton';
import { RichText } from '../RichText';
import { useT } from '../hooks';
import { layout, setArticleView } from '../feed/nav';

const MAX_DOTS = 9;

export function DetailsView({ article, item, active, view }: { article: ArticleClient; item: FeedItem; active: boolean; view: number }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const openSheet = useUI((s) => s.openSheet);
  const liked = useUser((s) => Boolean(s.likes[item.slug]));
  const saved = useUser((s) => Boolean(s.saves[item.slug]));
  const counts = useUser(useShallow((s) => countsFor(s, item.slug, article.counts)));
  const slug = article.slug;

  const scroll = useRef<HTMLDivElement>(null);
  const secs = useRef<Array<HTMLDivElement | null>>([]);
  const kp = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Set<number>>(() => new Set([0]));
  const [current, setCurrent] = useState(0);
  const [kpShown, setKpShown] = useState(false);

  const blocks = article.sections.length + 2; // hook + sections + key point block
  const title = pick(article.title, lang) ?? '';
  const fallback = lang === 'vi' && !article.hasVi;

  // Header collapse follows the scroll position directly (no timers).
  // Collapsed positions are fixed under the top bar; the expanded offset (gap) depends on screen height.
  const gap = clamp(layout.h * 0.18, 100, 152);
  const q = useMotionValue(0);
  const prowY = useTransform(q, (v) => (1 - v) * (gap - 62));
  const titleY = useTransform(q, (v) => -110 * v);
  const titleO = useTransform(q, (v) => clamp(1 - v * 1.6, 0, 1));
  const stickyO = useTransform(q, (v) => clamp((v - 0.4) / 0.6, 0, 1));
  const rowY = useTransform(q, (v) => (1 - v) * (gap - 25));
  const rowS = useTransform(q, (v) => 1 - 0.2 * v);

  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    let raf = 0;
    const on = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          q.set(clamp(el.scrollTop / 120, 0, 1));
        });
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => {
      el.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, [q]);

  // Restore the last section read (FR-09).
  useEffect(() => {
    const last = useUser.getState().progress[slug]?.lastSection ?? 0;
    if (last > 0 && last < blocks) {
      const s = secs.current[last];
      if (s && scroll.current) scroll.current.scrollTop = Math.max(0, s.offsetTop - layout.h * 0.32);
      setCurrent(last);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // CMP-09: the section in the reading band is bright, the others dim.
  useEffect(() => {
    const root = scroll.current;
    if (!root) return;
    const inBand = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const k = Number((en.target as HTMLElement).dataset.k);
          if (en.isIntersecting) inBand.add(k);
          else inBand.delete(k);
        }
        setFocus(new Set(inBand));
        if (inBand.size) setCurrent(Math.max(...inBand));
      },
      { root, rootMargin: '-28% 0px -40% 0px' },
    );
    secs.current.forEach((s) => s && io.observe(s));
    return () => io.disconnect();
  }, [blocks]);

  useEffect(() => {
    if (!active || view !== 1) return;
    rememberSection(slug, current);
    track('section_view', { articleId: slug, sectionIndex: current, lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, active, view]);

  // Live counters are read only when Details is opened (docs/06 §3.4).
  useEffect(() => {
    if (active && view === 1) loadLiveCounts(slug);
  }, [active, view, slug]);

  useEffect(() => {
    if (active && view === 1) track('article_view', { articleId: slug, lang, view: 'details' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, view === 1]);

  // FR-08/FR-09: KEY POINT visible ≥ 40% for 2 s completes the article.
  useEffect(() => {
    const root = scroll.current;
    const el = kp.current;
    if (!root || !el || !active || view !== 1) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const en = entries[entries.length - 1];
        if (en.isIntersecting) {
          setKpShown(true);
          clearTimeout(timer);
          timer = setTimeout(() => completeArticle(slug), 2000);
        } else clearTimeout(timer);
      },
      { root, threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [active, view, slug]);

  // ...or spending 60% of the estimated reading time in Details.
  useEffect(() => {
    if (!active || view !== 1) return;
    const needed = 0.6 * (article.wordCount / 230) * 60;
    let spent = 0;
    const id = setInterval(() => {
      if (document.hidden) return;
      spent += 1;
      if (spent >= needed) {
        clearInterval(id);
        completeArticle(slug);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [active, view, slug, article.wordCount]);

  const scrollToBlock = (k: number) => {
    const el = scroll.current;
    const s = secs.current[k];
    if (!el || !s) return;
    el.scrollTo({ top: k === 0 ? 0 : s.offsetTop - layout.h * 0.32, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const atEnd = current >= blocks - 1;
  const next = () => (atEnd ? setArticleView(slug, 2) : scrollToBlock(current + 1));
  const cite = (refId: string) => openSheet({ kind: 'sources', slug, refId });

  const dots = useMemo(() => Math.min(blocks, MAX_DOTS), [blocks]);
  const dotOn = blocks <= MAX_DOTS ? current : Math.round((current / (blocks - 1)) * (MAX_DOTS - 1));
  const setRef = (k: number) => (el: HTMLDivElement | null) => {
    secs.current[k] = el;
  };
  const kpText = pick(article.keyPoint, lang);

  return (
    <>
      <div className="dscroll" ref={scroll}>
        <div className={`sec hook${focus.has(0) ? ' on' : ''}`} data-k={0} ref={setRef(0)} lang={isFallback(article.hook, lang) ? 'en' : undefined}>
          <RichText rich={pick(article.hook, lang)} onCite={cite} />
        </div>
        {article.sections.map((s, i) => {
          const k = i + 1;
          const heading = pick(s.heading, lang);
          return (
            <div
              key={k}
              className={`sec${focus.has(k) ? ' on' : ''}`}
              data-k={k}
              ref={setRef(k)}
              lang={isFallback(s.body, lang) ? 'en' : undefined}
            >
              {heading && <h3>{heading}</h3>}
              <RichText rich={pick(s.body, lang)} onCite={cite} />
            </div>
          );
        })}
        <div className={`sec last${focus.has(blocks - 1) ? ' on' : ''}`} data-k={blocks - 1} ref={setRef(blocks - 1)}>
          {kpText && (
            <div className={`kp${kpShown ? '' : ' wait'}`} ref={kp} lang={isFallback(article.keyPoint, lang) ? 'en' : undefined}>
              <div className="kp-l">
                <span aria-hidden="true">💡</span>
                {t('keyPoint')}
              </div>
              <RichText rich={kpText} onCite={cite} />
            </div>
          )}
          {!kpText && <div ref={kp} />}
          <button className="srcline" type="button" onClick={() => openSheet({ kind: 'sources', slug })}>
            <Library className="ic" aria-hidden="true" />
            <span>{t('source', { n: article.references.length })}</span>
          </button>
          <p className="credit">{pick(article.attribution, lang)}</p>
        </div>
      </div>

      <div className="dhead">
        <motion.div className="prow" style={{ y: prowY }}>
          <button className="pill dpill" type="button" onClick={() => scrollToBlock(0)}>
            {t('details')}
          </button>
          <button className="hint" type="button" onClick={() => setArticleView(slug, 2)}>
            {t('toEngage')}
            <ChevronsRight className="ic" aria-hidden="true" />
          </button>
        </motion.div>
        <motion.h2 className="btitle" style={{ y: titleY, opacity: titleO }}>
          {title}
          {fallback && <span className="enonly">{t('enOnly')}</span>}
        </motion.h2>
        <motion.div className="stitle" style={{ opacity: stickyO }} aria-hidden="true">
          {title}
        </motion.div>
        <motion.div className="arow" style={{ y: rowY, scale: rowS }}>
          <ActionButton kind="like" size="md" count={counts.likes} on={liked} label={t('likeAria', { n: counts.likes })} onPress={() => toggleLike(slug)} />
          <ActionButton kind="save" size="md" count={counts.saves} on={saved} label={t('saveAria', { n: counts.saves })} onPress={() => toggleSave(slug)} />
          <ActionButton kind="share" size="md" count={counts.shares} label={t('shareAria', { n: counts.shares })} onPress={() => shareArticle(slug, title)} />
          <ActionButton
            kind="comment"
            size="md"
            count={counts.comments}
            label={t('commentAria', { n: counts.comments })}
            onPress={() => setArticleView(slug, 2)}
          />
        </motion.div>
      </div>

      <div className="dfoot">
        <button className="cb nextbtn" type="button" aria-label={atEnd ? t('goEngage') : t('next')} onClick={next}>
          {atEnd ? <ChevronsRight className="ic" strokeWidth={3} aria-hidden="true" /> : <ChevronDown className="ic" strokeWidth={3} aria-hidden="true" />}
        </button>
        <div className="dots" role="img" aria-label={t('sectionOf', { i: current + 1, n: blocks })}>
          {Array.from({ length: dots }, (_, i) => (
            <i key={i} className={i === dotOn ? 'on' : undefined} />
          ))}
        </div>
      </div>
    </>
  );
}

export function DetailsSkeleton({ item, error, onRetry }: { item: FeedItem; error?: boolean; onRetry?: () => void }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  return (
    <>
      <div className="dscroll" aria-busy="true">
        {error ? (
          <div className="cempty">
            <span>{t('loadError')}</span>
            <button className="pill" type="button" onClick={onRetry}>
              {t('retry')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {[96, 88, 92, 70, 0, 84, 94, 60].map((w, i) =>
              w ? <div key={i} className="skel" style={{ height: 20, width: `${w}%` }} /> : <div key={i} style={{ height: 14 }} />,
            )}
          </div>
        )}
      </div>
      <div className="dhead">
        <div className="prow">
          <span className="pill dpill">{t('details')}</span>
        </div>
        <h2 className="btitle">{pick(item.title, lang)}</h2>
      </div>
    </>
  );
}
