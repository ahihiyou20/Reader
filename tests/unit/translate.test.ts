import { describe, expect, it } from 'vitest';
import type { ArticleSource } from '@/lib/content/types';
import { cleanGlossary, missing } from '@/scripts/pipeline/translate';

const base = (group: 1 | 3): ArticleSource => ({
  slug: 'x',
  status: 'published',
  category: 'science',
  title: { en: 'Black holes', vi: 'Hố đen' },
  hook: { en: 'A hook.', vi: 'Mở bài.' },
  sections: [{ body_en: 'Body.', body_vi: 'Thân bài.' }],
  references: [],
  cover: { type: 'image', url: '/x.jpg', provider: 'own', author: 'a', license: 'CC BY 4.0' },
  origin: { group, license: group === 3 ? 'CC-BY-ND-4.0' : 'CC-BY-4.0', authors: ['A'], changes: [] },
});

describe('translate', () => {
  it('asks for the text only in languages that lack it', () => {
    const a = base(1);
    expect(missing(a, 'vi')).toEqual({ text: false, summary: false, glossary: true });
    expect(missing(a, 'fr')).toEqual({ text: true, summary: false, glossary: true });
    expect(missing(a, 'en').text).toBe(false);
  });
  it('never translates verbatim (group 3) text: summary only, glossary in English only', () => {
    const a = base(3);
    expect(missing(a, 'de')).toEqual({ text: false, summary: true, glossary: false });
    expect(missing(a, 'en')).toEqual({ text: false, summary: false, glossary: true });
  });
  it('keeps glossary terms that occur in the text, keyed in lowercase', () => {
    const g = cleanGlossary(
      [
        { term: 'Event Horizon', meaning: 'the edge of a black hole' },
        { term: 'quasar', meaning: 'not in the text' },
        { term: 'mass', meaning: 'has [y:markup]' },
      ],
      'Past the event horizon, mass only falls inward.',
    );
    expect(g).toEqual({ 'event horizon': 'the edge of a black hole' });
  });
});
