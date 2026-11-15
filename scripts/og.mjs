// Build step: a 1200×630 JPEG link-preview image for every published article whose cover is kept in
// the repo (lib/share-image.ts points other covers at their CDN). Written to public/og/, not committed.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ARTICLES = path.join('content', 'articles');
const OUT = path.join('public', 'og');
fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (const f of fs.readdirSync(ARTICLES)) {
  const a = JSON.parse(fs.readFileSync(path.join(ARTICLES, f), 'utf8'));
  if (a.status !== 'published') continue;
  const src = a.cover.wide ?? (a.cover.type === 'video' ? a.cover.poster : a.cover.url);
  if (!src?.startsWith('/')) continue;
  const out = path.join(OUT, `${a.slug}.jpg`);
  if (fs.existsSync(out)) continue;
  try {
    await sharp(path.join('public', src)).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
    made++;
  } catch (e) {
    console.warn(`og: ${a.slug} (${e.message})`);
  }
}
console.log(`og: ${made} share images written`);
