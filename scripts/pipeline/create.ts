// One article from a link or from pasted text, for the daily feeds and the issue form (docs/05 §9).
//   adapt / verbatim — the domain is in the licence table: import it (licence decides group 1, 2 or 3).
//   summary          — any other page: Reader's own short summary plus a link (group 5). The page text
//                      is sent to Gemini only, never stored in the repo.
//   text             — the editor's own writing (group 4).
// Articles are written as "published": they reach the site only when the bot's pull request is merged.
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArticleSource, ContentGroup, CoverSource } from '../../lib/content/types';
import { citedIds } from '../../lib/content/markup';
import { type Issue, totalWords, validateArticle } from '../../lib/content/validate';
import { readPage } from './adapters/readability';
import { applyWritten, enrich, fromText, summarize } from './compose';
import { findCovers, remotePlaceholder } from './cover';
import { MODEL, hasGemini } from './gemini';
import { importSource } from './import';
import { ruleFor } from './licenses';
import { CONTENT, dirs, previewUrl, readJson, uniqueSlug, wordCount, writeJson } from './lib';

export type Mode = 'auto' | 'adapt' | 'verbatim' | 'summary';

export interface CreateInput {
  url?: string;
  text?: string;
  title?: string;
  category: string;
  mode?: Mode;
  publishAt?: string;
  author?: string;
  /** Verbatim (group 3) texts cannot be shortened: skip those longer than this. */
  maxWords?: number;
}

export interface Created {
  slug: string;
  group: ContentGroup;
  title: string;
  words: number;
  url?: string;
  issues: Issue[];
  ai: string[];
}

/** Not a failure of the source: the run should try again later (e.g. no Gemini key yet). */
export class SkipError extends Error {}

const SCIENCE = new Set(['science', 'technology']);
/** `category: "auto"` lets Gemini choose; without Gemini these articles land in FALLBACK_CATEGORY. */
export const AUTO = 'auto';
const FALLBACK_CATEGORY = 'society';

async function categoryIds(): Promise<string[]> {
  const cats = await readJson<Array<{ id: string }> | { categories: Array<{ id: string }> }>(path.join(CONTENT, 'categories.json'));
  return (Array.isArray(cats) ? cats : cats.categories).map((c) => c.id);
}
const MIN_WORDS = { adapt: 250, summary: 200 };

/** Trim an adapted draft from the end until it fits Reader's length (keeps whole paragraphs). */
export function trimToFit(a: ArticleSource, max = 950): boolean {
  let trimmed = false;
  while (totalWords(a) > max && a.sections.length > 1) {
    const last = a.sections[a.sections.length - 1];
    const paras = last.body_en.split(/\n\s*\n/);
    if (paras.length > 1 && a.sections.length <= 5) last.body_en = paras.slice(0, -1).join('\n\n');
    else a.sections.pop();
    trimmed = true;
  }
  return trimmed;
}

export function modeFor(url: string, mode: Mode = 'auto'): Exclude<Mode, 'auto'> {
  const rule = ruleFor(url);
  if (mode === 'summary') return 'summary';
  if (!rule) {
    if (mode !== 'auto') throw new Error(`${new URL(url).hostname} is not in the licence table: only summary mode is possible`);
    return 'summary';
  }
  return mode === 'auto' ? (rule.group === 3 ? 'verbatim' : 'adapt') : mode;
}

async function covers(title: string, category: string) {
  const query = `${title.split(/[:?—–-]/)[0]} ${category}`.slice(0, 80);
  const candidates: CoverSource[] = await findCovers(query, { videos: true, nasa: SCIENCE.has(category), category });
  const cover: CoverSource = candidates[0] ?? { type: 'image', url: '/icons/og.png', provider: 'own', author: 'Reader', license: 'CC BY 4.0' };
  return { cover, coverCandidates: candidates, ...(candidates[0] ? await remotePlaceholder(cover) : {}) };
}

/** Remove everything an unfinished article left behind (article, source record, raw text). */
async function discard(a: ArticleSource) {
  const files = [path.join(dirs.articles, `${a.slug}.json`)];
  if (a.origin.sourceId) files.push(path.join(dirs.sources, `${a.origin.sourceId}.json`), path.join(dirs.raw, `${a.origin.sourceId}.json`));
  await Promise.all(files.map((f) => fs.rm(f, { force: true })));
}

async function fromLicensed(url: string, category: string, categories?: string[], maxWords?: number): Promise<{ a: ArticleSource; ai: string[] }> {
  const { article: a } = await importSource(url, category === AUTO ? FALLBACK_CATEGORY : category);
  try {
    if (totalWords(a) < MIN_WORDS.adapt) throw new Error(`Only ${totalWords(a)} words of text found`);
    if (a.origin.group === 3 && maxWords && totalWords(a) > maxWords)
      throw new Error(`${totalWords(a)} words: too long to republish word for word (limit ${maxWords})`);
    if (a.origin.group !== 3 && trimToFit(a) && !a.origin.changes.includes('shortened')) a.origin.changes.push('shortened');
    const ai = hasGemini() ? await enrich(a, { categories }) : [];
    // The topic changed after the cover was picked from the stock photo list: pick again.
    if (category === AUTO && a.category !== FALLBACK_CATEGORY && a.cover.url.startsWith('https://picsum.photos/'))
      Object.assign(a, await covers(a.title.en, a.category));
    return { a, ai };
  } catch (e) {
    await discard(a);
    throw e;
  }
}

