import { describe, expect, it, vi } from 'vitest';
import type { ArticleSource } from '@/lib/content/types';

// Gemini replies with the text but no glossary, the reply that used to crash translateFull.
vi.mock('@/scripts/pipeline/gemini', async (orig) => ({
  ...(await orig<typeof import('@/scripts/pipeline/gemini')>()),
  hasGemini: () => true,
  geminiStructured: async () => ({ value: { title: 'Trous noirs', hook: 'Accroche.', sections: [{ body: 'Corps.' }] }, dropped: [] }),
}));
const { cleanGlossary, missing, translateFull } = await import('@/scripts/pipeline/translate');

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
  it('survives a reply without a glossary', async () => {
    const a = base(1);
    await expect(translateFull(a, 'fr')).resolves.toBe(true);
    expect(a.title.fr).toBe('Trous noirs');
    expect(a.glossary?.fr).toBeUndefined();
  });
});
