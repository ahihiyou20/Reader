import type { CSSProperties } from 'react';
import { COVER_SIZES } from '@/lib/covers';

export interface PosterProps {
  coverSrc: string;
  /** Self-hosted variants of the same cover; the real first cover uses the same set. */
  srcSet?: string;
  title: string;
  slug: string;
  fading?: boolean;
}

export function Poster({ coverSrc, srcSet, title, slug: _slug, fading }: PosterProps) {
  const style: CSSProperties | undefined = fading ? { opacity: 0 } : undefined;

  return (
    <div className={`poster${fading ? ' fading' : ''}`} data-poster style={style}>
      <div className="bg">
        <div className="layer sharp">
          <img
            className="media"
            src={coverSrc}
            srcSet={srcSet}
            sizes={srcSet ? COVER_SIZES : undefined}
            alt=""
            width={540}
            height={960}
            decoding="async"
            fetchPriority="high"
            loading="eager"
            draggable={false}
          />
        </div>
        <div className="grain" />
      </div>
      <div className="views">
        <div className={fading ? 'poster-cover' : 'view cover'} data-view="cover">
          <div className="scrim" />
          <h2 className={fading ? 'poster-title' : 'ctitle'} data-region="cover-title">
            <span>{title}</span>
          </h2>
        </div>
      </div>
    </div>
  );
}
