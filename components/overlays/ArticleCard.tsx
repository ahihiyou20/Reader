'use client';
import { Heart } from 'lucide-react';
import type { FeedItem } from '@/lib/content/types';
import { formatCount } from '@/lib/format';
import { pick } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { useShallow } from 'zustand/react/shallow';
import { countsFor, useUser } from '@/stores/user';
import { useCategoryName } from '../feed/CoverView';

export function coverThumb(item: FeedItem) {
  return item.cover.type === 'video' ? item.cover.poster ?? '' : item.cover.url;
}

export function ArticleCard({ item, onOpen, showCategory = true }: { item: FeedItem; onOpen: () => void; showCategory?: boolean }) {
  const lang = useUI((s) => s.lang);
  const counts = useUser(useShallow((s) => countsFor(s, item.slug, item.counts)));
  const cat = useCategoryName(item.category);
  return (
    <button className="card" type="button" onClick={onOpen} style={{ ['--dominant' as string]: item.cover.dominant }}>
      <img src={coverThumb(item)} alt="" loading="lazy" decoding="async" draggable={false} />
      <span className="shade" />
      <span className="ct">{pick(item.title, lang)}</span>
      <span className="cl">
        <Heart className="ic" aria-hidden="true" />
        {formatCount(counts.likes)}
        {showCategory && cat && <span className="cat">{cat}</span>}
      </span>
    </button>
  );
}
