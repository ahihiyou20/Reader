'use client';
import { useEffect, useRef, useState } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useUI } from '@/stores/ui';

/**
 * Ambient backdrop: displays the active article cover blurred and dimmed
 * to fill the margins outside the stage on wide viewports.
 */
export function Ambient({ items }: { items?: FeedItem[] }) {
  const index = useUI((s) => s.index);
  const activeItem = items?.[index];
  const coverUrl = activeItem?.cover
    ? activeItem.cover.type === 'video'
      ? activeItem.cover.poster || activeItem.cover.url
      : activeItem.cover.url
    : '';

  const [layers, setLayers] = useState<{
    front: 'a' | 'b';
    urlA: string;
    urlB: string;
  }>({
    front: 'a',
    urlA: coverUrl,
    urlB: '',
  });

  const lastUrl = useRef(coverUrl);

  useEffect(() => {
    if (!coverUrl || coverUrl === lastUrl.current) return;
    lastUrl.current = coverUrl;
    setLayers((prev) => {
      if (prev.front === 'a') {
        return { front: 'b', urlA: prev.urlA, urlB: coverUrl };
      } else {
        return { front: 'a', urlA: coverUrl, urlB: prev.urlB };
      }
    });
  }, [coverUrl]);

  return (
    <div className="ambient" data-region="ambient" aria-hidden="true">
      {layers.urlA && (
        <div
          className={`ambient-layer${layers.front === 'a' ? ' active' : ''}`}
          style={{ backgroundImage: `url(${layers.urlA})` }}
        />
      )}
      {layers.urlB && (
        <div
          className={`ambient-layer${layers.front === 'b' ? ' active' : ''}`}
          style={{ backgroundImage: `url(${layers.urlB})` }}
        />
      )}
      <div className="ambient-dim" />
    </div>
  );
}
