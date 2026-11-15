// The Pagemoor standard for an article Reader writes itself (group 4), shared by the Gemini writer and
// the Claude writer: depth, highlights and sources in every section, all five languages with their
// tap-to-understand glossaries, a credited Unsplash cover in both shapes, and for the Claude writer a
// motion cover. validate.ts decides what may be published; this decides what is finished.
import fs from 'node:fs';
import path from 'node:path';
import { citedIds, highlightCount } from '../../lib/content/markup';
import { LANGS, type ArticleSource } from '../../lib/content/types';
import { fullLangs } from '../../lib/content/validate';
import { proseWords } from './compose';
import { ROOT } from './lib';

export interface Standard {
  minWords: number;
  minRefs: number;
  /** A motion cover (cover.video) is required. */
  motion: boolean;
}

export const STANDARDS = {
  gemini: { minWords: 950, minRefs: 2, motion: false },
  claude: { minWords: 1000, minRefs: 3, motion: true },
} satisfies Record<string, Standard>;

const GLOSSARY_MIN = 8;
const onDisk = (url: string | undefined) => Boolean(url?.startsWith('/') && fs.existsSync(path.join(ROOT, 'public', url)));

export const articleWords = (a: Pick<ArticleSource, 'hook' | 'sections'>) => proseWords(a.hook.en) + a.sections.reduce((n, s) => n + proseWords(s.body_en), 0);

/** What keeps the article from the standard; empty when it meets it. */
export function standardProblems(a: ArticleSource, s: Standard): string[] {
  const out: string[] = [];
  if (a.origin.group !== 4) out.push(`group ${a.origin.group}: only articles written for Pagemoor (group 4) are held to this standard`);
  const words = articleWords(a);
  if (words < s.minWords) out.push(`${words} English words (at least ${s.minWords})`);
  if (a.sections.length < 5 || a.sections.length > 9) out.push(`${a.sections.length} sections (6–8)`);
  a.sections.forEach((x, i) => {
    if (!x.heading_en?.trim()) out.push(`section ${i + 1}: no heading`);
    const hl = highlightCount(x.body_en);
    if (hl < 1 || hl > 3) out.push(`section ${i + 1}: ${hl} highlights (1–2)`);
    if (!citedIds(x.body_en).length) out.push(`section ${i + 1}: no source chip`);
  });
  if (a.title.en.length > 65) out.push(`title has ${a.title.en.length} characters (at most 60)`);
  if (a.references.length < s.minRefs) out.push(`${a.references.length} sources (at least ${s.minRefs})`);
  const full = fullLangs(a);
  const missing = LANGS.filter((l) => !full.includes(l));
  if (missing.length) out.push(`not complete in ${missing.join(', ')}`);
  const thin = LANGS.filter((l) => Object.keys(a.glossary?.[l] ?? {}).length < GLOSSARY_MIN);
  if (thin.length) out.push(`glossary under ${GLOSSARY_MIN} terms in ${thin.join(', ')}`);
  const c = a.cover;
  if (c.provider !== 'unsplash' || /picsum\.photos/.test(c.url) || !/unsplash\.com\/photos\//.test(c.sourceUrl ?? '')) out.push('cover is not an Unsplash photo');
  else if (!c.wide) out.push('cover has no landscape version');
  if (s.motion && !(onDisk(c.video?.url) && onDisk(c.video?.wide))) out.push('no motion cover (portrait and wide clip in public/covers/video)');
  return out;
}
