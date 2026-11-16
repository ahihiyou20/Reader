// Covers that never go blank and are sharp on a desktop: every article gets a portrait image for
// phones and a landscape one (about 2560 px) for wide screens.
//   pnpm tsx --env-file-if-exists=.env.local scripts/pipeline/host-covers.ts [--limit N] [slug…]
// With UNSPLASH_ACCESS_KEY, Unsplash photos are served from Unsplash's own image CDN, cropped to each
// shape there (the API guidelines ask apps to hotlink and to report each use). Without a key, remote
// covers are copied to Cloudinary (CLOUDINARY_URL), or into public/covers without it. picsum.photos, which served the stock covers, has gone dark
// before; nothing points at it once this has run.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { ArticleSource } from '../../lib/content/types';
import { hasCloudinary, onCloudinary, uploadImage } from './cloudinary';
import { CONTENT, ROOT, USER_AGENT, dirs, exists, listJson, readJson, writeJson } from './lib';

const OUT = path.join(ROOT, 'public', 'covers');
/** Unsplash photo id → CDN base URL and photographer, so a photo is asked for once, ever (a demo key allows 50 calls an hour). */
const CACHE = path.join(CONTENT, 'generated', 'unsplash-urls.json');
/** Unsplash API guidelines: every link back to Unsplash carries these. */
export const UTM = 'utm_source=pagemoor&utm_medium=referral';

interface Photo {
  raw: string;
  name: string;
  username: string;
}
export const PORTRAIT = { width: 1080, height: 1920, quality: 74 };
export const WIDE = { width: 2560, height: 1440, quality: 80 };
export const cdn = (raw: string, box: { width: number; height: number; quality: number }) =>
  `${raw}${raw.includes('?') ? '&' : '?'}w=${box.width}&h=${box.height}&fit=crop&crop=entropy&q=${box.quality}&fm=webp`;

/** The Unsplash key's hourly quota is used up: stop, run again later. */
/** The photo was removed from Unsplash. */
class Gone extends Error {}

class RateLimit extends Error {
  constructor() {
    super('Unsplash hourly limit reached');
  }
}

