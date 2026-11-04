'use client';
// SCR-02 Details: sections with focus/dim, collapsing header, KEY POINT, sources, dots (FR-05..FR-09).
import { MDiv, MH2 } from '@/components/Motion';
import { useMotionValue, useTransform } from 'framer-motion';
import { ArrowUpRight, ChevronDown, ChevronsRight, Library } from 'lucide-react';
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
import { captureAnchor, restoreScrollTop, type BlockBox, type ReadingAnchor } from '@/lib/reading-anchor';
import { CountRoll } from '@/components/ui/CountRoll';

const sweptSlugs = new Set<string>();

const MAX_DOTS = 9;

function getBlockBoxes(root: HTMLElement): BlockBox[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-k]'), (b) => ({
    top: b.offsetTop,
    height: b.offsetHeight,
  }));
}

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
  const latestAnchor = useRef<ReadingAnchor | null>(null);
  const [focus, setFocus] = useState(0);
  const [current, setCurrent] = useState(0);

  const readingProgress = useMotionValue(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const totalMinutes = Math.max(1, Math.ceil(article.wordCount / 220));
  const [minutesLeft, setMinutesLeft] = useState(totalMinutes);
  const [kpSwept, setKpSwept] = useState(() => sweptSlugs.has(slug));
  const [settledHeadings, setSettledHeadings] = useState<Set<number>>(() => new Set([0]));

  const blocks = article.sections.length + 2; // hook + sections + key point block
  const title = pick(article.title, lang) ?? '';
  const fallback = lang === 'vi' && !article.hasVi;

  // Header collapse follows the scroll position directly (no timers).
  // Collapsed positions are fixed under the top bar; the expanded offset (gap) depends on screen height.
  const gap = clamp(layout.h * 0.18, 100, 152);
  const q = useMotionValue(0);
  const reduced = prefersReducedMotion();
  const prowY = useTransform(q, (v) => (reduced ? 0 : (1 - v) * (gap - 62)));
  const titleY = useTransform(q, (v) => (reduced ? 0 : -110 * v));
  const titleO = useTransform(q, (v) => clamp(1 - v * 1.6, 0, 1));
  const stickyO = useTransform(q, (v) => clamp((v - 0.4) / 0.6, 0, 1));
  const rowY = useTransform(q, (v) => (reduced ? 0 : (1 - v) * (gap - 25)));
  const rowS = useTransform(q, (v) => (reduced ? 1 : 1 - 0.2 * v));

  useEffect(() => {
    const el = scroll.current;
    if (!el) return;
    let raf = 0;
    const updateProgress = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      const p = maxScroll > 0 ? clamp(el.scrollTop / maxScroll, 0, 1) : 0;
      readingProgress.set(p);
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${p})`;
      }
      const nextMin = Math.max(0, Math.ceil(totalMinutes * (1 - p)));
      setMinutesLeft((prev) => (prev !== nextMin ? nextMin : prev));
    };
    const on = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          q.set(clamp(el.scrollTop / 120, 0, 1));
          updateProgress();
        });
    };
    updateProgress();
    el.addEventListener('scroll', on, { passive: true });
    return () => {
      el.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
    };
  }, [q, readingProgress, totalMinutes]);

  useEffect(() => {
    return readingProgress.on('change', (val) => {
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${val})`;
      }
    });
  }, [readingProgress]);

  useEffect(() => {
    if (focus === blocks - 1 && !sweptSlugs.has(slug)) {
      sweptSlugs.add(slug);
      setKpSwept(true);
    }
    setSettledHeadings((prev) => {
      if (prev.has(focus)) return prev;
      const next = new Set(prev);
      next.add(focus);
      return next;
    });
  }, [focus, blocks, slug]);

  // Restore the last section read (FR-09).
  useEffect(() => {
    const last = useUser.getState().progress[slug]?.lastSection ?? 0;
    if (last > 0 && last < blocks) {
      const s = secs.current[last];
      if (s && scroll.current) {
        const root = scroll.current;
        const newTop = Math.max(0, s.offsetTop - layout.h * 0.32);
        root.scrollTop = newTop;
        latestAnchor.current = captureAnchor(getBlockBoxes(root), newTop, root.clientHeight * 0.42);
      }
      setCurrent(last);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // CMP-09: one block is in focus at a time, the one crossing the reading line (42% down the screen);
  // the others recede (dim, slightly smaller and softer). State changes only when the focus moves.
  useEffect(() => {
    const root = scroll.current;
    if (!root) return;
    let raf = 0;
    let isRestoring = false;
    const pick = () => {
      raf = 0;
      const lineY = root.clientHeight * 0.42;
      const line = root.scrollTop + lineY;
      const atBottom = root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
      let k = 0;
      for (let i = 0; i < secs.current.length; i++) {
        const s = secs.current[i];
        if (s && s.offsetTop <= line) k = i;
      }
      if (atBottom) k = secs.current.length - 1;
      setFocus(k);
      setCurrent(k);
      if (!isRestoring) {
        latestAnchor.current = captureAnchor(getBlockBoxes(root), root.scrollTop, lineY);
      }
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(pick);
    };
    pick();
    root.addEventListener('scroll', on, { passive: true });

    let ro: ResizeObserver | undefined;
    let restoreTimer = 0;
    const onWindowResize = () => {
      isRestoring = true;
      clearTimeout(restoreTimer);
      restoreTimer = window.setTimeout(() => {
        isRestoring = false;
      }, 300);
    };
    window.addEventListener('resize', onWindowResize);

    if (typeof ResizeObserver !== 'undefined') {
      let lastW = root.clientWidth;
      let lastH = root.clientHeight;
      let lastChildH = (root.firstElementChild as HTMLElement)?.offsetHeight ?? 0;
      const observer = new ResizeObserver(() => {
        const curW = root.clientWidth;
        const curH = root.clientHeight;
        const curChildH = (root.firstElementChild as HTMLElement)?.offsetHeight ?? 0;
        if (curW === lastW && curH === lastH && curChildH === lastChildH) return;
        lastW = curW;
        lastH = curH;
        lastChildH = curChildH;

        if (!latestAnchor.current) return;
        const boxes = getBlockBoxes(root);
        const lineY = root.clientHeight * 0.42;
        const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
        isRestoring = true;
        clearTimeout(restoreTimer);
        const newTop = restoreScrollTop(latestAnchor.current, boxes, lineY, maxScroll);
        root.scrollTop = newTop;
        q.set(clamp(newTop / 120, 0, 1));
        restoreTimer = window.setTimeout(() => {
          isRestoring = false;
        }, 300);
      });
      observer.observe(root);
      if (root.firstElementChild) {
        observer.observe(root.firstElementChild);
      }
      ro = observer;
    }

    return () => {
      window.removeEventListener('resize', onWindowResize);
      root.removeEventListener('scroll', on);
      cancelAnimationFrame(raf);
      clearTimeout(restoreTimer);
      ro?.disconnect();
    };
  }, [blocks, q]);

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
          if (!sweptSlugs.has(slug)) {
            sweptSlugs.add(slug);
            setKpSwept(true);
          }
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
  const depth = (k: number) => (k === focus ? ' on' : Math.abs(k - focus) === 1 ? ' near' : '');
  const setRef = (k: number) => (el: HTMLDivElement | null) => {
    secs.current[k] = el;
  };
  const kpText = pick(article.keyPoint, lang);
  const o = article.origin;
  // Group 3 cannot be translated: Vietnamese readers get Reader's own summary above the original text.
  const viSummary = lang === 'vi' && o.group === 3 ? article.summary?.vi : undefined;
  const publisher = o.publisher ?? (o.originalUrl ? new URL(o.originalUrl).hostname.replace(/^www\./, '') : '');

  return (
    <>
      <style>{`
        .kp[data-sweep] {
          clip-path: inset(0 100% 0 0);
        }
        .kp[data-sweep].sweep-active {
          animation: kp-sweep 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes kp-sweep {
          0% {
            clip-path: inset(0 100% 0 0);
          }
          100% {
            clip-path: inset(0 0 0 0);
          }
        }
        .kp-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: 18px;
          box-shadow: 0 0 24px rgba(255, 61, 139, 0.45);
          opacity: 0;
        }
        .kp-glow.on {
          animation: kp-glow-breath 500ms cubic-bezier(0.16, 1, 0.3, 1) 1;
        }
        @keyframes kp-glow-breath {
          0% {
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
        .sec h3.h-settled {
          animation: heading-settle 250ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes heading-settle {
          0% {
            transform: translateY(4px);
            opacity: 0.6;
          }
          100% {
            transform: none;
            opacity: 1;
          }
        }
        .sec.on .hl {
          animation: hl-marker-sweep 480ms cubic-bezier(0.16, 1, 0.3, 1) 1;
        }
        @keyframes hl-marker-sweep {
          0% {
            clip-path: inset(0 100% 0 0);
          }
          100% {
            clip-path: inset(0 0 0 0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .kp[data-sweep],
          .kp[data-sweep].sweep-active {
            clip-path: inset(0 0 0 0) !important;
            animation: none !important;
          }
          .kp-glow,
          .kp-glow.on {
            animation: none !important;
          }
          .sec h3,
          .sec h3.h-settled {
            transform: none !important;
            opacity: 1 !important;
            animation: none !important;
          }
          .sec.on .hl {
            animation: none !important;
            clip-path: inset(0 0 0 0) !important;
          }
        }
      `}</style>
      <div
        className="dscroll"
        ref={scroll}
        data-region="reading"
        style={active && view === 1 ? { viewTransitionName: 'reading-col' } : undefined}
      >
        <div className={`sec hook${depth(0)}`} data-k={0} ref={setRef(0)} lang={isFallback(article.hook, lang) ? 'en' : undefined}>
          {o.group === 5 && <p className="glabel">{t('readerSummary', { publisher })}</p>}
          {viSummary && viSummary.length > 0 && (
            <div className="vsum" lang="vi">
              <p className="glabel">{t('viSummary')}</p>
              <RichText rich={viSummary} onCite={cite} />
            </div>
          )}
          <RichText rich={pick(article.hook, lang)} onCite={cite} />
        </div>
        {article.sections.map((s, i) => {
          const k = i + 1;
          const heading = pick(s.heading, lang);
          return (
            <div
              key={k}
              className={`sec${depth(k)}`}
              data-k={k}
              ref={setRef(k)}
              lang={isFallback(s.body, lang) ? 'en' : undefined}
            >
              {heading && <h3 className={settledHeadings.has(k) ? 'h-settled' : undefined}>{heading}</h3>}
              <RichText rich={pick(s.body, lang)} onCite={cite} />
            </div>
          );
        })}
        <div className={`sec last${depth(blocks - 1)}`} data-k={blocks - 1} ref={setRef(blocks - 1)} style={{ filter: 'none', transform: 'none' }}>
          {kpText && (
            <div
              data-sweep
              className={`kp${kpSwept ? ' sweep-active' : ''}`}
              ref={kp}
              lang={isFallback(article.keyPoint, lang) ? 'en' : undefined}
            >
              <div className={`kp-glow${kpSwept ? ' on' : ''}`} />
              <div className="kp-l">
                <span aria-hidden="true">💡</span>
                {t('keyPoint')}
              </div>
              <RichText rich={kpText} onCite={cite} />
            </div>
          )}
          {!kpText && <div ref={kp} />}
          {o.group === 5 && o.originalUrl && (
            <a className="orig" href={o.originalUrl} target="_blank" rel="noopener noreferrer">
              <span>
                {t('readOriginal')}
                <small>{t('readOriginalSub', { publisher })}</small>
              </span>
              <ArrowUpRight className="ic" aria-hidden="true" />
            </a>
          )}
          <button className="srcline" type="button" onClick={() => openSheet({ kind: 'sources', slug })}>
            <Library className="ic" aria-hidden="true" />
            <span>{t('source', { n: article.references.length })}</span>
          </button>
          <p className="credit">{pick(article.attribution, lang)}</p>
        </div>
      </div>

      <div className="dhead" style={active && view === 1 ? { viewTransitionName: 'details-head' } : undefined}>
        <div
          data-region="details-head"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 'calc(var(--sat) + 62px)',
            height: 'calc(var(--d-gap, 152px) + 140px)',
            pointerEvents: 'none',
          }}
        />
        <div
          className="dprogress-row"
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 'calc(var(--sat) + 54px)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div
            className="dprogress-track"
            style={{
              flex: 1,
              height: 2,
              background: 'rgba(255, 255, 255, 0.16)',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <div
              ref={progressRef}
              data-reading-progress
              style={{
                width: '100%',
                height: '100%',
                background: 'var(--brand, #ff3d8b)',
                transformOrigin: 'left',
                transform: 'scaleX(0)',
              }}
            />
          </div>
          <div
            className="dmin-left"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--fg3, rgba(255, 255, 255, 0.6))',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              letterSpacing: '0.02em',
            }}
          >
            <CountRoll value={minutesLeft} />
            <span>m</span>
          </div>
        </div>
        <MDiv className="prow" style={{ y: prowY }}>
          <button className="pill dpill" type="button" onClick={() => scrollToBlock(0)}>
            {t('details')}
          </button>
          <button className="hint" type="button" onClick={() => setArticleView(slug, 2)}>
            {t('toEngage')}
            <ChevronsRight className="ic" aria-hidden="true" />
          </button>
        </MDiv>
        <MH2 className="btitle" style={{ y: titleY, opacity: titleO }}>
          {title}
          {fallback && <span className="enonly">{t('enOnly')}</span>}
        </MH2>
        <MDiv className="stitle" style={{ opacity: stickyO }} aria-hidden="true">
          {title}
        </MDiv>
        <MDiv className="arow" style={{ y: rowY, scale: rowS }}>
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
        </MDiv>
      </div>

      <div className="dfoot">
        <div data-region="details-foot" style={{ pointerEvents: 'auto' }}>
          <button className="cb nextbtn" type="button" aria-label={atEnd ? t('goEngage') : t('next')} onClick={next}>
            {atEnd ? <ChevronsRight className="ic" strokeWidth={3} aria-hidden="true" /> : <ChevronDown className="ic" strokeWidth={3} aria-hidden="true" />}
          </button>
        </div>
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
      <div className="dscroll" data-skeleton aria-busy="true">
        {error ? (
          <div className="cempty">
            <span>{t('loadError')}</span>
            <button className="pill" type="button" onClick={onRetry}>
              {t('retry')}
            </button>
          </div>
        ) : (
          <>
            <div className="sec hook on" data-skel-block="0">
              <p aria-hidden="true">
                <span className="skel-text">
                  How common are mental health issues? International health statistics often publish estimates on the share of people who have a mental health disorder at a given point in time. For example, the Global Burden of Disease study estimates that in 2023, 5% of people in the United States had depression.
                </span>
              </p>
            </div>
            <div className="sec near" data-skel-block="1">
              <p aria-hidden="true">
                <span className="skel-text">
                  But people can develop a mental health issue at any stage of their life, or experience recurring episodes over their lifetime.
                </span>
              </p>
              <p aria-hidden="true">
                <span className="skel-text">
                  These statistics don’t tell us anything about what share of people will ever experience a mental health problem. That’s the question I want to answer in this article.
                </span>
              </p>
              <p aria-hidden="true">
                <span className="skel-text">
                  To do this, I’ll use data from a 2023 study by John McGrath and colleagues, which drew on data from 29 countries to model what share of people develop mental disorders over their lives.
                </span>
              </p>
            </div>
            <div className="sec" data-skel-block="2">
              <p aria-hidden="true">
                <span className="skel-text">
                  This data came from World Mental Health Surveys, conducted between 2001 and 2022. In these surveys, more than 150,000 people are asked in face-to-face interviews about their history of specific mental health disorders. These are structured diagnostic interviews, and from there, researchers can understand the prevalence of these disorders and when they tend to begin in someone’s life.
                </span>
              </p>
            </div>
          </>
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
