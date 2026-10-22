// Step 2–4 of the pipeline (docs/05): fetch a source, check its licence, keep a raw copy, pick a
// 700–950-word stretch, suggest covers and write a draft article for the editors.
//   pnpm tsx scripts/pipeline/import.ts <backlog-id>            (content/backlog/<id>.json)
//   pnpm tsx scripts/pipeline/import.ts --url <url> --category <id>
//   pnpm tsx scripts/pipeline/import.ts --pending               (every backlog item with status "ready")
import path from 'node:path';
import type { ArticleSource, CoverSource } from '../../lib/content/types';
import { ALLOWED_LICENSES } from '../../lib/content/types';
import { validateArticle } from '../../lib/content/validate';
import { importUrl } from './adapters';
import type { Imported } from './adapters/types';
import { findCovers, remotePlaceholder } from './cover';
import { dirs, jobSummary, listJson, previewUrl, readJson, slugify, today, uniqueSlug, wordCount, writeJson } from './lib';
import { selectWindow } from './select-window';

interface Backlog {
  url: string;
  category: string;
  note?: string;
  status: 'ready' | 'importing' | 'imported' | 'failed';
  slug?: string;
  error?: string;
}

const SCIENCE = new Set(['science', 'technology']);

function chunk(s: { heading?: string; paragraphs: string[] }, limit = 130) {
  const out: Array<{ heading?: string; paragraphs: string[] }> = [];
  let cur: { heading?: string; paragraphs: string[] } = { heading: s.heading, paragraphs: [] };
  let n = 0;
  for (const p of s.paragraphs) {
    const w = wordCount(p);
    if (cur.paragraphs.length && n + w > limit) {
      out.push(cur);
      cur = { paragraphs: [] };
      n = 0;
    }
    cur.paragraphs.push(p);
    n += w;
  }
  if (cur.paragraphs.length) out.push(cur);
  return out;
}

export function rawBodyOf(a: Pick<ArticleSource, 'hook' | 'sections'>) {
  return [a.hook.en, ...a.sections.map((s) => s.body_en)];
}

export async function draftFrom(src: Imported, category: string, sourceId: string): Promise<{ article: ArticleSource; needsTrim: boolean }> {
  const verbatim = src.group === 3;
  const win = verbatim ? { sections: src.sections, needsTrim: false, shortened: false, words: 0 } : selectWindow(src.sections);
  const [first, ...rest] = win.sections;
  const hook = first.paragraphs[0];
  const firstRest = first.paragraphs.slice(1);
  const grouped = [...(firstRest.length ? [{ heading: undefined as string | undefined, paragraphs: firstRest }] : []), ...rest];
  // Reader sections are short (≤ 130 words): split long source sections at paragraph boundaries.
  const sections = (verbatim ? grouped : grouped.flatMap((s) => chunk(s))).map((s) => ({
    ...(s.heading ? { heading_en: s.heading } : {}),
    body_en: s.paragraphs.join('\n\n'),
  }));
  const slug = await uniqueSlug(src.title);
  const changes = verbatim ? [] : ['divided into sections', ...(win.shortened ? ['shortened'] : [])];
  const query = `${src.title.split(/[:?—–-]/)[0]} ${category}`.slice(0, 80);
  const candidates: CoverSource[] = await findCovers(query, { videos: true, nasa: SCIENCE.has(category) });
  const cover: CoverSource = candidates[0] ?? {
    type: 'image',
    url: '/icons/og.png',
    provider: 'own',
    author: 'Reader',
    license: 'CC BY 4.0',
  };
  const placeholder = candidates[0] ? await remotePlaceholder(cover) : {};
  const year = src.year ?? new Date().getFullYear();
  const article: ArticleSource = {
    slug,
    status: 'draft',
    previewUrl: previewUrl(slug),
    category,
    tags: [],
    title: { en: src.title },
    hook: { en: hook },
    sections,
    references: src.references?.length ? src.references : [{ id: 'source', label: `${src.publisher} (${year})`, url: src.url }],
    cover,
    coverCandidates: candidates,
    ...placeholder,
    origin: {
      group: src.group,
      sourceId,
      license: src.license,
      authors: src.authors.length ? src.authors : [src.publisher],
      originalTitle: src.title,
      originalUrl: src.url,
      publisher: src.publisher,
      changes,
    },
  };
  return { article, needsTrim: win.needsTrim };
}

