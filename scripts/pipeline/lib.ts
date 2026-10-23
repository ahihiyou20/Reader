// Shared helpers for the content pipeline (docs/05). Runs in GitHub Actions and locally with tsx.
import fs from 'node:fs/promises';
import path from 'node:path';

export const ROOT = process.cwd();
export const CONTENT = path.join(ROOT, 'content');
export const dirs = {
  articles: path.join(CONTENT, 'articles'),
  backlog: path.join(CONTENT, 'backlog'),
  sources: path.join(CONTENT, 'sources'),
  raw: path.join(CONTENT, 'raw'),
  generated: path.join(CONTENT, 'generated'),
};

export const SITE_URL = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://reader-xtm.pages.dev').replace(/\/$/, '');
export const USER_AGENT = `ReaderContentPipeline/1.0 (+https://github.com/${process.env.GITHUB_REPOSITORY ?? 'ahihiyou20/Reader'})`;

export async function readJson<T>(file: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (e) {
    if (fallback !== undefined && (e as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw e;
  }
}

export async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

export async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function listJson(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

export function slugify(s: string, max = 60): string {
  const slug = s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, max).replace(/-+$/, '') || 'article';
}

export async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  for (let i = 2; await exists(path.join(dirs.articles, `${slug}.json`)); i++) slug = `${slugify(base, 56)}-${i}`;
  return slug;
}

export async function http(url: string, init: RequestInit = {}, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { 'user-agent': USER_AGENT, ...(init.headers ?? {}) } });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`${res.status} ${url}`);
        await new Promise((r) => setTimeout(r, 1500 * (i + 1) * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function httpText(url: string, init?: RequestInit) {
  const res = await http(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

export async function httpJson<T>(url: string, init?: RequestInit): Promise<T> {
  return JSON.parse(await httpText(url, init)) as T;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function previewUrl(slug: string) {
  return `${SITE_URL}/preview?slug=${encodeURIComponent(slug)}`;
}

/** Append a markdown block to the GitHub Actions job summary when running in Actions. */
export async function jobSummary(md: string) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) await fs.appendFile(file, md + '\n');
}

export async function setOutput(name: string, value: string) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) await fs.appendFile(file, `${name}=${value}\n`);
  else console.log(`::output ${name}=${value}`);
}

export function wordCount(s: string) {
  return (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%-]*/gu) ?? []).length;
}
