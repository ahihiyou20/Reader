'use client';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCategories, useFeed } from '@/lib/data';
import { pick } from '@/lib/i18n';
import { prefersReducedMotion } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';
import { ArticleCard } from './ArticleCard';
import { Panel } from './Layer';
import { Indicator } from '@/components/ui/Indicator';

/** SCR-04 Explore: category chips, trending carousel, 2-column grid (FR-22). */
export function ExplorePanel() {
  const t = useT();
  const open = useUI((s) => s.overlays.includes('explore'));
  const closeOverlay = useUI((s) => s.closeOverlay);
  const openOverlay = useUI((s) => s.openOverlay);
  const startFeed = useUI((s) => s.startFeed);
  const lang = useUI((s) => s.lang);
  const { data: feed } = useFeed();
  const { data: cats } = useCategories();
  const [cat, setCat] = useState<string | null>(null);
  const [staggerCount, setStaggerCount] = useState(0);

  useEffect(() => {
    if (open) {
      const currentCat = useUI.getState().category;
      setCat((prev) => (prev === currentCat ? prev : currentCat));
    }
  }, [open]);

  const items = useMemo(() => feed?.items ?? [], [feed]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return m;
  }, [items]);
  const trending = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const score = (i: (typeof items)[number]) =>
      i.counts.likes + 2 * i.counts.saves + 3 * i.counts.shares + 2 * i.counts.comments + (Date.parse(i.publishedAt) > weekAgo ? 5 : 0);
    return [...items].sort((a, b) => score(b) - score(a)).slice(0, 6);
  }, [items]);
  const grid = cat ? items.filter((i) => i.category === cat) : items;

  useEffect(() => {
    if (!open) {
      setStaggerCount(0);
      return;
    }
    if (prefersReducedMotion()) {
      setStaggerCount(grid.length);
      return;
    }
    let rafId: number;
    let active = true;
    let lastTime = 0;
    let count = 0;

    const loop = (now: number) => {
      if (!active) return;
      if (!lastTime) {
        lastTime = now;
        count = 1;
        setStaggerCount(1);
      } else if (now - lastTime >= 40) {
        lastTime = now;
        count++;
        setStaggerCount(count);
        if (count >= grid.length) return;
      }
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const visibleGrid = open && staggerCount > 0 ? grid.slice(0, staggerCount) : [];


  return (
    <Panel
      open={open}
      onClose={() => closeOverlay('explore')}
      label={t('exploreTitle')}
      header={
        <>
          <h2>{t('exploreTitle')}</h2>
          <button className="iconbtn" type="button" aria-label={t('search')} onClick={() => openOverlay('search')}>
            <Search className="ic" aria-hidden="true" />
          </button>
        </>
      }
    >
      <div className="pbody">
        <div className="chips scroll" role="toolbar" aria-label={t('exploreTitle')}>
          <button className="chip" type="button" aria-pressed={cat === null} onClick={() => setCat(null)}>
            {cat === null && <Indicator layoutId="explore-chips" />}
            {t('all')}
          </button>
          {cats?.map((c) => (
            <button
              key={c.id}
              className="chip"
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => setCat(c.id)}
              disabled={!counts.get(c.id)}
              style={!counts.get(c.id) ? { opacity: 0.45 } : undefined}
            >
              {cat === c.id && <Indicator layoutId="explore-chips" />}
              <span aria-hidden="true">{c.emoji}</span>
              {pick(c.name, lang)}
            </button>
          ))}
        </div>
        {!cat && trending.length > 2 && (
          <>
            <div className="label">{t('trending')}</div>
            <div className="carousel">
              {trending.map((i) => (
                <ArticleCard key={i.slug} item={i} onOpen={() => startFeed({ category: null, slug: i.slug })} />
              ))}
            </div>
          </>
        )}
        <div className="label">{cat ? pick(cats?.find((c) => c.id === cat)?.name, lang) : t('allArticles')}</div>
        {grid.length ? (
          <div className="grid">
            {visibleGrid.map((i) => (
              <ArticleCard key={i.slug} item={i} showCategory={!cat} onOpen={() => startFeed({ category: cat, slug: i.slug })} />
            ))}
          </div>
        ) : (
          <div className="empty-note">{t('noArticlesInCategory')}</div>
        )}
      </div>
    </Panel>
  );
}
