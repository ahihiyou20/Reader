'use client';
import { Heart } from 'lucide-react';
import type { FeedItem } from '@/lib/content/types';
import { cloudinarySized, isCloudinaryImage } from '@/lib/cloudinary';
import { formatCount } from '@/lib/format';
import { pick } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { useShallow } from 'zustand/react/shallow';
import { countsFor, useUser } from '@/stores/user';
import { useCategoryName } from '../feed/CoverView';

/** Ask an image CDN for a smaller file: a card does not need the full-screen cover. */
export function sized(url: string, w: number, h: number): string {
  if (isCloudinaryImage(url)) return cloudinarySized(url, w, h);
  if (!url.startsWith('https://images.unsplash.com/')) return url;
  const u = new URL(url);
  u.searchParams.set('w', String(w));
  u.searchParams.set('h', String(h));
  return u.toString();
}

export function coverThumb(item: FeedItem, wide = false) {
  if (wide && item.cover.wide) return sized(item.cover.wide, 720, 405);
  return sized(item.cover.type === 'video' ? item.cover.poster ?? '' : item.cover.url, 480, 640);
}

export function ArticleCard({
  item,
  onOpen,
  showCategory = true,
  index = 0,
  wide = false,
}: {
  item: FeedItem;
  onOpen: () => void;
  showCategory?: boolean;
  /** Position in its list: the first cards arrive one after another. */
  index?: number;
  /** Landscape card (16:9) using the landscape cover. */
  wide?: boolean;
}) {
  const lang = useUI((s) => s.lang);
  const counts = useUser(useShallow((s) => countsFor(s, item.slug, item.counts)));
  const cat = useCategoryName(item.category);
  return (
    <button
      className={`card${wide ? ' wide' : ''}`}
      type="button"
      onClick={onOpen}
      style={{ ['--dominant' as string]: item.cover.dominant, ['--i' as string]: Math.min(index, 16) }}
    >
      {/* The tiny blurred cover shows at once; the photo fades in over it, or never replaces it if it fails. */}
      {item.cover.blurDataURL && <span className="cblur" style={{ backgroundImage: `url(${item.cover.blurDataURL})` }} />}
      <img
        src={coverThumb(item, wide)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={(e) => e.currentTarget.classList.add('in')}
        onError={(e) => (e.currentTarget.hidden = true)}
      />
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
