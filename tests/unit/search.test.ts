import MiniSearch from 'minisearch';
import { describe, expect, it } from 'vitest';
import { fold, markMatches, SEARCH_OPTIONS, type SearchDoc } from '@/lib/search';
import { rankFeed } from '@/lib/content/rank';
import type { ArticleClient } from '@/lib/content/types';

const doc = (id: string, title_vi: string, title_en = ''): SearchDoc => ({
  id,
  title_en,
  title_vi,
  hook_en: '',
  hook_vi: '',
  headings: '',
  body: '',
  category: '',
  tags: '',
});

describe('search (FR-23)', () => {
  it('folds Vietnamese diacritics', () => expect(fold('Thiên Kiến Đám Đông')).toBe('thien kien dam dong'));
  it('M7: "thien kien" finds "thiên kiến"', () => {
    const ms = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
    ms.addAll([doc('a', 'Thiên kiến xác nhận'), doc('b', 'Giấc ngủ và trí nhớ')]);
    expect(ms.search('thien kien').map((r) => r.id)).toEqual(['a']);
    expect(ms.search('giac ngu').map((r) => r.id)).toEqual(['b']);
  });
  it('marks matches ignoring accents', () => {
    expect(markMatches('Thiên kiến xác nhận', 'thien')).toEqual([
      { v: 'Thiên', hit: true },
      { v: ' kiến xác nhận', hit: false },
    ]);
  });
});

describe('rankFeed', () => {
  const a = (slug: string, category: string, days: number, likes = 0) =>
    ({ slug, category, publishedAt: new Date(Date.parse('2026-10-22') - days * 86_400_000).toISOString(), counts: { likes, saves: 0, shares: 0, comments: 0 } }) as ArticleClient;
  it('prefers newer articles and interleaves categories', () => {
    const out = rankFeed([a('p1', 'psy', 0), a('p2', 'psy', 1), a('s1', 'sci', 2)], Date.parse('2026-10-22'));
    expect(out.map((x) => x.slug)).toEqual(['p1', 's1', 'p2']);
  });
});
