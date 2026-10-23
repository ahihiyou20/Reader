import { describe, expect, it } from 'vitest';
import { addHighlight, safeMarkup } from '../../scripts/pipeline/compose';
import { trimToFit } from '../../scripts/pipeline/create';
import { normalizeUrl, parseFeed, pickRoundRobin, type FeedSource } from '../../scripts/pipeline/feeds';
import { splitLong } from '../../scripts/pipeline/import';
import { inputFromForm, parseIssueForm } from '../../scripts/pipeline/issue';
import { groupForLicense, normalizeLicense } from '../../scripts/pipeline/licenses';
import { plainText } from '@/lib/content/markup';
import type { ArticleSource, Category } from '@/lib/content/types';
import { totalWords } from '@/lib/content/validate';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
<item><title><![CDATA[First & best]]></title><link>https://a.org/1?utm_source=rss</link><pubDate>Fri, 23 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Second</title><link>https://a.org/2</link></item></channel></rss>`;
const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Y</title>
<entry><title type="html">Atom one</title><link rel="self" href="https://b.org/self"/><link rel="alternate" href="https://b.org/one"/><published>2026-10-20T00:00:00Z</published><summary>Hi</summary></entry></feed>`;

describe('feeds', () => {
  it('parses RSS and Atom', () => {
    const r = parseFeed(RSS);
    expect(r.map((i) => i.title)).toEqual(['First & best', 'Second']);
    expect(r[0].date?.toISOString()).toBe('2026-10-23T10:00:00.000Z');
    const a = parseFeed(ATOM);
    expect(a[0]).toMatchObject({ title: 'Atom one', url: 'https://b.org/one', summary: 'Hi' });
  });
  it('normalises links so the same article is not taken twice', () => {
    expect(normalizeUrl('https://A.org/1/?utm_source=rss#x')).toBe('https://a.org/1');
    expect(normalizeUrl('https://u.gov/n?amp%3Butm_medium=rss&amp%3Butm_campaign=news')).toBe('https://u.gov/n');
  });
  it('takes items round-robin, within each feed limit and the daily limit', () => {
    const feed = (id: string, max?: number): FeedSource => ({ id, name: id, url: '', category: 'science', mode: 'adapt', max });
    const items = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ title: `${p}${i}`, url: `https://${p}/${i}` }));
    const feeds = [feed('a', 5), feed('b', 1), feed('c')];
    const c = new Map([
      ['a', items('a', 5)],
      ['b', items('b', 5)],
      ['c', items('c', 5)],
    ]);
    expect(pickRoundRobin(feeds, c, 6).map((p) => p.item.title)).toEqual(['a0', 'b0', 'c0', 'a1', 'c1', 'a2']);
    expect(pickRoundRobin(feeds, c, 20)).toHaveLength(9);
  });
});

describe('licences', () => {
  it('accepts NonCommercial licences and derives the group', () => {
    expect(normalizeLicense('http://creativecommons.org/licenses/by-nc-sa/4.0/')).toBe('CC-BY-NC-SA-4.0');
    expect(normalizeLicense('CC BY-NC-ND 4.0')).toBe('CC-BY-NC-ND-4.0');
    expect(normalizeLicense('CC BY-NC 4.0')).toBe('CC-BY-NC-4.0');
    expect(normalizeLicense('CC BY-SA 3.0')).toBeNull();
    expect(groupForLicense('CC-BY-NC-SA-4.0')).toBe(2);
    expect(groupForLicense('CC-BY-ND-4.0')).toBe(3);
    expect(groupForLicense('PD')).toBe(1);
  });
});

describe('compose helpers', () => {
  it('adds a highlight only when the words stay the same', () => {
    const body = 'People make about **35,000** choices a day, most of them automatic.';
    expect(addHighlight(body, 'most of them automatic', 'yellow')).toBe('People make about **35,000** choices a day, [y:most of them automatic].');
    expect(addHighlight(body, '35,000', 'pink')).toBe(body); // inside bold
    expect(addHighlight(body, 'not in the text', 'green')).toBe(body);
    const out = addHighlight(body, 'choices a day', 'green');
    expect(plainText(out)).toBe(plainText(body));
  });
  it('drops markup that does not parse', () => {
    expect(safeMarkup('An [y:open highlight', new Map())).toBe('An [y:open highlight'.replace('[y:', ''));
    expect(safeMarkup('Fine {source}', new Map([['source', 'S']]))).toBe('Fine {source}');
  });
  it('splits long paragraphs at sentence ends and trims drafts to length', () => {
    const p = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} has exactly seven words.`).join(' ');
    const parts = splitLong(p, 130);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(' ')).toBe(p);
    const a = {
      hook: { en: 'word '.repeat(50) },
      sections: Array.from({ length: 9 }, () => ({ body_en: 'word '.repeat(120) })),
      references: [],
    } as unknown as ArticleSource;
    expect(trimToFit(a)).toBe(true);
    expect(totalWords(a)).toBeLessThanOrEqual(950);
  });
});

describe('issue form', () => {
  const cats: Category[] = [
    { id: 'science', name: { en: 'Science', vi: 'Khoa học' }, emoji: '', order: 1 },
    { id: 'health', name: { en: 'Health', vi: 'Sức khỏe' }, emoji: '', order: 2 },
  ];
  it('reads the fields GitHub renders from the form', () => {
    const body = [
      '### Link bài gốc',
      '',
      'https://psyche.co/ideas/x',
      '',
      '### Hoặc dán nội dung bạn tự viết',
      '',
      '_No response_',
      '',
      '### Tiêu đề (không bắt buộc)',
      '',
      '_No response_',
      '',
      '### Chủ đề',
      '',
      'Health · Sức khỏe',
      '',
      '### Cách đăng',
      '',
      'Tóm tắt + link',
    ].join('\n');
    const form = parseIssueForm(body);
    expect(form['Link bài gốc']).toBe('https://psyche.co/ideas/x');
    expect(inputFromForm(form, cats)).toEqual({ url: 'https://psyche.co/ideas/x', text: undefined, title: undefined, category: 'health', mode: 'summary' });
  });
  it('falls back to automatic topic and mode', () => {
    const form = parseIssueForm('### Hoặc dán nội dung bạn tự viết\n\nMy own text.\n\n### Chủ đề\n\nTự chọn (auto)\n\n### Cách đăng\n\nTự động theo giấy phép (khuyên dùng)');
    expect(inputFromForm(form, cats)).toMatchObject({ text: 'My own text.', category: 'auto', mode: 'auto' });
  });
});
