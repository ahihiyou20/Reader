'use client';
import { useMemo, useRef } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useFeed } from '@/lib/data';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';

/**
 * Feed order for this session: the build-time ranking, filtered by the chosen category, with
 * articles already finished moved to the end, and an optional starting article first.
 * The list stays stable while reading (it does not re-sort when progress changes).
 */
export function useFeedList(override?: FeedItem[]): FeedItem[] | undefined {
  const { data } = useFeed();
  const category = useUI((s) => s.category);
  const startSlug = useUI((s) => s.startSlug);
  const version = useUI((s) => s.feedVersion);
  const ready = useUser((s) => s.ready);
  // Once the reader's progress is known, re-sort a single time if they have not moved yet.
  const settled = useRef(false);
  if (ready && !settled.current && version === 0 && useUI.getState().index === 0) settled.current = true;
  const settle = settled.current;
  const first = useRef<string | null>(null);
  return useMemo(() => {
    if (override) return override;
    if (!data) return undefined;
    let items = data.items;
    if (category) items = items.filter((i) => i.category === category);
    const progress = useUser.getState().progress;
    items = [...items.filter((i) => !progress[i.slug]?.completed), ...items.filter((i) => progress[i.slug]?.completed)];
    const start = startSlug ?? first.current;
    if (start) {
      const it = data.items.find((i) => i.slug === start);
      if (it) items = [it, ...items.filter((i) => i.slug !== start)];
    }
    if (!first.current && items[0]) first.current = items[0].slug;
    return items;
    // Recompute only when the feed is (re)started, not while reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, category, startSlug, version, override, settle]);
}
