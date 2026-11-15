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
