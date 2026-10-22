// Downloads an Unsplash photo through picsum.photos (no API key needed), crops it to a 9:16 cover,
// stores it in public/covers/<slug>.webp and writes the credit into the article file.
// Usage: pnpm tsx scripts/dev/picsum-cover.ts <slug> <picsum-id>
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { placeholderFor } from '../lib/media';

async function main() {
  const [slug, id, position = 'centre'] = process.argv.slice(2);
  if (!slug || !id) throw new Error('usage: picsum-cover.ts <slug> <picsum-id>');
  const info = (await (await fetch(`https://picsum.photos/id/${id}/info`)).json()) as { author: string; url: string; width: number; height: number };
  const res = await fetch(`https://picsum.photos/id/${id}/${Math.min(info.width, 2400)}/${Math.round((Math.min(info.width, 2400) * info.height) / info.width)}`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = path.join('public', 'covers', `${slug}.webp`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await sharp(buf).rotate().resize(1080, 1920, { fit: 'cover', position: position === 'attention' ? sharp.strategy.attention : position }).webp({ quality: 74 }).toFile(out);
  const ph = await placeholderFor(out);
  const file = path.join('content', 'articles', `${slug}.json`);
  const a = JSON.parse(await fs.readFile(file, 'utf8'));
  a.cover = {
    type: 'image',
    url: `/covers/${slug}.webp`,
    provider: 'unsplash',
    author: info.author,
    authorUrl: undefined,
    license: 'Unsplash License',
    sourceUrl: info.url,
  };
  a.blurDataURL = ph.blurDataURL;
  a.dominant = ph.dominant;
  await fs.writeFile(file, JSON.stringify(a, null, 2) + '\n');
  const { size } = await fs.stat(out);
  console.log(`${slug}: ${info.author} (${info.url}) → ${out} ${(size / 1024).toFixed(0)} KB, ${ph.dominant}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
