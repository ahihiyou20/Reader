// Smart Feed: order the For You feed by how much this reader cares about each topic. Everything is
// computed in the browser from stores/reading.ts; nothing about the reader leaves the device.
import type { FeedItem } from '@/lib/content/types';
import { ZERO_SIGNAL, type Signal } from '@/stores/reading';

export type Reason = 'topic' | 'finishes' | 'saves' | 'explore' | null;

/** Points per topic. The same weights are explained to the reader on the Profile screen. */
export const WEIGHTS = { topic: 2, perMinute: 0.6, maxMinutes: 5, finish: 3, save: 4, maxSaves: 3, skip: -1.5, explore: 0.8 };

export function affinity(sig: Signal | undefined, favourite: boolean): { score: number; reason: Reason } {
  const s = sig ?? ZERO_SIGNAL;
  const seen = s.opens + s.skips > 0;
  const finishRate = s.opens ? Math.min(1, s.completes / s.opens) : 0;
  const parts = {
    topic: favourite ? WEIGHTS.topic : 0,
    finishes: finishRate * WEIGHTS.finish + Math.min(WEIGHTS.maxMinutes, s.ms / 60000) * WEIGHTS.perMinute,
    saves: Math.min(WEIGHTS.maxSaves, s.saves) * WEIGHTS.save,
    // Topics the reader has never met get a nudge, so the feed does not narrow to what it already knows.
    explore: seen ? 0 : WEIGHTS.explore,
  };
  const score = parts.topic + parts.finishes + parts.saves + parts.explore + s.skips * WEIGHTS.skip;
  const best = (Object.keys(parts) as Array<keyof typeof parts>).reduce((a, b) => (parts[b] > parts[a] ? b : a));
  return { score, reason: parts[best] > 0 ? best : null };
}

/**
 * Stable re-rank: `items` arrive in the editorial order (newest and most engaging first). Affinity
 * moves an article up or down by a few places per point, so a strong topic rises without burying the
 * rest, and a reader with no history sees the editorial order unchanged.
 */
export function rankForYou<T extends Pick<FeedItem, 'slug' | 'category'>>(items: T[], signals: Record<string, Signal>, topics: string[]): T[] {
  const byCat = new Map<string, number>();
  const scoreOf = (c: string) => {
    if (!byCat.has(c)) byCat.set(c, affinity(signals[c], topics.includes(c)).score);
    return byCat.get(c)!;
  };
  const base = scoreOf('\u0000');
  if (items.every((i) => scoreOf(i.category) === base)) return items;
  const SPOTS_PER_POINT = 4;
  return items
    .map((item, i) => ({ item, key: i - scoreOf(item.category) * SPOTS_PER_POINT, i }))
    .sort((a, b) => a.key - b.key || a.i - b.i)
    .map((x) => x.item);
}

/** Articles in one For You batch: a day's feed, and each "See more" or pull to refresh after it. */
export const BATCH = 30;
const DAY_MS = 86_400_000;
/** Published within this long counts as new. */
const NEW_MS = 3 * DAY_MS;
/** An article shown on an earlier day and passed over waits this many days behind the unseen ones. */
const REST_DAYS = 7;

export interface BatchContext {
  /** Never picked: read today, or already in today's batches. */
  exclude: Set<string>;
  topics: string[];
  signals: Record<string, Signal>;
  /** Day (YYYY-MM-DD) each article's cover was last on screen. */
  served: Record<string, string>;
  /** Finished on any day. */
  done: (slug: string) => boolean;
  today: string;
  now: number;
}

/**
 * The next `n` articles for For You. Tiers, in order: new in a favourite topic, older in a favourite
 * topic, new elsewhere, older elsewhere. Behind every tier: articles shown in the last week and passed
 * over, then articles finished on an earlier day. Within a tier, rankForYou's order (the reader's
 * signals over the editorial order).
 */
export function pickBatch<T extends Pick<FeedItem, 'slug' | 'category' | 'publishedAt'>>(items: T[], n: number, c: BatchContext): T[] {
  const today = Date.parse(c.today);
  const resting = (slug: string) => c.served[slug] !== undefined && (today - Date.parse(c.served[slug])) / DAY_MS < REST_DAYS;
  const rank = (i: T) =>
    (c.done(i.slug) ? 100 : 0) +
    (resting(i.slug) ? 10 : 0) +
    (c.topics.includes(i.category) ? 0 : 2) +
    (c.now - Date.parse(i.publishedAt) < NEW_MS ? 0 : 1);
  return rankForYou(
    items.filter((i) => !c.exclude.has(i.slug)),
    c.signals,
    c.topics,
  )
    .map((item, i) => ({ item, k: rank(item), i }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map((x) => x.item);
}

/** Words a second a fast skimmer still takes in (about 600 a minute, twice a usual reading pace). */
const SKIM_WPS = 10;

/**
 * Whether the reader really read an article, from how long each block (DetailsView's sections) was
 * the one at the reading line. A block counts when it stayed there long enough to skim its words;
 * blocks scrolled past faster count for nothing. Read: half the words counted, over 8 s or more. So a
 * quick skim of the article counts, and opening it by mistake or flicking to the end does not.
 */
export function isViewed(words: number[], dwell: number[]): boolean {
  const total = words.reduce((a, w) => a + w, 0);
  const spent = dwell.reduce((a, s) => a + s, 0);
  const read = words.reduce((a, w, i) => a + ((dwell[i] ?? 0) >= Math.max(1.5, w / SKIM_WPS) ? w : 0), 0);
  return total > 0 && spent >= 8 && read >= total / 2;
}
