'use client';
import { MDiv } from '@/components/Motion';
import { m, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useArticle } from '@/lib/data';
import { shadeFor } from '@/lib/format';
import { pick } from '@/lib/i18n';
import { clamp } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { CoverMedia } from '../CoverMedia';
import { optCover } from '@/lib/covers';
import { DetailsSkeleton, DetailsView } from '../reader/DetailsView';
import { EngageView } from '../engage/EngageView';
import { CoverView } from './CoverView';
import { registerFade, viewP } from './nav';

export function ArticlePage({
  item,
  index,
  total,
  top: _top,
  active,
  priority,
}: {
  item: FeedItem;
  index: number;
  total: number;
  top?: string | number;
  active: boolean;
  priority: boolean;
}) {
  const p = viewP(item.slug);
  const x = useTransform(p, (v) => `${-v * 100}%`);
  const blur = useTransform(p, (v) => clamp(v, 0, 1));
  const eng = useTransform(p, (v) => clamp(v - 1, 0, 1));
  const o0 = useTransform(p, (v) => 1 - 0.4 * clamp(Math.abs(v), 0, 1));
  const o1 = useTransform(p, (v) => 1 - 0.4 * clamp(Math.abs(v - 1), 0, 1));
  const o2 = useTransform(p, (v) => 1 - 0.4 * clamp(Math.abs(v - 2), 0, 1));
  const lang = useUI((s) => s.lang);
  const view = useUI((s) => s.views[item.slug] ?? 0);
  // Details and Comments are only built for the article in front of the reader (and kept afterwards).
  const [built, setBuilt] = useState(active);
  useEffect(() => {
    if (active) setBuilt(true);
  }, [active]);
  const { data: article, isError, refetch } = useArticle(item.slug, built || active);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  const title = pick(item.title, lang) ?? '';
  const titleId = `t-${item.slug}`;

  return (
    <section
      className="article"
      data-slug={item.slug}
      data-active={active ? 'true' : 'false'}
      style={{
        top: `${index * 100}%`,
        ['--dominant' as string]: item.cover.dominant,
        ['--shade' as string]: shadeFor(item.cover.dominant),
      }}
      inert={!active || undefined}
    >
      <div
        className="article-inner"
        role="article"
        aria-labelledby={titleId}
        aria-posinset={index + 1}
        aria-setsize={total}
        lang={lang === 'vi' && item.title.vi ? 'vi' : 'en'}
      >
        <div className="bg">
          <div className="layer sharp" style={active ? { viewTransitionName: 'cover-media' } : undefined}>
            <CoverMedia cover={item.cover} opt={optCover(item.slug)} priority={priority} playing={active && view < 2 && visible} />
          </div>
          <MDiv className="layer blur" style={{ opacity: blur }}>
            {(built || active) && <CoverMedia cover={item.cover} opt={optCover(item.slug)} blurred />}
            <div className="dim" />
          </MDiv>
          <MDiv className="layer eng" style={{ opacity: eng }} />
          <div className="grain" />
        </div>
        <m.div className="views" style={{ x }} ref={(el) => registerFade(item.slug, el)}>
          <MDiv
            className="view cover"
            data-view={view === 0 ? 'cover' : undefined}
            style={{ opacity: o0 }}
            aria-hidden={view !== 0}
            inert={view !== 0 || undefined}
          >
            <CoverView item={item} titleId={titleId} title={title} active={active} view={view} />
          </MDiv>
          <MDiv
            className="view details"
            data-view={view === 1 ? 'details' : undefined}
            style={{ opacity: o1 }}
            aria-hidden={view !== 1}
            inert={view !== 1 || undefined}
          >
            {built &&
              (article ? (
                <DetailsView article={article} item={item} active={active} view={view} />
              ) : (
                <DetailsSkeleton item={item} error={isError} onRetry={() => refetch()} />
              ))}
          </MDiv>
          <MDiv
            className="view engage"
            data-view={view === 2 ? 'engage' : undefined}
            style={{ opacity: o2 }}
            aria-hidden={view !== 2}
            inert={view !== 2 || undefined}
          >
            {built && article && <EngageView article={article} item={item} active={active} view={view} />}
          </MDiv>
        </m.div>
      </div>
    </section>
  );
}
