// Cover candidates (docs/05 step 4): Unsplash and Pexels when API keys are set, NASA's image library
// (public domain, no key) for science topics, and otherwise Unsplash photos picked by topic through
// picsum.photos (no key). The first candidate becomes the cover.
import path from 'node:path';
import type { ArticleSource, CoverSource } from '../../lib/content/types';
import { placeholderFor } from '../lib/media';
import { PORTRAIT, UTM, WIDE, cdn, unsplashId } from './host-covers';
import { dirs, http, httpJson, listJson, readJson } from './lib';

interface UnsplashPhoto {
  id: string;
  likes?: number;
  urls: { raw: string };
  links: { html: string; download_location: string };
  user: { name: string; username: string };
}

/** Unsplash photos already on a cover (other articles, or earlier in this run): every article gets its own. */
let usedPhotos: Set<string> | undefined;
async function photosInUse(): Promise<Set<string>> {
  if (usedPhotos) return usedPhotos;
  const ids = await Promise.all(
    (await listJson(dirs.articles)).map(async (f) => unsplashId((await readJson<ArticleSource>(path.join(dirs.articles, f))).cover.sourceUrl)),
  );
  usedPhotos = new Set(ids.filter((x): x is string => Boolean(x)));
  return usedPhotos;
}
/** Set when Unsplash refuses for the rest of the hour: the run stops asking. */
let unsplashResting = false;

/**
 * Portrait Unsplash photos for a query, the most liked of the most relevant first, none already in use.
 * Each is served from Unsplash's CDN in both shapes, as the API guidelines ask.
 */
export async function unsplashCovers(query: string, n = 4): Promise<CoverSource[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || unsplashResting) return [];
  const q = new URLSearchParams({ query, orientation: 'portrait', per_page: '20', content_filter: 'high' });
  try {
    const res = await http(`https://api.unsplash.com/search/photos?${q}`, { headers: { authorization: `Client-ID ${key}`, 'accept-version': 'v1' } }, 2, 20_000);
    if (res.status === 403 || res.status === 429) {
      unsplashResting = true;
      console.warn('unsplash: hourly limit reached; later covers come from other sources until the Covers job runs');
      return [];
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get('x-ratelimit-remaining') ?? 99) <= 1) unsplashResting = true;
    const used = await photosInUse();
    const { results } = (await res.json()) as { results: UnsplashPhoto[] };
    return results
      .filter((p) => !used.has(p.id))
      .slice(0, 10)
      .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
      .slice(0, n)
      .map((p) => ({
        type: 'image' as const,
        url: cdn(p.urls.raw, PORTRAIT),
        wide: cdn(p.urls.raw, WIDE),
        provider: 'unsplash' as const,
        author: p.user.name,
        authorUrl: `https://unsplash.com/@${p.user.username}?${UTM}`,
        license: 'Unsplash License',
        sourceUrl: `https://unsplash.com/photos/${p.id}`,
        unsplashDownloadLocation: p.links.download_location,
      }));
  } catch (e) {
    console.warn('unsplash:', (e as Error).message);
    return [];
  }
}

/** The chosen cover's photo is taken, so a later article in the same run picks another. */
export async function claimCover(cover: CoverSource) {
  const id = cover.provider === 'unsplash' ? unsplashId(cover.sourceUrl) : undefined;
  if (id) (await photosInUse()).add(id);
}
interface PexelsPhoto {
  url: string;
  photographer: string;
  photographer_url: string;
  src: { portrait: string };
}
interface PexelsVideo {
  url: string;
  image: string;
  user: { name: string; url: string };
  video_files: Array<{ link: string; width: number; height: number; file_type: string; quality: string }>;
}
interface NasaItem {
  data: Array<{ title: string; nasa_id: string; center?: string; photographer?: string }>;
  links?: Array<{ href: string; rel: string }>;
}

