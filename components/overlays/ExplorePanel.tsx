'use client';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCategories, useFeed } from '@/lib/data';
import { pick } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { usePaged, useStaggeredCount, useT } from '../hooks';
import { ArticleCard, CARD_PAGE, trending } from './ArticleCard';
import { Panel } from './Layer';
import { Indicator } from '@/components/ui/Indicator';
import { TopicGlyph } from '../icons';

/** SCR-04 Explore: category chips, trending row, and a grid that fits as many covers as the screen allows (FR-22). */
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
  const top = useMemo(() => trending(items), [items]);
  const grid = cat ? items.filter((i) => i.category === cat) : items;
  // The first cards arrive one after another, as search results do; the rest a page at a time.
  const shown = useStaggeredCount(Math.min(grid.length, CARD_PAGE), open, cat);
  const { limit, sentinel, more } = usePaged(grid.length, CARD_PAGE, cat);
  const staggering = shown < Math.min(grid.length, CARD_PAGE);

  return (
    <Panel
      open={open}
      onClose={() => closeOverlay('explore')}
      label={t('exploreTitle')}
      className="explore"
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
              <TopicGlyph id={c.id} emoji={c.emoji} />
              {pick(c.name, lang)}
            </button>
          ))}
        </div>
        {!cat && top.length > 2 && (
          <>
            <div className="label">{t('trending')}</div>
            <div className="carousel">
              {top.map((i, n) => (
                <ArticleCard key={i.slug} item={i} index={n} wide onOpen={() => startFeed({ category: null, slug: i.slug })} />
              ))}
            </div>
          </>
        )}
        <div className="label">{cat ? pick(cats?.find((c) => c.id === cat)?.name, lang) : t('allArticles')}</div>
        {grid.length ? (
          <div className="grid">
            {grid.slice(0, staggering ? shown : limit).map((i) => (
              <ArticleCard key={`${cat}:${i.slug}`} item={i} showCategory={!cat} onOpen={() => startFeed({ category: cat, slug: i.slug })} />
            ))}
            {more && !staggering && <div ref={sentinel} aria-hidden="true" />}
          </div>
        ) : (
          <div className="empty-note">{t('noArticlesInCategory')}</div>
        )}
      </div>
    </Panel>
  );
}
