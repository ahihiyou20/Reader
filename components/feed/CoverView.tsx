'use client';
import { ChevronsRight, Compass, LayoutGrid } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useCategories } from '@/lib/data';
import { shareArticle, toggleLike, toggleSave } from '@/lib/actions';
import { pick } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { useShallow } from 'zustand/react/shallow';
import { countsFor, useUser } from '@/stores/user';
import { ActionButton } from '../ActionButton';
import { useT } from '../hooks';
import { setArticleView } from './nav';

let hintShown = false;

export function CoverView({ item, titleId, title }: { item: FeedItem; titleId: string; title: string }) {
  const t = useT();
  const lang = useUI((s) => s.lang);
  const openOverlay = useUI((s) => s.openOverlay);
  const liked = useUser((s) => Boolean(s.likes[item.slug]));
  const saved = useUser((s) => Boolean(s.saves[item.slug]));
  const counts = useUser(useShallow((s) => countsFor(s, item.slug, item.counts)));
  // SwipeHint nudges three times on the first article only (docs/03 CMP-07).
  const [nudge] = useState(() => {
    if (hintShown) return false;
    try {
      if (localStorage.getItem('reader.hinted')) return false;
    } catch {}
    hintShown = true;
    return true;
  });
  useEffect(() => {
    if (nudge)
      try {
        localStorage.setItem('reader.hinted', '1');
      } catch {}
  }, [nudge]);
  const long = title.length > 70;
  const toDetails = () => setArticleView(item.slug, 1);

  return (
    <>
      <div className="scrim" />
      <div className="crow">
        <button className="cb gridbtn" type="button" aria-label={t('exploreTitle')} onClick={() => openOverlay('explore')}>
          <LayoutGrid className="ic" aria-hidden="true" />
        </button>
        <button className="pill epill" type="button" onClick={() => openOverlay('explore')}>
          <span>{t('explore')}</span>
          <span className="cmp">
            <Compass className="ic" strokeWidth={1.8} aria-hidden="true" />
            <i className="dot" />
          </span>
        </button>
        <button className={`hint${nudge ? ' nudge' : ''}`} type="button" onClick={toDetails} aria-label={t('toDetails')}>
          <span className="hint-t">{t('toDetails')}</span>
          <ChevronsRight className="ic" aria-hidden="true" />
        </button>
      </div>
      <h2 className={`ctitle${long ? ' long' : ''}`} id={titleId} onClick={toDetails}>
        <span>{title}</span>
      </h2>
      <div className="rail">
        <ActionButton kind="like" size="lg" count={counts.likes} on={liked} label={t('likeAria', { n: counts.likes })} onPress={() => toggleLike(item.slug)} />
        <ActionButton kind="save" size="lg" count={counts.saves} on={saved} label={t('saveAria', { n: counts.saves })} onPress={() => toggleSave(item.slug)} />
        <ActionButton
          kind="share"
          size="lg"
          count={counts.shares}
          label={t('shareAria', { n: counts.shares })}
          onPress={() => shareArticle(item.slug, pick(item.title, lang) ?? '')}
        />
      </div>
    </>
  );
}

export function useCategoryName(id: string): string | undefined {
  const { data } = useCategories();
  const lang = useUI((s) => s.lang);
  const c = data?.find((x) => x.id === id);
  return c ? pick(c.name, lang) : undefined;
}
