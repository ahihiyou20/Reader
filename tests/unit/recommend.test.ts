import { describe, expect, it } from 'vitest';
import { affinity, isViewed, pickBatch, rankForYou, type BatchContext } from '@/lib/recommend';
import type { Signal } from '@/stores/reading';

const sig = (p: Partial<Signal>): Signal => ({ opens: 0, completes: 0, saves: 0, skips: 0, ms: 0, ...p });
const items = ['science', 'history', 'health', 'science', 'history', 'health', 'economy', 'science'].map((category, i) => ({ slug: `a${i}`, category }));

describe('Smart Feed', () => {
  it('keeps the editorial order for a reader with no history', () => {
    expect(rankForYou(items, {}, [])).toBe(items);
  });
  it('raises a favourite topic and topics the reader finishes and saves', () => {
    const fav = rankForYou(items, {}, ['economy']);
    expect(fav.findIndex((i) => i.category === 'economy')).toBeLessThan(6);
    const read = rankForYou(items, { health: sig({ opens: 4, completes: 4, saves: 2, ms: 240000 }) }, []);
    expect(read[0].category).toBe('health');
  });
  it('lowers a topic the reader keeps skipping, without dropping it', () => {
    const out = rankForYou(items, { science: sig({ skips: 3 }) }, []);
    expect(out[0].category).not.toBe('science');
    expect(out).toHaveLength(items.length);
  });
  it('explains the strongest reason', () => {
    expect(affinity(undefined, true).reason).toBe('topic');
    expect(affinity(sig({ opens: 2, completes: 2 }), false).reason).toBe('finishes');
    expect(affinity(sig({ opens: 1, saves: 2 }), false).reason).toBe('saves');
    expect(affinity(undefined, false).reason).toBe('explore');
    expect(affinity(sig({ skips: 2 }), false).reason).toBe(null);
  });
});

describe('daily batch', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const at = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
  const pool = [
    { slug: 'old-other', category: 'history', publishedAt: at(30) },
    { slug: 'new-other', category: 'history', publishedAt: at(1) },
    { slug: 'old-fav', category: 'science', publishedAt: at(30) },
    { slug: 'new-fav', category: 'science', publishedAt: at(1) },
  ];
  const ctx = (p: Partial<BatchContext> = {}): BatchContext => ({
    exclude: new Set(),
    topics: ['science'],
    signals: {},
    served: {},
    done: () => false,
    today: '2026-11-21',
    now,
    ...p,
  });
  const slugs = (c: BatchContext, n = 10) => pickBatch(pool, n, c).map((i) => i.slug);

  it('orders new favourites, older favourites, new others, older others', () => {
    expect(slugs(ctx())).toEqual(['new-fav', 'old-fav', 'new-other', 'old-other']);
  });
  it('leaves out what is excluded and stops at n', () => {
    expect(slugs(ctx({ exclude: new Set(['new-fav']) }), 2)).toEqual(['old-fav', 'new-other']);
  });
  it('puts articles passed over this week behind the rest, and finished ones last', () => {
    const c = ctx({ served: { 'new-fav': '2026-11-19', 'old-fav': '2026-11-01' }, done: (s) => s === 'new-other' });
    expect(slugs(c)).toEqual(['old-fav', 'old-other', 'new-fav', 'new-other']);
  });
});

describe('viewed', () => {
  const words = [40, 120, 120, 120];
  it('counts a quick skim of most blocks', () => {
    expect(isViewed(words, [4, 13, 13, 0])).toBe(true);
  });
  it('does not count an article opened by mistake', () => {
    expect(isViewed(words, [3, 0, 0, 0])).toBe(false);
  });
  it('does not count flicking through to the end', () => {
    expect(isViewed(words, [1, 1, 1, 20])).toBe(false);
  });
  it('counts reading the first half closely and leaving', () => {
    expect(isViewed(words, [10, 30, 30, 0])).toBe(true);
  });
});
