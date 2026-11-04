// Build step (after `pnpm content`): self-host the first feed covers so the first screen does not wait
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
