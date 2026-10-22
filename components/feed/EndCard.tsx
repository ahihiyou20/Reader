'use client';
import { Compass } from 'lucide-react';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';
import { goToArticle } from './nav';

export function EndCard({ top }: { top: number }) {
  const t = useT();
  const openOverlay = useUI((s) => s.openOverlay);
  const category = useUI((s) => s.category);
  const startFeed = useUI((s) => s.startFeed);
  return (
    <section className="article" style={{ top }} aria-label={t('endTitle')}>
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
