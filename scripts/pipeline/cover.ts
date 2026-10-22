// Cover candidates (docs/05 step 4): Unsplash and Pexels when API keys are set, NASA's image library
// (public domain, no key) for science topics. The first candidate becomes the cover.
import type { CoverSource } from '../../lib/content/types';
import { placeholderFor } from '../lib/media';
import { http, httpJson } from './lib';

const UTM = 'utm_source=reader&utm_medium=referral';

interface UnsplashPhoto {
  urls: { raw: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
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

export async function findCovers(query: string, opts: { videos?: boolean; nasa?: boolean } = {}): Promise<CoverSource[]> {
  const out: CoverSource[] = [];
  const q = encodeURIComponent(query);
  if (process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const r = await httpJson<{ results: UnsplashPhoto[] }>(`https://api.unsplash.com/search/photos?query=${q}&orientation=portrait&per_page=6&content_filter=high`, {
        headers: { authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`, 'accept-version': 'v1' },
      });
      for (const p of r.results)
        out.push({
          type: 'image',
          // Unsplash requires hotlinking the photo URL it returns (with size parameters).
          url: `${p.urls.raw}&w=1080&h=1920&fit=crop&crop=entropy&q=72&fm=webp`,
          provider: 'unsplash',
          author: p.user.name,
          authorUrl: `${p.user.links.html}?${UTM}`,
          license: 'Unsplash License',
          sourceUrl: `${p.links.html}?${UTM}`,
          unsplashDownloadLocation: p.links.download_location,
        });
    } catch (e) {
      console.warn('unsplash:', (e as Error).message);
    }
  }
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
  if (opts.nasa || out.length === 0) {
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
  return out.slice(0, 6);
}

/** Blur placeholder and average colour from a remote image (a small rendition is enough). */
export async function remotePlaceholder(cover: CoverSource): Promise<{ blurDataURL?: string; dominant?: string }> {
  const url = cover.type === 'video' ? cover.poster : cover.url;
  if (!url) return {};
  try {
    const small = cover.provider === 'unsplash' ? url.replace(/w=\d+/, 'w=64').replace(/h=\d+/, 'h=114') : url;
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
