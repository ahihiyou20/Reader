// Gives an article a motion cover: the muted loop the app plays over its cover photo (cover.video),
// as a portrait clip for phones and a landscape one for wide screens in public/covers/video/.
//   pnpm tsx scripts/dev/motion-cover.ts <slug> [--effect fog|dust|stars|rain|snow|glow|shimmer] [--preview]
//       animate the article's own cover photo (no key needed; the default effect follows the category)
//   pnpm tsx scripts/dev/motion-cover.ts --search "<words>"
//       list stock clips from Pexels / Pixabay (needs PEXELS_API_KEY or PIXABAY_API_KEY)
//   pnpm tsx scripts/dev/motion-cover.ts <slug> --clip <video URL or file> --credit Pexels|Pixabay [--start <s>] [--preview]
//       use a stock clip instead, cropped to both shapes and cross-faded into a loop
// --preview also writes <slug>-motion.png (three frames of each clip) next to the system temp files and
// prints its path, so the result can be looked at before it is committed. Needs ffmpeg.
import os from 'node:os';
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { dirs, readJson, writeJson } from '../pipeline/lib';
import { EFFECTS, type Effect, VIDEO_DIR, hasFfmpeg, motionCover, previewSheet, searchClips } from '../pipeline/motion';

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
    const clips = await searchClips(query);
    if (!clips.length) console.log(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY ? 'No clip found.' : 'Set PEXELS_API_KEY or PIXABAY_API_KEY to search stock clips.');
    for (const c of clips) console.log(`${c.site}\t${c.width}x${c.height}\t${c.seconds}s\t${c.author}\t${c.page}\n\t${c.file}`);
    return;
  }
  const effect = opt('effect') as Effect | undefined;
  const clip = opt('clip');
  const credit = opt('credit');
  const start = Number(opt('start') ?? 0);
  const preview = flag('preview');
  const [slug] = args;
  if (!slug) throw new Error('usage: motion-cover.ts <slug> [--effect <name>] [--clip <url> --credit <site>] [--preview] | --search "<words>"');
  if (effect && !EFFECTS.includes(effect)) throw new Error(`--effect is one of ${EFFECTS.join(', ')}`);
  if (clip && !credit) throw new Error('--clip needs --credit (the site the clip comes from, e.g. Pexels)');
  if (!(await hasFfmpeg())) throw new Error('ffmpeg is not installed');
  const file = path.join(dirs.articles, `${slug}.json`);
  const a = await readJson<ArticleSource>(file);
  a.cover.video = await motionCover(a, { effect, clip, credit, start });
  await writeJson(file, a);
  console.log(`${slug}: ${a.cover.video.url}, ${a.cover.video.wide}${clip ? ` (${credit})` : ` (${effect ?? 'default'} over the cover photo)`}`);
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
