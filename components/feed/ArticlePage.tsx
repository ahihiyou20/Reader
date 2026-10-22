'use client';
import { m, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useArticle } from '@/lib/data';
import { shadeFor } from '@/lib/format';
import { pick } from '@/lib/i18n';
import { clamp } from '@/lib/motion';
import { useUI } from '@/stores/ui';
import { CoverMedia } from '../CoverMedia';
import { DetailsSkeleton, DetailsView } from '../reader/DetailsView';
import { EngageView } from '../engage/EngageView';
import { CoverView } from './CoverView';
import { layout, registerFade, viewX } from './nav';

export function ArticlePage({
  item,
  index,
  total,
  top,
  active,
  priority,
}: {
  item: FeedItem;
  index: number;
  total: number;
  top: number;
  active: boolean;
  priority: boolean;
}) {
  const x = viewX(item.slug);
  const p = useTransform(x, (v) => -v / layout.w);
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
      style={{ top, ['--dominant' as string]: item.cover.dominant, ['--shade' as string]: shadeFor(item.cover.dominant) }}
      role="article"
      aria-labelledby={titleId}
      aria-posinset={index + 1}
      aria-setsize={total}
      lang={lang === 'vi' && item.title.vi ? 'vi' : 'en'}
      inert={!active || undefined}
    >
      <div className="bg">
        <div className="layer sharp">
          <CoverMedia cover={item.cover} priority={priority} playing={active && view < 2 && visible} />
        </div>
        <m.div className="layer blur" style={{ opacity: blur }}>
          {(built || active) && <CoverMedia cover={item.cover} blurred />}
          <div className="dim" />
        </m.div>
        <m.div className="layer eng" style={{ opacity: eng }} />
        <div className="grain" />
      </div>
      <m.div className="views" style={{ x }} ref={(el) => registerFade(item.slug, el)}>
        <m.div className="view cover" style={{ opacity: o0 }} aria-hidden={view !== 0}>
          <CoverView item={item} titleId={titleId} title={title} />
        </m.div>
        <m.div className="view details" style={{ opacity: o1 }} aria-hidden={view !== 1}>
          {built &&
            (article ? (
              <DetailsView article={article} item={item} active={active} view={view} />
            ) : (
              <DetailsSkeleton item={item} error={isError} onRetry={() => refetch()} />
            ))}
        </m.div>
        <m.div className="view engage" style={{ opacity: o2 }} aria-hidden={view !== 2}>
          {built && article && <EngageView article={article} item={item} active={active} view={view} />}
        </m.div>
      </m.div>
    </section>
  );
}
