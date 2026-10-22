// Blur placeholder and dominant colour for covers stored in public/ (docs/05 step 4).
// Remote covers keep whatever the pipeline wrote into the article file.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { CoverSource } from '../../lib/content/types';

const CACHE_FILE = path.join(process.cwd(), 'content', 'generated', 'media.json');
let cache: Record<string, { key: string; blurDataURL: string; dominant: string }> | null = null;

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache!;
}

export async function saveMediaCache() {
  if (!cache) return;
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 1) + '\n');
}

export async function placeholderFor(input: Buffer | string): Promise<{ blurDataURL: string; dominant: string }> {
  const img = sharp(input).rotate();
  // Average colour, darkened a little: it shows behind the image while it loads, under white text.
  const { channels } = await img.clone().stats();
  const mean = channels.slice(0, 3).map((c) => Math.round(c.mean * 0.7));
  const tiny = await img.clone().resize(16, 28, { fit: 'cover' }).webp({ quality: 40 }).toBuffer();
  const hex = '#' + mean.map((v) => v.toString(16).padStart(2, '0')).join('');
  return { blurDataURL: `data:image/webp;base64,${tiny.toString('base64')}`, dominant: hex };
}

export async function mediaInfo(
  cover: CoverSource,
  known: { blurDataURL?: string; dominant?: string },
): Promise<{ blurDataURL?: string; dominant?: string }> {
  if (known.blurDataURL && known.dominant) return known;
  const local = cover.type === 'video' ? cover.poster : cover.url;
  if (!local || !local.startsWith('/')) return known;
  const file = path.join(process.cwd(), 'public', local);
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return known;
  }
  const key = `${stat.size}-${Math.round(stat.mtimeMs)}`;
  const c = await loadCache();
  if (c[local]?.key !== key) {
    c[local] = { key, ...(await placeholderFor(file)) };
    await saveMediaCache();
  }
  return { blurDataURL: known.blurDataURL ?? c[local].blurDataURL, dominant: known.dominant ?? c[local].dominant };
}
