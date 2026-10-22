// Feed order at build time (docs/06 §2.4): newer first, a boost for engagement, topics interleaved.
import type { ArticleClient } from './types';

export function score(a: ArticleClient, now = Date.now()): number {
  const ageDays = Math.max(0, (now - Date.parse(a.publishedAt)) / 86_400_000);
  const recency = 100 / (1 + ageDays / 14);
  const c = a.counts;
  const engagement = 8 * Math.log10(1 + c.likes + 2 * c.saves + 3 * c.shares + 2 * c.comments);
  return recency + engagement;
}

/** Sort by score, then avoid two articles of the same category in a row where possible. */
export function rankFeed<T extends ArticleClient>(items: T[], now = Date.now()): T[] {
  const pool = [...items].sort((a, b) => score(b, now) - score(a, now) || a.slug.localeCompare(b.slug));
  const out: T[] = [];
  while (pool.length) {
    const prev = out[out.length - 1]?.category;
    const idx = pool.findIndex((p) => p.category !== prev);
    out.push(pool.splice(idx < 0 ? 0 : idx, 1)[0]);
  }
  return out;
}
