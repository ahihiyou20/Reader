// ACCEPTANCE A4: the local check for the house writing rules.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintProse, plainFieldsOf, proseFields } from '../../scripts/pipeline/prose-lint';

const rules = (f: Record<string, string>, lang: 'en' | 'vi', plain?: string[]) =>
  lintProse(f, lang, { plainFields: plain }).map((x) => `${x.rule}:${x.text.toLowerCase()}`);

describe('lintProse', () => {
  it('flags banned words and stock phrases in English', () => {
    const r = rules(
      { body: "In today's fast-paced world we delve into a rich tapestry. In conclusion, it matters." },
      'en',
    );
    expect(r).toEqual(
      expect.arrayContaining([
        'banned-word:delve',
        'banned-word:tapestry',
        "stock-phrase:in today's",
        'stock-phrase:in conclusion',
      ]),
    );
  });
  it('flags Vietnamese stock phrases', () => {
    const r = rules({ body: 'Trong thời đại số, không thể phủ nhận rằng giấc ngủ đóng vai trò quan trọng.' }, 'vi');
    expect(r).toEqual(
      expect.arrayContaining([
        'stock-phrase:trong thời đại',
        'stock-phrase:không thể phủ nhận',
        'stock-phrase:đóng vai trò quan trọng',
      ]),
    );
  });
  it('flags a phrase repeated over and over', () => {
    const s = Array.from({ length: 4 }, (_, i) => `Step ${i}: the river carries the sand downstream today.`).join(' ');
    expect(rules({ body: s }, 'en').some((x) => x.startsWith('repeated-ngram:'))).toBe(true);
  });
  it('flags too many em dashes', () => {
    expect(rules({ body: 'One — two — three — four, in a short paragraph.' }, 'en')).toContain('em-dash:3 em dashes');
  });
  it('flags markup in plain fields only', () => {
    expect(rules({ 'title.en': 'A [y:bright] title' }, 'en', ['title.en'])).toContain(
      'markup-in-plain:a [y:bright] title',
    );
    expect(rules({ 'hook.en': 'A [y:bright] hook' }, 'en', ['title.en'])).toEqual([]);
  });
  it('is silent on good group-4 articles', () => {
    for (const slug of [
      'antikythera-mechanism-ancient-computer',
      'semmelweis-handwashing-vienna-1847',
      'comparative-advantage-ricardo-example',
      'talking-to-strangers',
      'who-physical-activity-150-minutes',
    ]) {
      const a = JSON.parse(fs.readFileSync(`content/articles/${slug}.json`, 'utf8'));
      for (const lang of ['en', 'vi'] as const) {
        const f = proseFields(a, lang);
        expect(lintProse(f, lang, { plainFields: plainFieldsOf(f) }), `${slug} ${lang}`).toEqual([]);
      }
    }
  });
});
