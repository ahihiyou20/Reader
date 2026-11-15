import { describe, expect, it } from 'vitest';
import { firstDefinition, glossaryAt, wordAt } from '@/lib/dictionary';

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
    const es = '\n== Español ==\n\n=== Etimología 1 ===\nDe aguja y el sufijo -ero.\n\n==== Sustantivo masculino ====\nagujero ¦ plural: agujeros\n\n1\nOrificio de forma aproximadamente circular.\nEjemplo: Es pues el caso.\n';
    expect(firstDefinition(es, 'agujero')).toBe('Orificio de forma aproximadamente circular.');
    expect(firstDefinition('\n== English ==\n\n=== Noun ===\nword\n', 'word')).toBe(null);
  });
});
