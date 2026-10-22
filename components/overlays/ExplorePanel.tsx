'use client';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCategories, useFeed } from '@/lib/data';
import { pick } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';
import { ArticleCard } from './ArticleCard';
import { Panel } from './Layer';

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
  useEffect(() => {
    if (open) setCat(useUI.getState().category);
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
            {grid.map((i) => (
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
