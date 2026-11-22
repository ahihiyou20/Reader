// Build step (after `pnpm content`): self-host the first feed covers (Unsplash and Cloudinary ones get CDN sizes instead) so the first screen does not wait
// on a third-party redirect. Writes WebP variants to public/covers/opt and public/data/covers.json.
// A failed download leaves that item on its remote URL; this step never fails the build.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const COUNT = 8;
const WIDTHS = [480, 768, 1080];
const DATA = path.join('public', 'data');
const OUT = path.join('public', 'covers', 'opt');

const feed = JSON.parse(fs.readFileSync(path.join(DATA, 'feed.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const covers = {};
for (const item of feed.items.slice(0, COUNT)) {
  const remote = item.cover.type === 'video' ? item.cover.poster : item.cover.url;
  if (!remote || !/^https?:/.test(remote)) continue;
  // Unsplash covers stay on Unsplash's CDN (their API guidelines ask for hotlinking); it resizes on request.
  if (new URL(remote, 'https://x').hostname === 'images.unsplash.com') {
    const at = (w) => {
      const u = new URL(remote);
      u.searchParams.set('w', String(w));
      u.searchParams.set('h', String(Math.round((w * 16) / 9)));
      // As lib/covers.ts lighterCover: the 1080 px file at quality 60 is a quarter lighter.
      if (w >= 1080) u.searchParams.set('q', '60');
      return u.toString();
    };
    covers[item.slug] = { src: at(768), srcSet: WIDTHS.map((w) => `${at(w)} ${w}w`).join(', '), width: 768, height: 1365 };
    continue;
  }
  // Cloudinary covers (moved there by the pipeline) are resized by Cloudinary's CDN the same way.
  const cloudinary = remote.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
  if (cloudinary) {
    const at = (w) => `${cloudinary[1]}c_fill,g_auto,w_${w},h_${Math.round((w * 16) / 9)},f_auto,q_auto/${cloudinary[2]}`;
    covers[item.slug] = { src: at(768), srcSet: WIDTHS.map((w) => `${at(w)} ${w}w`).join(', '), width: 768, height: 1365 };
    continue;
  }
  const file = (w) => path.join(OUT, `${item.slug}-${w}.webp`);
  try {
    if (!WIDTHS.every((w) => fs.existsSync(file(w)))) {
      const res = await fetch(remote, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const image = Buffer.from(await res.arrayBuffer());
      for (const w of WIDTHS) await sharp(image).resize({ width: w, withoutEnlargement: true }).webp({ quality: 72 }).toFile(file(w));
    }
    const { width, height } = await sharp(file(768)).metadata();
    covers[item.slug] = {
      src: `/covers/opt/${item.slug}-768.webp`,
      srcSet: WIDTHS.map((w) => `/covers/opt/${item.slug}-${w}.webp ${w}w`).join(', '),
      width,
      height,
    };
  } catch (e) {
    console.warn(`covers: ${item.slug} stays remote (${e.message})`);
  }
}
fs.writeFileSync(path.join(DATA, 'covers.json'), JSON.stringify(covers));
console.log(`covers: ${Object.keys(covers).length} of ${Math.min(COUNT, feed.items.length)} self-hosted`);
