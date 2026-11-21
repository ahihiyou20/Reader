'use client';
import { useEffect, useRef } from 'react';
import type { FeedItem } from '@/lib/content/types';
import { useReading } from '@/stores/reading';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';
import { localDate } from '@/lib/streak';

/** A cover left sooner than this without opening the article counts as "not interested". */
const SKIP_MS = 2000;
/** Time away from the page (tab hidden, phone locked) is not reading time. */
const MAX_SPAN_MS = 5 * 60_000;
const TICK_MS = 5000;

/**
 * Feeds stores/reading.ts from what happens in the feed: skips, opens, reading time, finished
 * articles and saves. Mounted once by the app shell.
 */
export function useReadingSignals(items: FeedItem[] | undefined) {
  const index = useUI((s) => s.index);
  const item = items?.[index];
  const slug = item?.slug;
  const category = item?.category;
  const reading = useUI((s) => (slug ? (s.views[slug] ?? 0) >= 1 : false));
  const done = useUser((s) => (slug ? Boolean(s.progress[slug]?.completed) : false));
  const arrived = useRef(0);
  const opened = useRef(false);

  // Arriving on a cover; leaving it quickly without opening is a skip.
  useEffect(() => {
    if (!slug || !category) return;
    arrived.current = Date.now();
    opened.current = false;
    return () => {
      if (!opened.current && Date.now() - arrived.current < SKIP_MS) useReading.getState().record(category, { skips: 1 });
    };
  }, [slug, category]);

  // Reading: one open per visit, time counted while the article (not its cover) is on screen.
  useEffect(() => {
    if (!slug || !category || !reading) return;
    const { record, visit } = useReading.getState();
    if (!opened.current) record(category, { opens: 1 });
    opened.current = true;
    const from = Date.now();
    visit(slug, category, 0);
    // Today's reading time, toward the day's streak freeze: counted in 5 s steps while the page is seen.
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') useReading.getState().addReadingTime(localDate(), TICK_MS);
    }, TICK_MS);
    return () => {
      window.clearInterval(tick);
      const ms = Math.min(MAX_SPAN_MS, Date.now() - from);
      record(category, { ms });
      visit(slug, category, ms);
    };
  }, [slug, category, reading]);

  useEffect(() => {
    if (!slug || !category || !done || !opened.current) return;
    const s = useReading.getState();
    if (s.history.find((h) => h.slug === slug)?.done) return;
    s.record(category, { completes: 1 });
    s.visit(slug, category, 0, true);
  }, [slug, category, done]);

  // Saves and un-saves, wherever they happen (cover, profile, library).
  useEffect(
    () =>
      useUser.subscribe((s, prev) => {
        if (s.saves === prev.saves || !prev.ready) return;
        const cat = (x: string) => items?.find((i) => i.slug === x)?.category;
        for (const k of Object.keys(s.saves)) if (s.saves[k] && !prev.saves[k] && cat(k)) useReading.getState().record(cat(k)!, { saves: 1 });
        for (const k of Object.keys(prev.saves)) if (prev.saves[k] && !s.saves[k] && cat(k)) useReading.getState().record(cat(k)!, { saves: -1 });
      }),
    [items],
  );
}
