// Search shared by the build (index) and the client (query). Vietnamese diacritics are folded so
// "thien kien" finds "thiên kiến" (FR-23, M7 DoD).
import type { Options } from 'minisearch';

export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export interface SearchDoc {
  id: string;
  title_en: string;
  title_vi: string;
  hook_en: string;
  hook_vi: string;
  headings: string;
  body: string;
  category: string;
  tags: string;
}

export const SEARCH_OPTIONS: Options<SearchDoc> = {
  fields: ['title_en', 'title_vi', 'hook_en', 'hook_vi', 'headings', 'body', 'category', 'tags'],
  storeFields: [],
  processTerm: (term) => {
    const t = fold(term);
    return t.length > 1 ? t : null;
  },
  searchOptions: {
    boost: { title_en: 3, title_vi: 3, tags: 2.5, headings: 1.5, hook_en: 1.2, hook_vi: 1.2 },
    prefix: (term) => term.length > 2,
    fuzzy: (term) => (term.length > 4 ? 0.15 : false),
    combineWith: 'AND',
  },
};

/** Wrap the parts of `text` that match any query token (accent-insensitive). */
export function markMatches(text: string, query: string): Array<{ v: string; hit: boolean }> {
  const tokens = fold(query)
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (!tokens.length) return [{ v: text, hit: false }];
  const folded = fold(text);
  const hits: boolean[] = new Array(text.length).fill(false);
  for (const t of tokens) {
    let i = folded.indexOf(t);
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) hits[k] = true;
      i = folded.indexOf(t, i + t.length);
    }
  }
  const out: Array<{ v: string; hit: boolean }> = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === hits[i]) last.v += text[i];
    else out.push({ v: text[i], hit: hits[i] });
  }
  return out;
}
