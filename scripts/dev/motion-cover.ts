// Gives an article a motion cover from Pixabay: the muted loop the app plays over its cover photo
// (cover.video), as a portrait clip for phones and a landscape one for wide screens in
// public/covers/video/.
//   pnpm tsx scripts/dev/motion-cover.ts --search "<words>"                 list unused Pixabay clips (needs PIXABAY_API_KEY)
//   pnpm tsx scripts/dev/motion-cover.ts <slug> <Pixabay video URL or id> [--start <s>] [--preview]
// With PIXABAY_API_KEY the clip is downloaded and cut at once; --preview also writes
// <slug>-motion.png (three frames of each clip) to the system temp folder and prints its path.
// Without the key the chosen clip is recorded in the article (`coverClip`), and finish-articles.yml
// cuts it once the article reaches main.
import os from 'node:os';
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { dirs, readJson, writeJson } from '../pipeline/lib';
import { VIDEO_DIR, clipById, hasFfmpeg, hasPixabay, motionCover, pixabayId, previewSheet, searchClips } from '../pipeline/motion';

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
  if (!slug || !Number.isFinite(id)) throw new Error('usage: motion-cover.ts <slug> <Pixabay video URL or id> [--start <s>] [--preview] | --search "<words>"');
  const file = path.join(dirs.articles, `${slug}.json`);
  const a = await readJson<ArticleSource>(file);
  if (!hasPixabay() || !(await hasFfmpeg())) {
    a.coverClip = /^https?:/.test(clip) ? clip : `https://pixabay.com/videos/id-${id}/`;
    await writeJson(file, a);
    console.log(`${slug}: Pixabay video ${id} queued (${hasPixabay() ? 'ffmpeg is not installed' : 'no PIXABAY_API_KEY'}); finish-articles.yml will add it on main.`);
    return;
  }
  a.cover.video = await motionCover(a, await clipById(id), start);
  delete a.coverClip;
  await writeJson(file, a);
  console.log(`${slug}: ${a.cover.video.url}, ${a.cover.video.wide} (Pixabay ${id})`);
  if (preview) {
    const out = path.join(os.tmpdir(), `${slug}-motion.png`);
    await previewSheet([path.join(VIDEO_DIR, `${slug}.mp4`), path.join(VIDEO_DIR, `${slug}-wide.mp4`)], out);
    console.log(`preview: ${out}`);
  }
}

main().catch((e) => {
  console.error((e as Error).message ?? e);
  process.exit(1);
});
