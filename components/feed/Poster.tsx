import type { CSSProperties } from 'react';
import { COVER_SIZES } from '@/lib/covers';
import { splitTitle, titleStyle } from '@/lib/title';

export interface PosterProps {
  coverSrc: string;
  /** Self-hosted variants of the same cover; the real first cover uses the same set. */
  srcSet?: string;
  title: string;
  /** The cover title's lettering style follows the category, as on the live cover. */
  category: string;
  slug: string;
  fading?: boolean;
}

export function Poster({ coverSrc, srcSet, title, category, slug: _slug, fading }: PosterProps) {
  const { lead, accent } = splitTitle(title);
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
          {/* The same lockup as CoverView, so the hand-over from this poster to the live cover is invisible. */}
          <h2
            className={`${fading ? 'poster-title ' : ''}ctitle t-${titleStyle(category)}${title.length > 70 ? ' long' : ''}`}
            data-region="cover-title"
            style={{ ['--n' as string]: title.length }}
          >
            {lead && <span className="ta">{`${lead} `}</span>}
            <span className="tb">{accent}</span>
          </h2>
        </div>
      </div>
    </div>
  );
}
