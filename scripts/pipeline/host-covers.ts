// Self-host cover images: a portrait file for phones and a landscape one for wide screens, so a cover
// never depends on a third-party image host being up (picsum.photos, used for the stock covers, has
// gone dark before) and is sharp on a desktop.
//   pnpm tsx --env-file-if-exists=.env.local scripts/pipeline/host-covers.ts [--limit N] [slug…]
// With UNSPLASH_ACCESS_KEY the original photo comes from the Unsplash API; without it, stock covers are
// fetched from picsum.photos. An image that cannot be fetched is left as it is and tried again next run.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { ArticleSource } from '../../lib/content/types';
import { ROOT, USER_AGENT, dirs, exists, listJson, readJson, writeJson } from './lib';

const OUT = path.join(ROOT, 'public', 'covers');

/** The Unsplash key's hourly quota is used up (50 an hour for a new app): stop, run again later. */
class RateLimit extends Error {
  constructor() {
    super('Unsplash hourly limit reached');
  }
}
const PORTRAIT = { width: 1080, height: 1920, quality: 74 };
const WIDE = { width: 2560, height: 1440, quality: 80 };

const picsumId = (url: string) => url.match(/picsum\.photos\/id\/(\d+)\//)?.[1];
const unsplashId = (url: string | undefined) => url?.match(/unsplash\.com\/photos\/(?:[^/]*-)?([A-Za-z0-9_-]{11})\/?$/)?.[1];

async function download(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The largest original we may fetch for this cover, or undefined when there is no source to ask. */
async function original(a: ArticleSource): Promise<Buffer | undefined> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const photo = a.cover.provider === 'unsplash' ? unsplashId(a.cover.sourceUrl) : undefined;
  if (key && photo) {
    const auth = { authorization: `Client-ID ${key}` };
    const res = await fetch(`https://api.unsplash.com/photos/${photo}`, { headers: auth, signal: AbortSignal.timeout(30_000) });
    if (res.status === 403 || res.headers.get('x-ratelimit-remaining') === '0') throw new RateLimit();
    if (!res.ok) throw new Error(`Unsplash HTTP ${res.status}`);
    const meta = (await res.json()) as { urls: { raw: string }; links: { download_location: string } };
    // Unsplash API guidelines: report each download of a photo the app uses.
    await fetch(meta.links.download_location, { headers: auth }).catch(() => {});
    return download(`${meta.urls.raw}&w=3200&q=85&fm=jpg`);
  }
  const stock = picsumId(a.cover.url);
  if (stock) return download(`https://picsum.photos/id/${stock}/3200/2400`);
  if (/^https?:/.test(a.cover.url)) return download(a.cover.url);
  return undefined;
}

/** Stock photos are shared by many articles: one pair of files per photo, not per article. */
const baseName = (a: ArticleSource) => {
  const stock = picsumId(a.cover.url);
  return stock ? `stock-${stock}` : a.slug;
};

/** Returns true when the article file changed. */
export async function hostCover(a: ArticleSource): Promise<boolean> {
  if (a.cover.type !== 'image') return false;
  const remote = /^https?:/.test(a.cover.url);
  if (!remote && a.cover.wide) return false;
  const name = baseName(a);
  const portrait = path.join(OUT, `${name}.webp`);
  const wide = path.join(OUT, `${name}-wide.webp`);
  if (!(await exists(wide)) || (remote && !(await exists(portrait)))) {
    const image = await original(a);
    if (!image) return false;
    // A source smaller than the target is kept at its own size rather than blown up.
    const fit = (box: { width: number; height: number }) => sharp(image).rotate().resize({ ...box, fit: 'cover', position: 'attention', withoutEnlargement: true });
    await fs.mkdir(OUT, { recursive: true });
    if (remote) await fit(PORTRAIT).webp({ quality: PORTRAIT.quality }).toFile(portrait);
    await fit(WIDE).webp({ quality: WIDE.quality }).toFile(wide);
  }
  if (remote) a.cover.url = `/covers/${name}.webp`;
  a.cover.wide = `/covers/${name}-wide.webp`;
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--limit');
  const limit = at >= 0 ? Number(args.splice(at, 2)[1]) : Infinity;
  const all = args.length ? args.map((s) => `${s}.json`) : await listJson(dirs.articles);
  // Articles with no cover in the repo first, then the landscape files for those that have one.
  const remoteFirst = await Promise.all(all.map(async (f) => /^https?:/.test((await readJson<ArticleSource>(path.join(dirs.articles, f))).cover.url)));
  const files = [...all.filter((_, i) => remoteFirst[i]), ...all.filter((_, i) => !remoteFirst[i])];
  let done = 0;
  const failed = new Map<string, number>();
  for (const f of files) {
    if (done >= limit) break;
    const file = path.join(dirs.articles, f);
    const a = await readJson<ArticleSource>(file);
    try {
      if (await hostCover(a)) {
        await writeJson(file, a);
        done++;
      }
    } catch (e) {
      if (e instanceof RateLimit) {
        console.log(`${e.message} at ${f}; run again in an hour to continue.`);
        break;
      }
      const why = (e as Error).message;
      failed.set(why, (failed.get(why) ?? 0) + 1);
      // The host is down for everyone: no point in asking it for every remaining article.
      if (/timeout|aborted|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(why) && (failed.get(why) ?? 0) >= 3) break;
    }
  }
  console.log(`covers: ${done} hosted${failed.size ? `; not fetched — ${[...failed].map(([k, n]) => `${n}× ${k}`).join(', ')}` : ''}`);
}

if (process.argv[1]?.endsWith('host-covers.ts'))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
