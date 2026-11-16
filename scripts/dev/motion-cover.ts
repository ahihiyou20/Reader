// Chooses the Pixabay video for an article's motion cover: the muted loop the app plays over its cover
// photo. The choice is recorded in the article (`coverClip`); finish-articles.yml downloads it, cuts a
// portrait and a landscape loop and stores them on Cloudinary once the article is on main, so no
// video file is ever committed.
//   pnpm tsx scripts/dev/motion-cover.ts --search "<words>"                  list unused Pixabay clips (needs PIXABAY_API_KEY)
//   pnpm tsx scripts/dev/motion-cover.ts <slug> <Pixabay video URL or id> [--preview] [--start <s>]
// --preview (needs PIXABAY_API_KEY and ffmpeg) cuts the clip in a temporary folder and writes
// <slug>-motion.png, three frames of each shape, to the system temp folder so it can be looked at.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { dirs, readJson, writeJson } from '../pipeline/lib';
import { clipById, cutClip, hasFfmpeg, hasPixabay, pixabayId, previewSheet, searchClips } from '../pipeline/motion';

async function main() {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Boolean(args.splice(i, 1)) : false;
  };
  const query = opt('search');
  if (query) {
    if (!hasPixabay()) throw new Error('Set PIXABAY_API_KEY to search; without it, find a clip on https://pixabay.com/videos/search/<words>/ and pass its page URL');
    const clips = await searchClips(query);
    if (!clips.length) console.log('No unused clip found: try other words.');
    for (const c of clips) console.log(`${c.id}\t${c.width}x${c.height}\t${c.seconds}s\t${c.author}\t${c.tags}\n\t${c.page}`);
    return;
  }
  const start = Number(opt('start') ?? 0);
  const preview = flag('preview');
  const [slug, clip] = args;
  const id = clip ? pixabayId(clip) : NaN;
  if (!slug || !Number.isFinite(id)) throw new Error('usage: motion-cover.ts <slug> <Pixabay video URL or id> [--preview] [--start <s>] | --search "<words>"');
  const file = path.join(dirs.articles, `${slug}.json`);
  const a = await readJson<ArticleSource>(file);
  a.coverClip = /^https?:/.test(clip) ? clip : `https://pixabay.com/videos/id-${id}/`;
  await writeJson(file, a);
  console.log(`${slug}: Pixabay video ${id} chosen; finish-articles.yml cuts it and stores it on Cloudinary once the article is on main.`);
  if (!preview) return;
  if (!hasPixabay() || !(await hasFfmpeg())) return console.log('No preview: it needs PIXABAY_API_KEY and ffmpeg.');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-'));
  try {
    await cutClip(await clipById(id), tmp, start);
    const out = path.join(os.tmpdir(), `${slug}-motion.png`);
    await previewSheet([path.join(tmp, 'portrait.mp4'), path.join(tmp, 'wide.mp4')], out);
    console.log(`preview: ${out}`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
