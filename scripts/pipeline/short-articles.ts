// Articles under 1,000 English words that may be lengthened from their sources (docs/10), in the order
// to work through them: published before drafts, most read first, then newest. Group 3 (CC BY-ND)
// text must stay word for word, so it is never listed.
//   pnpm tsx scripts/pipeline/short-articles.ts [--limit 25] [--json]
import path from 'node:path';
import type { ArticleSource, Counts } from '../../lib/content/types';
import { CONTENT, dirs, listJson, readJson } from './lib';
import { articleWords } from './standard';

export const MIN_WORDS = 1000;

export interface ShortArticle {
  slug: string;
  group: number;
  status: string;
  words: number;
  /** What the lengthening is built from: the original page, then the article's references. */
  sources: string[];
}

export async function shortArticles(): Promise<ShortArticle[]> {
  const counts = await readJson<Record<string, Counts>>(path.join(CONTENT, 'generated', 'counts.json'), {});
  const reads = (slug: string) => {
    const c = counts[slug];
    return c ? c.likes + c.saves * 2 + c.shares * 2 + c.comments : 0;
  };
  const rows: Array<ShortArticle & { reads: number; at: string }> = [];
  for (const f of await listJson(dirs.articles)) {
    const a = await readJson<ArticleSource>(path.join(dirs.articles, f));
    const words = articleWords(a);
    if (a.origin.group === 3 || a.status === 'unpublished' || words >= MIN_WORDS) continue;
    const sources = [...new Set([a.origin.originalUrl, ...a.references.map((r) => r.url)].filter((u): u is string => Boolean(u?.startsWith('http'))))];
    rows.push({ slug: a.slug, group: a.origin.group, status: a.status, words, sources, reads: reads(a.slug), at: a.publishAt ?? '' });
  }
  rows.sort((x, y) => Number(y.status === 'published') - Number(x.status === 'published') || y.reads - x.reads || y.at.localeCompare(x.at));
  return rows.map(({ reads: _r, at: _a, ...r }) => r);
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--limit');
  const limit = at >= 0 ? Number(args[at + 1]) : Infinity;
  const all = await shortArticles();
  const list = all.slice(0, limit);
  if (args.includes('--json')) return console.log(JSON.stringify(list, null, 2));
  console.log(`${all.length} articles under ${MIN_WORDS} words (group 3 left out); next ${list.length}:`);
  for (const r of list) console.log(`${r.slug}\tgroup ${r.group}\t${r.status}\t${r.words} words\t${r.sources.slice(0, 3).join(' ')}`);
}

if (process.argv[1]?.endsWith('short-articles.ts'))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