export async function findCovers(query: string, opts: { videos?: boolean; nasa?: boolean; category?: string } = {}): Promise<CoverSource[]> {
  const out: CoverSource[] = [];
  const q = encodeURIComponent(query);
  out.push(...(await unsplashCovers(query)));
  if (process.env.PEXELS_API_KEY) {
    const headers = { authorization: process.env.PEXELS_API_KEY };
    try {
      const r = await httpJson<{ photos: PexelsPhoto[] }>(`https://api.pexels.com/v1/search?query=${q}&orientation=portrait&per_page=4`, { headers });
      for (const p of r.photos)
        out.push({ type: 'image', url: p.src.portrait, provider: 'pexels', author: p.photographer, authorUrl: p.photographer_url, license: 'Pexels License', sourceUrl: p.url });
      if (opts.videos) {
        const v = await httpJson<{ videos: PexelsVideo[] }>(`https://api.pexels.com/videos/search?query=${q}&orientation=portrait&per_page=3&size=medium`, { headers });
        for (const x of v.videos) {
          const file = x.video_files
            .filter((f) => f.file_type === 'video/mp4' && f.height > f.width && f.width <= 1080)
            .sort((a, b) => b.width - a.width)[0];
          if (file)
            out.push({ type: 'video', url: file.link, poster: x.image, provider: 'pexels', author: x.user.name, authorUrl: x.user.url, license: 'Pexels License', sourceUrl: x.url });
        }
      }
    } catch (e) {
      console.warn('pexels:', (e as Error).message);
    }
  }
  if (opts.nasa) {
    try {
      const r = await httpJson<{ collection: { items: NasaItem[] } }>(`https://images-api.nasa.gov/search?q=${q}&media_type=image`);
      for (const it of r.collection.items.slice(0, 4)) {
        const d = it.data[0];
        const thumb = it.links?.find((l) => l.rel === 'preview')?.href;
        if (!thumb) continue;
        out.push({
          type: 'image',
          url: thumb.replace('~thumb', '~medium'),
          provider: 'nasa',
          author: d.photographer ?? (d.center ? `NASA ${d.center}` : 'NASA'),
          license: 'Public domain (NASA)',
          sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
        });
      }
    } catch (e) {
      console.warn('nasa:', (e as Error).message);
    }
  }
  if (out.length === 0) out.push(...(await picsumCovers(query, opts.category)));
  return out.slice(0, 6);
}

/** Hand-picked Unsplash photos (served by picsum.photos) per topic: docs/08, appendix. */
export const PICSUM_BY_CATEGORY: Record<string, number[]> = {
  psychology: [473, 661, 563, 203, 255, 768, 680, 338, 497, 978],
  science: [681, 683, 825, 537, 724, 903, 974, 1022, 967, 716, 700, 384, 1053, 523, 564, 1032, 829],
  economics: [576, 382, 1078, 692, 348, 729, 955],
  health: [488, 292, 1080, 841, 839, 1077, 425, 766],
  productivity: [832, 444, 1073, 24, 367, 357, 175, 535],
  history: [193, 1040, 819, 442],
  technology: [182, 403, 885, 486, 366, 504, 816, 373],
  society: [596, 390, 259, 331, 576, 382],
};

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Up to three picsum candidates for a topic, starting at a spot chosen by the query. */
const usedPicsum = new Set<number>();
/** picsum.photos has gone dark for hours at a time: after one failure the run stops asking it. */
let picsumDown = false;

export async function picsumCovers(query: string, category = 'science'): Promise<CoverSource[]> {
  const all = PICSUM_BY_CATEGORY[category] ?? PICSUM_BY_CATEGORY.science;
  // Prefer photos not used yet in this run, so a day's articles do not share covers.
  const fresh = all.filter((id) => !usedPicsum.has(id));
  const ids = fresh.length >= 3 ? fresh : all;
  const start = hash(query) % ids.length;
  usedPicsum.add(ids[start]);
  const out: CoverSource[] = [];
  for (let k = 0; k < Math.min(3, ids.length) && !picsumDown; k++) {
    const id = ids[(start + k) % ids.length];
    try {
      const res = await http(`https://picsum.photos/id/${id}/info`, {}, 1, 10_000);
      if (!res.ok) throw new Error(`${res.status} https://picsum.photos/id/${id}/info`);
      const info = (await res.json()) as { author: string; url: string };
      out.push({
        type: 'image',
        url: `https://picsum.photos/id/${id}/1080/1920`,
        provider: 'unsplash',
        author: info.author,
        license: 'Unsplash License',
        sourceUrl: info.url,
      });
    } catch (e) {
      picsumDown = true;
      console.warn('picsum:', (e as Error).message);
    }
  }
  return out;
}

/** Blur placeholder and average colour from a remote image (a small rendition is enough). */
export async function remotePlaceholder(cover: CoverSource): Promise<{ blurDataURL?: string; dominant?: string }> {
  const url = cover.type === 'video' ? cover.poster : cover.url;
  if (!url) return {};
  try {
    const small = url.startsWith('https://picsum.photos/')
      ? url.replace(/\/\d+\/\d+$/, '/36/64')
      : cover.provider === 'unsplash'
        ? url.replace(/w=\d+/, 'w=64').replace(/h=\d+/, 'h=114')
        : url;
    const res = await http(small);
    if (!res.ok) return {};
    return await placeholderFor(Buffer.from(await res.arrayBuffer()));
  } catch {
    return {};
  }
}

/** Unsplash API terms: trigger the download endpoint when a photo is actually used (published). */
export async function trackUnsplashDownload(downloadLocation: string) {
  if (!process.env.UNSPLASH_ACCESS_KEY) return;
  await http(downloadLocation, { headers: { authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }).catch(() => undefined);
}
