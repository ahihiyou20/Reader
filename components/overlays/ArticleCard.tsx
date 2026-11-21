'use client';
import { Heart } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { cloudinarySized, cloudinaryVideoSized, isCloudinaryImage } from '@/lib/cloudinary';
import { useReducedMotion } from '../hooks';
import { formatCount } from '@/lib/format';
import { pick } from '@/lib/i18n';
import { useUI } from '@/stores/ui';
import { useShallow } from 'zustand/react/shallow';
import { countsFor, useUser } from '@/stores/user';
import { useCategoryName } from '../feed/CoverView';
import { zoomOpen } from './zoom';

/** Ask an image CDN for a smaller file: a card does not need the full-screen cover. */
export function sized(url: string, w: number, h: number): string {
  if (isCloudinaryImage(url)) return cloudinarySized(url, w, h);
  if (!url.startsWith('https://images.unsplash.com/')) return url;
  const u = new URL(url);
  u.searchParams.set('w', String(w));
  u.searchParams.set('h', String(h));
  return u.toString();
}

/** Cards a grid shows at first, and adds as the reader scrolls near its end. */
export const CARD_PAGE = 24;

/** Explore's trending row: what readers liked, saved and shared most, with a lift for this week's. */
export function trending(items: FeedItem[]): FeedItem[] {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const score = (i: FeedItem) =>
    i.counts.likes + 2 * i.counts.saves + 3 * i.counts.shares + 2 * i.counts.comments + (Date.parse(i.publishedAt) > weekAgo ? 5 : 0);
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, 6);
}

export function coverThumb(item: FeedItem, wide = false) {
  if (wide && item.cover.wide) return sized(item.cover.wide, 720, 405);
  return sized(item.cover.type === 'video' ? item.cover.poster ?? '' : item.cover.url, 480, 640);
}

/**
 * A card's picture: the article's clip when it has one, as on its cover, playing only while the card is
 * on screen (a grid of moving cards would spend the battery on ones nobody sees); otherwise its photo.
 */
export function CardMedia({ item, wide = false }: { item: FeedItem; wide?: boolean }) {
  const still = useReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  const clip = item.cover.video && !still ? (wide && item.cover.video.wide) || item.cover.video.url : undefined;
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? v.play().catch(() => {}) : v.pause()), { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, [clip]);
  if (clip)
    return (
      <video
        ref={ref}
        key={clip}
        src={wide ? cloudinaryVideoSized(clip, 720, 405) : cloudinaryVideoSized(clip, 480, 640)}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        onLoadedData={(e) => e.currentTarget.classList.add('in')}
      />
    );
  return (
    <img
      src={coverThumb(item, wide)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={(e) => e.currentTarget.classList.add('in')}
      onError={(e) => (e.currentTarget.hidden = true)}
    />
  );
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
      onClick={(e) => {
        zoomOpen(e.currentTarget, item.slug);
        onOpen();
      }}
      style={{ ['--dominant' as string]: item.cover.dominant, ['--i' as string]: Math.min(index, 16) }}
    >
      {/* The tiny blurred cover shows at once; the photo fades in over it, or never replaces it if it fails. */}
      {item.cover.blurDataURL && <span className="cblur" style={{ backgroundImage: `url(${item.cover.blurDataURL})` }} />}
      <CardMedia item={item} wide={wide} />
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
