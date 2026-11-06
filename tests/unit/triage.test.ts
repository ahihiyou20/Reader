// ACCEPTANCE A1, A2: the content bot's story selection.
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type Scored,
  type TriageOptions,
  hardReject,
  pickTriaged,
  titleSimilarity,
  triage,
} from '../../scripts/pipeline/triage';

const load = (f: string) =>
  (JSON.parse(fs.readFileSync(`tests/fixtures/triage/${f}`, 'utf8')) as Array<{ title: string; summary: string }>).map(
    (x, i) => ({
      ...x,
      url: `https://example.org/${f}/${i}`,
      feedId: 'test',
    }),
  );

const opts = (o: Partial<TriageOptions> = {}): TriageOptions => ({
  minScore: 6,
  perCategory: 2,
  limit: 10,
  dupThreshold: 0.6,
  existingTitles: [],
  categories: ['science', 'health', 'history', 'psychology'],
  ...o,
});
const scored = (
  title: string,
  score: number,
  category = 'science',
  kind: Scored['kind'] = 'finding',
  feedId = 'a',
): Scored => ({
  url: `https://example.org/${encodeURIComponent(title)}`,
  title,
  feedId,
  score,
  category,
  kind,
  reason: 'test',
});

describe('hardReject', () => {
  it('rejects every negative fixture', () => {
    for (const c of load('negative.json')) expect(hardReject(c), c.title).not.toBeNull();
  });
  it('keeps every positive fixture', () => {
    for (const c of load('positive.json')) expect(hardReject(c), c.title).toBeNull();
  });
});

describe('pickTriaged', () => {
  it('never picks below the bar and orders by score', () => {
    const out = pickTriaged(
      [scored('Low story about rivers', 5), scored('Best story about stars', 9), scored('Good story about clouds', 7)],
      opts(),
    );
    expect(out.map((s) => s.score)).toEqual([9, 7]);
  });
  it('caps each category', () => {
    const out = pickTriaged(
      [
        scored('One about atoms', 9),
        scored('Two about cells', 8),
        scored('Three about rocks', 8),
        scored('Four about sleep', 7, 'health'),
      ],
      opts({ perCategory: 2 }),
    );
    expect(out.filter((s) => s.category === 'science')).toHaveLength(2);
    expect(out.some((s) => s.category === 'health')).toBe(true);
  });
  it('drops near-duplicates of existing titles and of earlier picks', () => {
    const out = pickTriaged(
      [
        scored('How habits really form', 9),
        scored('Why the moon drifts away from Earth', 8),
        scored('Why the Moon is drifting away from the Earth', 8),
      ],
      opts({ existingTitles: ['How habits form, and why 21 days is a myth'] }),
    );
    expect(out.map((s) => s.title)).toEqual(['Why the moon drifts away from Earth']);
  });
  it('mixes kinds when scores tie', () => {
    const out = pickTriaged(
      [
        scored('Finding about ants', 8, 'science', 'finding'),
        scored('Finding about bees', 8, 'history', 'finding'),
        scored('History of maps', 8, 'health', 'history'),
      ],
      opts({ limit: 2 }),
    );
    expect(new Set(out.map((s) => s.kind)).size).toBe(2);
  });
  it('applies a stricter bar to listed feeds', () => {
    const out = pickTriaged(
      [scored('Random featured article', 7, 'history', 'history', 'wiki'), scored('Solid finding', 7)],
      opts({ minScoreByFeed: { wiki: 8 } }),
    );
    expect(out.map((s) => s.title)).toEqual(['Solid finding']);
  });
  it('limits the number of picks', () => {
    const topics = [
      'volcanoes',
      'sleep',
      'bridges',
      'memory',
      'tides',
      'vaccines',
      'printing',
      'grief',
      'glaciers',
      'salt',
    ];
    const many = topics.map((w, i) =>
      scored(`What ${w} teach us`, 9, ['science', 'health', 'history', 'psychology'][i % 4]),
    );
    expect(pickTriaged(many, opts({ limit: 5, perCategory: 5 }))).toHaveLength(5);
  });
});

describe('titleSimilarity', () => {
  it('is high for rewordings and low for different stories', () => {
    expect(titleSimilarity('How habits really form', 'How habits form')).toBeGreaterThanOrEqual(0.6);
    expect(titleSimilarity('Atomic clocks lose less than a second', 'Bats at wind farms')).toBeLessThan(0.2);
  });
});

describe('triage without a Gemini key', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('falls back to rules and feed order without calling the network', async () => {
    const key = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const cands = [...load('negative.json'), ...load('positive.json')];
    const { picked, rejected } = await triage(cands, opts({ perCategory: 20, limit: 20 }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(rejected).toHaveLength(load('negative.json').length);
    expect(picked.map((p) => p.title)).toEqual(load('positive.json').map((p) => p.title));
    if (key !== undefined) process.env.GEMINI_API_KEY = key;
  });
});
