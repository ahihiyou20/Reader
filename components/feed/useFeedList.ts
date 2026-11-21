'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useFeed } from '@/lib/data';
import { useUI } from '@/stores/ui';
import { BATCH, pickBatch } from '@/lib/recommend';
import { localDate } from '@/lib/streak';
import { useReading, type Daily } from '@/stores/reading';
import { useUser } from '@/stores/user';

/**
 * Feed order for this session. For You is the day's batch (lib/recommend pickBatch), kept in
 * stores/reading so a reload shows the same articles, without the ones read today. A chosen category
 * keeps the editorial order with finished articles last. An optional starting article goes first.
 * The list stays stable while reading (it does not re-sort when progress changes).
 */
export function useFeedList(override?: FeedItem[]): FeedItem[] | undefined {
  const startSlug = useUI((s) => s.startSlug);
  const category = useUI((s) => s.category);
  const today = localDate();
  const stored = useReading.getState().daily;
  // Today's batch may hold articles past the small head file: then wait for the full list.
  const { data } = useFeed(startSlug ?? (!category && stored.day === today ? stored.batch[0] : null));
  const version = useUI((s) => s.feedVersion);
  const ready = useUser((s) => s.ready);
  // Once the reader's progress is known, re-sort a single time if they have not moved yet.
  const settled = useRef(false);
  if (ready && !settled.current && version === 0 && useUI.getState().index === 0) settled.current = true;
  const settle = settled.current;
  const first = useRef<string | null>(null);
  const next = useRef<Daily | null>(null);
  const started = useRef(version);
  const list = useMemo(() => {
    next.current = null;
    // A restarted feed (See more, pull to refresh, a category) opens on its own first article.
    if (version !== started.current) {
      started.current = version;
      first.current = null;
    }
    if (override) return override;
    if (!data) return undefined;
    const progress = useUser.getState().progress;
    let items: FeedItem[];
    if (category) {
      const all = data.items.filter((i) => i.category === category);
      items = [...all.filter((i) => !progress[i.slug]?.completed), ...all.filter((i) => progress[i.slug]?.completed)];
    } else {
      const r = useReading.getState();
      const daily = r.daily.day === today ? r.daily : { day: today, batch: [], shown: [] };
      const readToday = new Set(r.history.filter((h) => h.viewedOn === today).map((h) => h.slug));
      const complete = (data.total ?? data.items.length) <= data.items.length;
      const bySlug = new Map(data.items.map((i) => [i.slug, i]));
      // While only the head is loaded, keep the batch up to its first article not in it: the rest is
      // added once the full list arrives, after what is on screen, so nothing moves.
      const kept: FeedItem[] = [];
      for (const slug of daily.batch) {
        const it = bySlug.get(slug);
        if (!it && !complete) break;
        if (it) kept.push(it);
      }
      const partial = !complete && kept.length < daily.batch.length;
      const fill = partial
        ? []
        : pickBatch(data.items, BATCH - daily.batch.length, {
            exclude: new Set([...readToday, ...daily.shown, ...daily.batch]),
            topics: r.topics,
            signals: r.signals,
            served: r.served,
            done: (slug) => Boolean(progress[slug]?.completed),
            today,
            now: Date.now(),
          });
      // From the head file alone only the first two covers (the ones mounted) are kept: the full list
      // may hold better picks for the rest of the batch.
      const batch = [...daily.batch, ...fill.map((i) => i.slug)].slice(0, complete ? undefined : Math.max(daily.batch.length, 2));
      if (batch.length !== daily.batch.length || r.daily.day !== today) next.current = { day: today, batch, shown: daily.shown };
      items = [...kept.filter((i) => !readToday.has(i.slug)), ...fill];
    }
    const start = startSlug ?? first.current;
    if (start && items[0]?.slug !== start) {
      const it = data.items.find((i) => i.slug === start);
      if (it) items = [it, ...items.filter((i) => i.slug !== start)];
    }
    if (!first.current && items[0]) first.current = items[0].slug;
    return items;
    // Recompute only when the feed is (re)started, not while reading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, category, startSlug, version, override, settle]);
  useEffect(() => {
    if (next.current) useReading.getState().setDaily(next.current);
  }, [list]);
  return list;
}
