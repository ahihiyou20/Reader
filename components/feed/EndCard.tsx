'use client';
import { Compass } from 'lucide-react';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';
import { goToArticle } from './nav';

export function EndCard({
  top,
  index,
  active = false,
}: {
  top?: string | number;
  index?: number;
  active?: boolean;
}) {
  const t = useT();
  const openOverlay = useUI((s) => s.openOverlay);
  const category = useUI((s) => s.category);
  const startFeed = useUI((s) => s.startFeed);
  const resolvedTop =
    index !== undefined
      ? `${index * 100}%`
      : typeof top === 'string'
        ? top
        : top !== undefined
          ? `${top}px`
          : undefined;

  return (
    <section
      className="article"
      data-slug="__end"
      data-active={active ? 'true' : 'false'}
      style={{ top: resolvedTop }}
      aria-label={t('endTitle')}
    >
      <div className="endcard">
        <div className="logo-mark" aria-hidden="true">
          R
        </div>
        <h2>{t('endTitle')}</h2>
        <p>{t('endSub')}</p>
        <button className="cta" type="button" onClick={() => openOverlay('explore')}>
          {t('exploreNow')}
          <Compass className="ic" aria-hidden="true" />
        </button>
        <button
          className="textbtn"
          type="button"
          onClick={() => (category ? startFeed({ category: null }) : goToArticle(0, 0, false))}
        >
          {category ? t('allArticles') : t('backToTop')}
        </button>
      </div>
    </section>
  );
}