const picsumId = (url: string) => url.match(/picsum\.photos\/id\/(\d+)\//)?.[1];
export const unsplashId = (url: string | undefined) => url?.match(/unsplash\.com\/photos\/(?:[^/?#]*-)?([A-Za-z0-9_-]{11})\/?(?:[?#].*)?$/)?.[1];
const onUnsplashCdn = (url: string | undefined) => !!url && url.startsWith('https://images.unsplash.com/');

async function download(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, ...headers }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
  return Buffer.from(await res.arrayBuffer());
}

// Older entries hold only the URL (string): those photos were already reported as used.
let cache: Record<string, Photo | string> | undefined;

/** An Unsplash photo from the cache or the API; the API is told the photo is used the first time. */
async function unsplashPhoto(photo: string, key: string): Promise<Photo> {
  cache ??= await readJson<Record<string, Photo | string>>(CACHE, {});
  const known = cache[photo];
  if (known && typeof known !== 'string') return known;
  const auth = { authorization: `Client-ID ${key}`, 'accept-version': 'v1' };
  const res = await fetch(`https://api.unsplash.com/photos/${photo}`, { headers: auth, signal: AbortSignal.timeout(30_000) });
  if (res.status === 403 || res.status === 429) throw new RateLimit();
  if (res.status === 404) throw new Gone(photo);
  if (!res.ok) throw new Error(`Unsplash HTTP ${res.status} for ${photo}`);
  const meta = (await res.json()) as { urls: { raw: string }; links: { download_location: string }; user: { name: string; username: string } };
  if (!known) await fetch(meta.links.download_location, { headers: auth, signal: AbortSignal.timeout(30_000) }).catch(() => {});
  const entry = { raw: meta.urls.raw, name: meta.user.name, username: meta.user.username };
  cache[photo] = entry;
  await writeJson(CACHE, cache);
  if (res.headers.get('x-ratelimit-remaining') === '0') throw new RateLimit();
  return entry;
}

/** A portrait photo for the article's subject that no other article uses as its cover. */
async function replacement(a: ArticleSource, key: string): Promise<string | undefined> {
  const used = new Set(
    (await Promise.all((await listJson(dirs.articles)).map((f) => readJson<ArticleSource>(path.join(dirs.articles, f))))).map((x) => unsplashId(x.cover.sourceUrl)),
  );
  for (const query of [...(a.tags ?? []).slice(0, 2), a.category]) {
    const q = new URLSearchParams({ query, orientation: 'portrait', per_page: '20', content_filter: 'high' });
    const res = await fetch(`https://api.unsplash.com/search/photos?${q}`, { headers: { authorization: `Client-ID ${key}`, 'accept-version': 'v1' }, signal: AbortSignal.timeout(30_000) });
    if (res.status === 403 || res.status === 429) throw new RateLimit();
    if (!res.ok) continue;
    const hit = ((await res.json()) as { results: Array<{ id: string }> }).results.find((r) => !used.has(r.id));
    if (hit) return hit.id;
  }
  return undefined;
}

/** Stock photos are shared by many articles: one pair of files per photo, not per article. */
const baseName = (a: ArticleSource) => {
  const stock = picsumId(a.cover.url);
  return stock ? `stock-${stock}` : a.slug;
};

async function selfHost(a: ArticleSource): Promise<boolean> {
  const remote = /^https?:/.test(a.cover.url) && !onCloudinary(a.cover.url);
  const name = baseName(a);
  const portrait = path.join(OUT, `${name}.webp`);
  const wide = path.join(OUT, `${name}-wide.webp`);
  const cloud = hasCloudinary();
  if (cloud || !(await exists(wide)) || (remote && !(await exists(portrait)))) {
    const stock = picsumId(a.cover.url);
    const src = stock ? `https://picsum.photos/id/${stock}/3200/2400` : remote ? a.cover.url : undefined;
    if (!src) return false;
    const image = await download(src);
    // A source smaller than the target is kept at its own size rather than blown up.
    const fit = (box: typeof PORTRAIT) =>
      sharp(image).rotate().resize({ ...box, fit: 'cover', position: 'attention', withoutEnlargement: true }).webp({ quality: box.quality });
    if (cloud) {
      if (remote) a.cover.url = await uploadImage(await fit(PORTRAIT).toBuffer(), `pagemoor/covers/${name}`);
      a.cover.wide = await uploadImage(await fit(WIDE).toBuffer(), `pagemoor/covers/${name}-wide`);
      return true;
    }
    await fs.mkdir(OUT, { recursive: true });
    if (remote) await fit(PORTRAIT).toFile(portrait);
    await fit(WIDE).toFile(wide);
  }
  if (remote) a.cover.url = `/covers/${name}.webp`;
  a.cover.wide = `/covers/${name}-wide.webp`;
  return true;
}

const LOCAL_COVER = /^\/covers\/[^/]+\.webp$/;

/**
 * Move up to `limit` articles' cover images from public/covers/ to Cloudinary and point the articles at
 * them, then delete every file in public/covers/ no article points at any more. Returns the slugs moved.
 * A few articles per run keeps each run short and its commit easy to check.
 */
export async function moveCoversOffRepo(limit: number): Promise<string[]> {
  if (!hasCloudinary()) return [];
  const files = await listJson(dirs.articles);
  const moved: string[] = [];
  const kept = new Set<string>();
  for (const f of files) {
    const file = path.join(dirs.articles, f);
    const a = await readJson<ArticleSource>(file);
    const keys = (['url', 'wide', 'poster'] as const).filter((k) => LOCAL_COVER.test(a.cover[k] ?? ''));
    if (!keys.length) continue;
    if (moved.length >= limit) {
      for (const k of keys) kept.add(a.cover[k]!);
      continue;
    }
    const locals = keys.map((k) => a.cover[k]!);
    try {
      for (const k of keys) {
        const local = a.cover[k]!;
        a.cover[k] = await uploadImage(await fs.readFile(path.join(ROOT, 'public', local)), `pagemoor/covers/${path.basename(local, '.webp')}`);
      }
      await writeJson(file, a);
      moved.push(a.slug);
    } catch (e) {
      for (const l of locals) kept.add(l);
      console.warn(`${a.slug}: cover stays in the repo (${(e as Error).message.slice(0, 160)})`);
    }
  }
  for (const f of await fs.readdir(OUT, { withFileTypes: true }))
    if (f.isFile() && f.name.endsWith('.webp') && !kept.has(`/covers/${f.name}`)) await fs.rm(path.join(OUT, f.name));
  return moved;
}

/** Returns true when the article file changed. */
export async function hostCover(a: ArticleSource): Promise<boolean> {
  if (a.cover.type !== 'image') return false;
  const key = process.env.UNSPLASH_ACCESS_KEY;
  const photo = a.cover.provider === 'unsplash' ? unsplashId(a.cover.sourceUrl) : undefined;
  if (key && photo) {
    // Done already: served from Unsplash's CDN with the photographer's profile linked.
    if (onUnsplashCdn(a.cover.url) && onUnsplashCdn(a.cover.wide) && a.cover.authorUrl?.includes('utm_source')) return false;
    // The API guidelines ask for the API's own image URLs everywhere, so copies kept in the repo are replaced too.
    let p: Photo;
    try {
      p = await unsplashPhoto(photo, key);
    } catch (e) {
      if (!(e instanceof Gone)) throw e;
      // The photographer removed it: pick another photo on the article's subject.
      const next = await replacement(a, key);
      if (!next) throw new Error(`Unsplash photo ${photo} removed and no replacement found`);
      a.cover.sourceUrl = `https://unsplash.com/photos/${next}`;
      p = await unsplashPhoto(next, key);
    }
    a.cover.url = cdn(p.raw, PORTRAIT);
    a.cover.wide = cdn(p.raw, WIDE);
    a.cover.author = p.name;
    a.cover.authorUrl = `https://unsplash.com/@${p.username}?${UTM}`;
    return true;
  }
  const remote = /^https?:/.test(a.cover.url) && !onUnsplashCdn(a.cover.url);
  if (!remote && a.cover.wide) return false;
  return selfHost(a);
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--limit');
  const limit = at >= 0 ? Number(args.splice(at, 2)[1]) : Infinity;
  const all = args.length ? args.map((s) => `${s}.json`) : await listJson(dirs.articles);
  // Articles with no usable cover first, then the rest.
  const blank = await Promise.all(all.map(async (f) => /picsum\.photos/.test((await readJson<ArticleSource>(path.join(dirs.articles, f))).cover.url)));
  const files = [...all.filter((_, i) => blank[i]), ...all.filter((_, i) => !blank[i])];
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
  const left = (await Promise.all(all.map(async (f) => readJson<ArticleSource>(path.join(dirs.articles, f))))).filter((a) => /picsum\.photos/.test(a.cover.url)).length;
  console.log(`covers: ${done} updated, ${left} still on picsum.photos${failed.size ? `; not fetched — ${[...failed].map(([k, n]) => `${n}× ${k}`).join(', ')}` : ''}`);
}

if (process.argv[1]?.endsWith('host-covers.ts'))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