async function run(url: string, category: string, backlogFile?: string) {
  const backlog = backlogFile ? await readJson<Backlog>(backlogFile) : null;
  if (backlog && backlogFile) await writeJson(backlogFile, { ...backlog, status: 'importing', error: undefined });
  try {
    const src = await importUrl(url);
    if (!ALLOWED_LICENSES.includes(src.license)) throw new Error(`Licence ${src.license} is not allowed`);
    if (!src.sections.length) throw new Error('No text found');
    const sourceId = slugify(`${new URL(url).hostname.replace(/^www\./, '')}-${src.title}`, 80);
    await writeJson(path.join(dirs.sources, `${sourceId}.json`), {
      id: sourceId,
      url,
      title: src.title,
      authors: src.authors,
      publisher: src.publisher,
      year: src.year,
      license: src.license,
      licenseUrl: src.licenseUrl,
      group: src.group,
      termsUrl: src.termsUrl,
      importedAt: new Date().toISOString(),
    });
    const { article, needsTrim } = await draftFrom(src, category, sourceId);
    await writeJson(path.join(dirs.raw, `${sourceId}.json`), {
      sections: src.sections,
      // Group 3 (CC BY-ND): the article text must stay identical to this (checked by validate).
      ...(src.group === 3 ? { body: rawBodyOf(article) } : {}),
    });
    await writeJson(path.join(dirs.articles, `${article.slug}.json`), article);
    if (backlog && backlogFile) await writeJson(backlogFile, { ...backlog, status: 'imported', slug: article.slug, error: undefined });
    const check = validateArticle(article);
    const lines = [
      `### Imported “${src.title}” → \`${article.slug}\``,
      `- Licence: ${src.license} · group ${src.group} · ${src.publisher}`,
      `- ${check.wordCount} words${needsTrim ? ' — **needs trimming** to 700–950' : ''}`,
      `- Cover candidates: ${article.coverCandidates?.length ?? 0}`,
      `- Preview: ${article.previewUrl}`,
      ...check.issues.map((i) => `- ${i.level}: ${i.field} — ${i.message}`),
    ];
    console.log(lines.join('\n'));
    await jobSummary(lines.join('\n'));
    return article.slug;
  } catch (e) {
    const message = (e as Error).message;
    console.error(`✗ ${url}: ${message}`);
    if (backlog && backlogFile) await writeJson(backlogFile, { ...backlog, status: 'failed', error: `${today()}: ${message}` });
    await jobSummary(`### ✗ Import failed\n${url}\n\n${message}`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const url = flag('url');
  if (url) {
    const ok = await run(url, flag('category') ?? 'science');
    process.exit(ok ? 0 : 1);
  }
  const ids = args.includes('--pending')
    ? (await Promise.all((await listJson(dirs.backlog)).map(async (f) => ((await readJson<Backlog>(path.join(dirs.backlog, f))).status === 'ready' ? f : null)))).filter(
        (f): f is string => Boolean(f),
      )
    : args.filter((a) => !a.startsWith('--')).map((a) => (a.endsWith('.json') ? path.basename(a) : `${a}.json`));
  if (!ids.length) console.log('Nothing to import.');
  let failed = 0;
  for (const f of ids) {
    const file = path.join(dirs.backlog, f);
    const item = await readJson<Backlog>(file);
    if (!(await run(item.url, item.category, file))) failed++;
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('import.ts')) main();
