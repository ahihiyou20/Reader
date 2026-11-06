// ACCEPTANCE A5: feed items → triage → picks, with Gemini stubbed.
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.GEMINI_GAP_MS = '0';
const { selectArticles } = await import('../../scripts/pipeline/feeds');
import type { FeedItem, FeedSource } from '../../scripts/pipeline/feeds';

const feeds: FeedSource[] = [
  { id: 'nasa', name: 'NASA', url: 'https://n/feed', category: 'science', mode: 'adapt', max: 3 },
  { id: 'wiki', name: 'Wikipedia', url: 'https://w/feed', category: 'auto', mode: 'adapt', max: 3, minScore: 8 },
];
const item = (title: string, summary = 'A study measured something and explains how it works.'): FeedItem => ({
  title,
  summary,
  url: `https://x.org/${encodeURIComponent(title)}`,
});
const candidates = new Map<string, FeedItem[]>([
  [
    'nasa',
    [
      item('Webinar Series: Mars rovers'),
      item('How dust storms ended the Opportunity rover'),
      item('Why Mars lost its magnetic field'),
    ],
  ],
  [
    'wiki',
    [
      item('1986 New York Mets season', 'The 1986 New York Mets season was the 25th season.'),
      item('Antikythera mechanism'),
      item('Hangul'),
    ],
  ],
]);

describe('selectArticles', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('drops rule rejects before scoring, applies scores, per-feed bars and categories', async () => {
    process.env.GEMINI_API_KEY = 'test';
    let prompt = '';
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      prompt = JSON.parse(String(init.body)).contents[0].parts[0].text;
      // Indices follow the round-robin order of the survivors: dust storms, Antikythera, Mars field, Hangul.
      const items = [
        { index: 0, score: 8, category: 'science', kind: 'history', reason: 'clear mechanism', reject: false },
        { index: 1, score: 7, category: 'history', kind: 'explainer', reason: 'good but wiki bar is 8', reject: false },
        { index: 2, score: 9, category: 'science', kind: 'finding', reason: 'new result', reject: false },
        { index: 3, score: 3, category: 'history', kind: 'history', reason: 'thin', reject: true },
      ];
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }] }),
      );
    });
    const { picked, rejected } = await selectArticles(feeds, candidates, {
      limit: 5,
      existingTitles: [],
      categories: ['science', 'history'],
    });
    expect(prompt).not.toMatch(/Webinar|Mets/);
    expect(picked.map((p) => p.item.title)).toEqual([
      'Why Mars lost its magnetic field',
      'How dust storms ended the Opportunity rover',
    ]);
    expect(picked[0].feed.id).toBe('nasa');
    expect(picked[1].category).toBe('science');
    expect(rejected.map((r) => r.url)).toEqual(
      expect.arrayContaining([
        item('Webinar Series: Mars rovers').url,
        item('1986 New York Mets season').url,
        item('Hangul').url,
      ]),
    );
    delete process.env.GEMINI_API_KEY;
  });
});
