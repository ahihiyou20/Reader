import { describe, expect, it } from 'vitest';
import { firstDefinition, glossaryAt, lemmaFrom, wordAt } from '@/lib/dictionary';

describe('tap to understand', () => {
  const text = 'Past the event horizon, light cannot escape.';
  it('finds the word under the tap', () => {
    expect(wordAt(text, 11)?.word).toBe('event');
    expect(wordAt(text, text.indexOf('horizon') + 7)?.word).toBe('horizon');
    expect(wordAt('a , b', 2)).toBe(null);
    expect(wordAt('lực hấp dẫn', 5)?.word).toBe('hấp');
  });
  it('prefers the glossary, matching whole multi-word terms', () => {
    const g = { 'event horizon': 'the edge', event: 'something that happens', escape: 'get away' };
    expect(glossaryAt(g, text, 11)).toEqual({ term: 'event horizon', meaning: 'the edge', source: 'glossary' });
    expect(glossaryAt(g, text, 26)).toBe(null);
    expect(glossaryAt({ cape: 'x' }, text, text.indexOf('escape') + 3)).toBe(null);
  });
  it('reads the first definition from Wiktionary page text', () => {
    const vi = '\n== Tiếng Việt ==\n\n\n=== Từ nguyên ===\nÂm Hán-Việt của chữ Hán 吸引.\n\n\n=== Danh từ ===\nhấp dẫn\n\nMột loại lực cơ học được hình thành do các thiên thể tương tác với nhau.\n';
    expect(firstDefinition(vi, 'hấp dẫn')).toMatch(/^Một loại lực cơ học/);
    expect(firstDefinition('\n== Tiếng Việt ==\n\n=== Giới từ ===\ncủa\n\n(trợ giúp hiển thị và nhập chữ Nôm)\nTừ biểu thị quan hệ sở hữu.\n', 'của')).toBe('Từ biểu thị quan hệ sở hữu.');
    const fr = '\n== Français ==\n\n=== Étymologie ===\n(XIIIe siècle) De l’ancien français orizonte.\n\n=== Nom commun ===\n\nhorizon (h muet) masculin\n\nLigne circulaire dont l’observateur est le centre.\n';
    expect(firstDefinition(fr, 'horizon')).toMatch(/^Ligne circulaire/);
    const de = '\n== Schwerkraft (Deutsch) ==\n\n=== Substantiv, f ===\n\nWorttrennung:\nSchwer·kraft\nBedeutungen:\n[1] Anziehungskraft in Folge der Gravitation\nHerkunft:\n';
    expect(firstDefinition(de, 'Schwerkraft')).toBe('Anziehungskraft in Folge der Gravitation');
    expect(firstDefinition('\n== gehen (Deutsch) ==\n\nWorttrennung:\nge·hen, Präteritum: ging\nBedeutungen:\nintransitiv:\n[1] sich schreitend fortbewegen\n', 'gehen')).toBe('sich schreitend fortbewegen');
    const es = '\n== Español ==\n\n=== Etimología 1 ===\nDe aguja y el sufijo -ero.\n\n==== Sustantivo masculino ====\nagujero ¦ plural: agujeros\n\n1\nOrificio de forma aproximadamente circular.\nEjemplo: Es pues el caso.\n';
    expect(firstDefinition(es, 'agujero')).toBe('Orificio de forma aproximadamente circular.');
    expect(firstDefinition('\n== English ==\n\n=== Noun ===\nword\n', 'word')).toBe(null);
  });
});

describe('dictionary form', () => {
  const formOf = (lemma: string, lang: string) =>
    `<span class="form-of-definition use-with-mention">simple <a href="/wiki/Appendix:Glossary#past_tense" title="Appendix:Glossary">past</a> of <span class="form-of-definition-link"><i class="Latn mention" lang="${lang}"><a rel="mw:WikiLink" href="/wiki/${lemma}#X" title="${lemma}">${lemma}</a></i></span></span>`;
  it('follows an inflected form to its lemma in the reading language', () => {
    const data = {
      en: [{ definitions: [{ definition: formOf('heat', 'en') }] }, { definitions: [{ definition: 'Very angry.' }] }],
      es: [{ definitions: [{ definition: formOf('comer', 'es') }] }],
    };
    expect(lemmaFrom(data, 'en', 'heated')?.lemma).toBe('heat');
    expect(lemmaFrom(data, 'es', 'comiendo')?.lemma).toBe('comer');
    expect(lemmaFrom(data, 'fr', 'heated')).toBeUndefined();
  });
  it('keeps a word that is already a dictionary form', () => {
    expect(lemmaFrom({ en: [{ definitions: [{ definition: 'To make warm.' }] }] }, 'en', 'heat')).toBeUndefined();
    expect(lemmaFrom(null, 'en', 'heat')).toBeUndefined();
  });
});
