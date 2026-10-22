// Reads content/ and writes public/data/* for the static app (docs/06 §2.1, §2.4).
// Published articles with errors are left out of the feed, so one broken file cannot break the site.
import fs from 'node:fs/promises';
import path from 'node:path';
import MiniSearch from 'minisearch';
import { categorySchema } from '../lib/content/schema';
import { plainText } from '../lib/content/markup';
import { rankFeed } from '../lib/content/rank';
import { toClient, toFeedItem } from '../lib/content/transform';
import type { ArticleClient, ArticleSource, Category, Counts } from '../lib/content/types';
import { ZERO_COUNTS } from '../lib/content/types';
import { validateArticle } from '../lib/content/validate';
import { SEARCH_OPTIONS, type SearchDoc } from '../lib/search';
import { mediaInfo } from './lib/media';

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');
const OUT = path.join(ROOT, 'public', 'data');
const includeDrafts = process.env.INCLUDE_DRAFTS === '1';

async function readJson<T>(file: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (e) {
    if (fallback !== undefined && (e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw new Error(`${path.relative(ROOT, file)}: ${(e as Error).message}`);
  }
}

async function main() {
  const categories = (await readJson<unknown[]>(path.join(CONTENT, 'categories.json'))).map((c) => categorySchema.parse(c)) as Category[];
  categories.sort((a, b) => a.order - b.order);
  const counts = await readJson<Record<string, Partial<Counts>>>(path.join(CONTENT, 'generated', 'counts.json'), {});
  const dir = path.join(CONTENT, 'articles');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();

  const now = Date.now();
  const published: ArticleClient[] = [];
  const sources = new Map<string, ArticleSource>();
  const report: string[] = [];
  let skipped = 0;

  for (const file of files) {
    const raw = await readJson<unknown>(path.join(dir, file));
    const res = validateArticle(raw, { categories: categories.map((c) => c.id) });
    const slug = (raw as { slug?: string }).slug ?? file;
    const errors = res.issues.filter((i) => i.level === 'error');
    const a = res.article;
    const live = a && (a.status === 'published' || (includeDrafts && (a.status === 'draft' || a.status === 'review')));
    if (!a || !live) {
      skipped++;
      continue;
    }
    if (`${a.slug}.json` !== file) {
      report.push(`✗ ${file}: file name must be ${a.slug}.json`);
      continue;
    }
    if (errors.length) {
      report.push(`✗ ${slug}: left out of the feed — ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`);
      continue;
    }
    if (a.status === 'published' && a.publishAt && Date.parse(a.publishAt) > now) {
      report.push(`… ${slug}: scheduled for ${a.publishAt}`);
      continue;
    }
    const media = await mediaInfo(a.cover, { blurDataURL: a.blurDataURL, dominant: a.dominant });
    const c = toClient(a, { ...ZERO_COUNTS, ...counts[a.slug] }, media);
    if (!a.publishAt) c.publishedAt = new Date(now).toISOString();
    published.push(c);
    sources.set(a.slug, a);
  }

  const ranked = rankFeed(published, now);
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(path.join(OUT, 'articles'), { recursive: true });
  const builtAt = new Date(now).toISOString();
  await fs.writeFile(path.join(OUT, 'feed.json'), JSON.stringify({ builtAt, items: ranked.map(toFeedItem) }));
  await fs.writeFile(path.join(OUT, 'categories.json'), JSON.stringify(categories));
  for (const c of ranked) await fs.writeFile(path.join(OUT, 'articles', `${c.slug}.json`), JSON.stringify(c));

  const ms = new MiniSearch<SearchDoc>(SEARCH_OPTIONS);
  ms.addAll(
    ranked.map((c) => {
      const a = sources.get(c.slug)!;
      const refs = Object.fromEntries(a.references.map((r) => [r.id, r.label]));
      const cat = categories.find((x) => x.id === c.category);
      return {
        id: c.slug,
        title_en: a.title.en,
        title_vi: a.title.vi ?? '',
        hook_en: plainText(a.hook.en, refs),
        hook_vi: plainText(a.hook.vi, refs),
        headings: a.sections.flatMap((s) => [s.heading_en, s.heading_vi]).filter(Boolean).join(' · '),
        body: a.sections
          .flatMap((s) => [s.body_en, s.body_vi])
          .map((s) => plainText(s, refs))
          .join(' ')
          .slice(0, 6000),
        category: cat ? `${cat.name.en} ${cat.name.vi ?? ''}` : c.category,
        tags: (a.tags ?? []).join(' '),
      };
    }),
  );
  await fs.writeFile(path.join(OUT, 'search-index.json'), JSON.stringify(ms));

  // Popular terms for the search screen: the most used tags.
  const freq = new Map<string, number>();
  for (const c of ranked) for (const tag of sources.get(c.slug)!.tags ?? []) freq.set(tag, (freq.get(tag) ?? 0) + 1);
  const terms = [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 14).map(([tag]) => tag);
  await fs.writeFile(path.join(OUT, 'terms.json'), JSON.stringify(terms));

  // Local preview (`pnpm dev` only): serve the raw CMS files so /preview works without GitHub.
  const devDir = path.join(ROOT, 'public', '__content');
  await fs.rm(devDir, { recursive: true, force: true });
  if (process.env.CONTENT_DEV === '1') await fs.cp(path.join(CONTENT, 'articles'), path.join(devDir, 'articles'), { recursive: true });

  for (const line of report) console.log(line);
  console.log(`content: ${ranked.length} published, ${skipped} not live${includeDrafts ? ' (drafts included)' : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
