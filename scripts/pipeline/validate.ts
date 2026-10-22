// Step 7 (docs/05): check every article, write the job summary and keep one GitHub issue,
// "Content checks", up to date (opened when there are errors, closed when they are fixed).
//   pnpm validate            (local: prints the report)
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo pnpm validate --issue
import path from 'node:path';
import type { ArticleSource, Category } from '../../lib/content/types';
import { validateArticle, type Issue } from '../../lib/content/validate';
import { CONTENT, dirs, jobSummary, listJson, readJson, SITE_URL } from './lib';

const ISSUE_TITLE = 'Content checks';

interface Row {
  file: string;
  slug: string;
  status: string;
  issues: Issue[];
}

export async function checkAll(): Promise<Row[]> {
  const categories = (await readJson<Category[]>(path.join(CONTENT, 'categories.json'))).map((c) => c.id);
  const rows: Row[] = [];
  for (const f of await listJson(dirs.articles)) {
    let data: ArticleSource;
    try {
      data = await readJson<ArticleSource>(path.join(dirs.articles, f));
    } catch (e) {
      rows.push({ file: f, slug: f, status: '?', issues: [{ level: 'error', field: 'file', message: `Invalid JSON: ${(e as Error).message}` }] });
      continue;
    }
    const sourceId = data.origin?.sourceId;
    const source = sourceId ? await readJson<{ license?: string } | null>(path.join(dirs.sources, `${sourceId}.json`), null) : null;
    const raw = sourceId ? await readJson<{ body?: string[] } | null>(path.join(dirs.raw, `${sourceId}.json`), null) : null;
    const res = validateArticle(data, { categories, sourceLicense: source?.license, rawBody: raw?.body });
    if (data.slug && `${data.slug}.json` !== f) res.issues.unshift({ level: 'error', field: 'slug', message: `File must be named ${data.slug}.json` });
    if (sourceId && !source) res.issues.push({ level: 'error', field: 'origin.sourceId', message: `content/sources/${sourceId}.json is missing` });
    rows.push({ file: f, slug: data.slug ?? f, status: data.status ?? '?', issues: res.issues });
  }
  return rows;
}

function report(rows: Row[]) {
  const errs = rows.filter((r) => r.issues.some((i) => i.level === 'error'));
  const warns = rows.filter((r) => !errs.includes(r) && r.issues.some((i) => i.level === 'warning'));
  const repo = process.env.GITHUB_REPOSITORY;
  const cms = `${SITE_URL}/cms/#/collections/articles/entries/`;
  const lines = [
    `**${rows.length} articles** · ${errs.length} with errors · ${warns.length} with warnings · ${rows.filter((r) => r.status === 'published').length} published`,
    '',
    'Errors keep an article out of the app (published articles with errors are skipped at build time). Warnings are advice.',
    '',
  ];
  for (const r of [...errs, ...warns]) {
    lines.push(`### ${r.issues.some((i) => i.level === 'error') ? '✗' : '⚠'} \`${r.slug}\` (${r.status})`);
    lines.push(`[Edit in CMS](${cms}${r.slug}) · [Preview](${SITE_URL}/preview?slug=${r.slug})${repo ? ` · [File](https://github.com/${repo}/blob/main/content/articles/${r.file})` : ''}`);
    for (const i of r.issues.filter((x) => x.level !== 'info')) lines.push(`- **${i.level}** \`${i.field}\`: ${i.message}`);
    lines.push('');
  }
  return { md: lines.join('\n'), errors: errs.length };
}

async function gh<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${url}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function syncIssue(md: string, errors: number) {
  const found = await gh<Array<{ number: number; title: string; state: string }>>('GET', `/issues?state=all&labels=content-checks&per_page=10`);
  const existing = found.find((i) => i.title === ISSUE_TITLE);
  const body = `${md}\n\n_Updated by the validate workflow on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC._`;
  if (errors > 0) {
    if (existing) await gh('PATCH', `/issues/${existing.number}`, { body, state: 'open' });
    else await gh('POST', '/issues', { title: ISSUE_TITLE, body, labels: ['content-checks'] });
  } else if (existing && existing.state === 'open') {
    await gh('PATCH', `/issues/${existing.number}`, { body, state: 'closed', state_reason: 'completed' });
  }
}

async function main() {
  const rows = await checkAll();
  const { md, errors } = report(rows);
  console.log(md);
  await jobSummary(`## Content checks\n\n${md}`);
  if (process.argv.includes('--issue') && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) await syncIssue(md, errors);
  if (errors && process.argv.includes('--strict')) process.exit(1);
}

if (process.argv[1]?.endsWith('validate.ts')) main();