function skeleton(slug: string, category: string, origin: ArticleSource['origin'], references: ArticleSource['references']): ArticleSource {
  return {
    slug,
    status: 'draft',
    previewUrl: previewUrl(slug),
    category,
    tags: [],
    title: { en: '' },
    hook: { en: '' },
    sections: [],
    references,
    cover: { type: 'image', url: '/icons/og.png', provider: 'own', author: 'Reader', license: 'CC BY 4.0' },
    origin,
  };
}

async function fromSummary(url: string, category: string, categories?: string[]): Promise<{ a: ArticleSource; ai: string[] }> {
  if (!hasGemini()) throw new SkipError('Summary mode needs GEMINI_API_KEY');
  const page = await readPage(url, { plain: true });
  const text = page.sections.map((s) => [s.heading, ...s.paragraphs].filter(Boolean).join('\n\n')).join('\n\n');
  if (wordCount(text) < MIN_WORDS.summary) throw new Error(`Only ${wordCount(text)} words readable (paywall or script-only page?)`);
  const rule = ruleFor(url);
  const host = new URL(url).hostname.replace(/^www\./, '');
  const publisher = rule?.publisher ?? page.siteName ?? host;
  const w = await summarize({ title: page.title, publisher, text }, categories);
  const slug = await uniqueSlug(w.title_en || page.title);
  const year = page.year ?? new Date().getFullYear();
  const a = skeleton(
    slug,
    category === AUTO ? FALLBACK_CATEGORY : category,
    {
      group: 5,
      license: rule?.license ?? 'Copyright',
      authors: page.authors.length ? page.authors : [publisher],
      originalTitle: page.title,
      originalUrl: url,
      publisher,
      changes: ['summarised by Reader'],
    },
    [{ id: 'source', label: `${publisher} (${year})`, url }],
  );
  applyWritten(a, w, categories);
  // The summary must point to its source at least once.
  if (!a.sections.some((s) => citedIds(s.body_en).includes('source')) && !citedIds(a.hook.en).includes('source') && a.sections[0])
    a.sections[0].body_en += ' {source}';
  Object.assign(a, await covers(a.title.en, a.category));
  return { a, ai: ['summary', 'vi', 'keyPoint', 'applySteps'] };
}

async function fromOwnText(input: CreateInput, categories?: string[]): Promise<{ a: ArticleSource; ai: string[] }> {
  const text = input.text!.trim();
  const category = input.category === AUTO ? FALLBACK_CATEGORY : input.category;
  const origin: ArticleSource['origin'] = { group: 4, license: 'Reader-CC-BY-4.0', authors: [input.author ?? 'Reader editors'], changes: [] };
  if (hasGemini()) {
    const w = await fromText(text, input.title, categories);
    const a = skeleton(await uniqueSlug(w.title_en || input.title || 'article'), category, origin, []);
    applyWritten(a, w, categories);
    Object.assign(a, await covers(a.title.en, a.category));
    return { a, ai: ['vi', 'keyPoint', 'applySteps', 'structure'] };
  }
  // Without Gemini: first paragraph is the hook, the rest become sections of at most 130 words.
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const title = input.title?.trim() || paras[0].split(/[.!?]/)[0].split(/\s+/).slice(0, 12).join(' ');
  const a = skeleton(await uniqueSlug(title), category, origin, []);
  a.title = { en: title };
  a.hook = { en: paras[0] };
  let cur: string[] = [];
  for (const p of paras.slice(1)) {
    if (cur.length && wordCount([...cur, p].join(' ')) > 130) {
      a.sections.push({ body_en: cur.join('\n\n') });
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) a.sections.push({ body_en: cur.join('\n\n') });
  if (!a.sections.length) a.sections.push({ body_en: paras[0] });
  Object.assign(a, await covers(title, category));
  return { a, ai: [] };
}

export async function createArticle(input: CreateInput): Promise<Created> {
  let made: { a: ArticleSource; ai: string[] };
  const categories = input.category === AUTO && hasGemini() ? await categoryIds() : undefined;
  if (input.url) {
    const mode = modeFor(input.url, input.mode);
    made = mode === 'summary' ? await fromSummary(input.url, input.category, categories) : await fromLicensed(input.url, input.category, categories, input.maxWords);
  } else if (input.text?.trim()) made = await fromOwnText(input, categories);
  else throw new Error('Give a link or paste the text');

  const { a, ai } = made;
  a.status = 'published';
  a.publishAt = input.publishAt ?? new Date().toISOString();
  // Merging the bot's pull request is the editor's review of the Gemini-written parts.
  if (ai.length) a.ai = { fields: [...new Set([...(a.ai?.fields ?? []), ...ai])], reviewed: true, model: MODEL };
  const check = validateArticle(a);
  if (!check.ok) {
    await discard(a);
    throw new Error(check.issues.filter((i) => i.level === 'error').map((i) => `${i.field}: ${i.message}`).join('; '));
  }
  await writeJson(path.join(dirs.articles, `${a.slug}.json`), a);
  return { slug: a.slug, group: a.origin.group, title: a.title.en, words: check.wordCount, url: input.url, issues: check.issues, ai };
}
