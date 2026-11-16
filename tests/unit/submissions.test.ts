import { describe, expect, it } from 'vitest';
import { validateArticle } from '@/lib/content/validate';
import { toDraft } from '@/scripts/pipeline/submissions';

type Post = Parameters<typeof toDraft>[1];
const post = (p: Partial<Post>): Post => ({ uid: 'u', displayName: 'Reader', title: 'A title', hook: 'A hook', sections: [{ body: 'Body' }], references: [], lang: 'en', status: 'pending', ...p });

describe('submissions toDraft', () => {
  it('turns a malformed post into a draft instead of throwing', () => {
    const bad = post({ sections: [{} as never, { heading: 'H', body: 'Kept' }], references: ['https://', 'not a url', 'javascript:alert(1)', 'https://example.org/a'] });
    const d = toDraft('id', bad, 'x');
    expect(d.sections).toEqual([{ heading_en: 'H', body_en: 'Kept' }]);
    expect(d.references.map((r) => r.url)).toEqual(['https://example.org/a']);
  });
  it('keeps a French post under fr and marks the English for translation', () => {
    const d = toDraft('id', post({ lang: 'fr', title: 'Titre', hook: 'Accroche', sections: [{ body: 'Corps' }] }), 'x');
    expect(d.title).toEqual({ en: '(translate) Titre', fr: 'Titre' });
    expect(d.sections[0]).toEqual({ body_fr: 'Corps', body_en: '(translate) Corps' });
    expect(validateArticle(d).issues.filter((i) => i.level === 'error' && /^(title|hook|sections)/.test(i.field))).toEqual([]);
  });
});
