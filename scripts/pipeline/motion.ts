// Motion covers: the short muted loop the app plays over a cover photo (cover.video), taken from
// Pixabay's free videos (like the first three, e.g. black-hole-anatomy). Pixabay does not allow
// hotlinking, so each clip is downloaded, cropped to a portrait clip for phones and a landscape one
// for wide screens, its last half second cross-faded into its start so it loops, and stored on
// Cloudinary (cloudinary.ts) so the repository does not grow with every article; without
// CLOUDINARY_URL the clips go to public/covers/video/ instead. The API needs PIXABAY_API_KEY; ffmpeg must be on the PATH.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArticleSource, CoverVideo } from '../../lib/content/types';
import { ROOT, USER_AGENT, dirs, listJson, readJson, writeJson } from './lib';
import { hasCloudinary, onCloudinary, uploadVideo } from './cloudinary';
import { z } from 'zod';
import { geminiStructured, hasGemini } from './gemini';

const SECONDS = 6;
const FPS = 24;
/** Portrait for phones, landscape for wide screens; small enough to start at once on a phone. */
const SHAPES = { portrait: { w: 720, h: 1280 }, wide: { w: 1280, h: 720 } } as const;
type Shape = keyof typeof SHAPES;

export const VIDEO_DIR = path.join(ROOT, 'public', 'covers', 'video');

export const hasFfmpeg = () => new Promise<boolean>((resolve) => execFile('ffmpeg', ['-version'], (err) => resolve(!err)));
export const hasPixabay = () => Boolean(process.env.PIXABAY_API_KEY);

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 300_000 }, (err, _out, stderr) =>
      err ? reject(new Error(`ffmpeg: ${(stderr || err.message).slice(0, 400)}`)) : resolve(),
    ),
  );
}

/** About 0.3–0.6 MB a clip: every article adds two to the repository. */
const ENCODE = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '29', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];

/** A clip (at least 6.5 s from `start`) cut to `shape`, its last half second cross-faded into its start so it loops. */
export async function fromClip(input: string, shape: Shape, out: string, start = 0) {
  const { w, h } = SHAPES[shape];
  const X = 0.5;
  const len = SECONDS + X;
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${FPS},setsar=1`;
  const graph = [
    `[0:v]trim=0:${len},setpts=PTS-STARTPTS,${fit},split[a][b]`,
    `[a]trim=${X}:${len},setpts=PTS-STARTPTS[main]`,
    `[b]trim=0:${X},setpts=PTS-STARTPTS[head]`,
    `[main][head]xfade=transition=fade:duration=${X}:offset=${SECONDS - X},format=yuv420p[out]`,
  ].join(';');
  await fs.mkdir(path.dirname(out), { recursive: true });
  await ffmpeg(['-ss', String(start), '-i', input, '-filter_complex', graph, '-map', '[out]', '-t', String(SECONDS), ...ENCODE, out]);
}

export interface PixabayClip {
  id: number;
  /** The clip's page on Pixabay. */
  page: string;
  /** Video file to download: the smallest rendition at least 720 px on its short side. */
  file: string;
  width: number;
  height: number;
  seconds: number;
  author: string;
  tags: string;
}

interface PixabayHit {
  id: number;
  pageURL: string;
  duration: number;
  user: string;
  tags: string;
  videos: Record<string, { url: string; width: number; height: number }>;
}

function toClip(v: PixabayHit): PixabayClip | undefined {
  const f = ['medium', 'large', 'small'].map((k) => v.videos[k]).find((x) => x?.url && Math.min(x.width, x.height) >= 720);
  return f && v.duration > SECONDS ? { id: v.id, page: v.pageURL, file: f.url, width: f.width, height: f.height, seconds: v.duration, author: v.user, tags: v.tags } : undefined;
}

async function pixabay(params: Record<string, string>): Promise<PixabayHit[]> {
  if (!hasPixabay()) throw new Error('PIXABAY_API_KEY is not set');
  const q = new URLSearchParams({ key: process.env.PIXABAY_API_KEY!, safesearch: 'true', ...params });
  const res = await fetch(`https://pixabay.com/api/videos/?${q}`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Pixabay HTTP ${res.status}`);
  return ((await res.json()) as { hits: PixabayHit[] }).hits;
}

/** Pixabay ids already on a cover, so every article gets its own clip. */
let used: Set<number> | undefined;
async function clipsInUse(): Promise<Set<number>> {
  if (used) return used;
  used = new Set();
  for (const f of await listJson(dirs.articles)) {
    const a = await readJson<ArticleSource>(path.join(dirs.articles, f));
    for (const s of [a.cover.video?.source, a.coverClip]) if (s && /pixabay\.com/.test(s)) used.add(pixabayId(s));
  }
  return used;
}

/** Pixabay clips for a search, most relevant first, leaving out clips another article already uses. */
export async function searchClips(query: string, n = 12): Promise<PixabayClip[]> {
  const taken = await clipsInUse();
  return (await pixabay({ q: query.slice(0, 100), per_page: String(Math.max(n, 3)) }))
    .map(toClip)
    .filter((c): c is PixabayClip => c !== undefined && !taken.has(c.id));
}

/** The id at the end of a Pixabay page URL (…/videos/clock-time-12345/) or a bare id. */
export const pixabayId = (s: string) => Number(s.match(/(\d+)\/?(?:[?#].*)?$/)?.[1] ?? NaN);

export async function clipById(id: number): Promise<PixabayClip> {
  const hit = (await pixabay({ id: String(id) }))[0];
  const clip = hit && toClip(hit);
  if (!clip) throw new Error(`Pixabay video ${id} not found, shorter than ${SECONDS + 1} s or smaller than 720 px`);
  return clip;
}

/** Download a Pixabay clip and cut both shapes into `dir` as portrait.mp4 and wide.mp4. */
export async function cutClip(clip: PixabayClip, dir: string, start = 0) {
  const input = path.join(dir, 'in.mp4');
  const res = await fetch(clip.file, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading Pixabay video ${clip.id}`);
  await fs.writeFile(input, Buffer.from(await res.arrayBuffer()));
  const from = Math.max(0, Math.min(start, clip.seconds - SECONDS - 0.6));
  await fromClip(input, 'portrait', path.join(dir, 'portrait.mp4'), from);
  await fromClip(input, 'wide', path.join(dir, 'wide.mp4'), from);
}

/** Store a cut clip: on Cloudinary under a name naming the clip, or in public/covers/video/ without it. */
async function store(file: string, name: string): Promise<string> {
  if (hasCloudinary()) return uploadVideo(await fs.readFile(file), `pagemoor/covers/${name.replace(/\.mp4$/, '')}`);
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  await fs.copyFile(file, path.join(VIDEO_DIR, name));
  return `/covers/video/${name}`;
}

/** Download a Pixabay clip, make both shapes for the article, store them and return its `cover.video` entry. */
export async function motionCover(a: ArticleSource, clip: PixabayClip, start = 0): Promise<CoverVideo> {
  // Taken now, so the next article in this run does not get the same clip.
  (await clipsInUse()).add(clip.id);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-'));
  try {
    await cutClip(clip, tmp, start);
    // The clip id in the name keeps a re-cut from reusing a URL readers may have cached.
    const base = hasCloudinary() ? `${a.slug}-${clip.id}` : a.slug;
    const url = await store(path.join(tmp, 'portrait.mp4'), `${base}.mp4`);
    const wide = await store(path.join(tmp, 'wide.mp4'), `${base}-wide.mp4`);
    (await clipsInUse()).add(clip.id);
    return { url, wide, credit: 'Pixabay', source: clip.page };
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Move motion-cover clips still kept in public/covers/video/ to Cloudinary and point their articles at it.
 * Returns the slugs it changed; the local files are deleted once the article file is written.
 */
export async function moveClipsOffRepo(): Promise<string[]> {
  if (!hasCloudinary()) return [];
  const moved: string[] = [];
  for (const f of await listJson(dirs.articles)) {
    const file = path.join(dirs.articles, f);
    const a = await readJson<ArticleSource>(file);
    const v = a.cover.video;
    if (!v || [v.url, v.wide].every((u) => !u?.startsWith('/covers/video/'))) continue;
    const local: string[] = [];
    const up = async (u: string | undefined) => {
      if (!u?.startsWith('/covers/video/') || onCloudinary(u)) return u;
      const src = path.join(ROOT, 'public', u);
      local.push(src);
      return uploadVideo(await fs.readFile(src), `pagemoor/covers/${path.basename(u, '.mp4')}`);
    };
    a.cover.video = { ...v, url: (await up(v.url))!, ...(v.wide ? { wide: await up(v.wide) } : {}) };
    await writeJson(file, a);
    await Promise.all(local.map((p) => fs.rm(p, { force: true })));
    moved.push(a.slug);
  }
  return moved;
}

/**
 * A motion cover without a person choosing: the clip queued in `coverClip`, else the first unused
 * search hit for each query in turn. Returns undefined when nothing fits.
 */
const searchSchema = z.object({ queries: z.array(z.string().min(2).max(60)).min(1).max(4) });
const shortlistSchema = z.object({ ids: z.array(z.number().int()).max(3) });
const pickSchema = z.object({ id: z.number().int(), why: z.string().max(200) });

/** One frame from the middle of a clip, small, for Gemini to look at. Undefined when ffmpeg cannot read it. */
async function frameOf(clip: PixabayClip): Promise<Buffer | undefined> {
  const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'frame-')), 'f.jpg');
  try {
    await ffmpeg(['-ss', String(Math.min(3, clip.seconds / 2)), '-i', clip.file, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '5', out]);
    return await fs.readFile(out);
  } catch {
    return undefined;
  } finally {
    await fs.rm(path.dirname(out), { recursive: true, force: true });
  }
}

/**
 * Gemini as the picture editor: it names footage that fits the article, shortlists up to three clips
 * from what Pixabay returns by their tags, then looks at a frame of each and keeps one, or none (id 0)
 * when nothing fits. A wrong clip is worse than a photo. Without frames (no ffmpeg, or the agy CLI,
 * which takes no pictures) the shortlist's first clip is the pick.
 */
export async function geminiClip(a: ArticleSource, hints: string[]): Promise<PixabayClip | undefined> {
  const about = `Title: ${a.title.en}\nHook: ${a.hook.en}\nTags: ${(a.tags ?? []).join(', ')}`;
  const { value: s } = await geminiStructured({
    schema: searchSchema,
    prompt: `You choose a looping background video for a reading app's article cover.\n${about}\n\nGive up to 4 short Pixabay video search phrases (2 to 4 English words each) for real footage of what the article is about: the place, object or phenomenon itself, filmed, not an abstract concept. Most specific first.${hints.length ? ` An editor suggested: ${hints.join('; ')}.` : ''}`,
  });
  const seen = new Set<number>();
  const pool: PixabayClip[] = [];
  for (const q of [...(s.queries ?? []), ...hints].slice(0, 5))
    for (const c of await searchClips(q, 5))
      if (!seen.has(c.id) && pool.length < 16) {
        seen.add(c.id);
        pool.push(c);
      }
  if (!pool.length) return undefined;
  const { value: l } = await geminiStructured({
    schema: shortlistSchema,
    temperature: 0.1,
    prompt: `${about}\n\nCandidate Pixabay clips (id: tags):\n${pool.map((c) => `${c.id}: ${c.tags}`).join('\n')}\n\nList up to 3 clip ids, best first, whose tags show what this article is about, so a reader would see the link at a glance. Leave out clips of people's faces, text, logos or cartoons and clips that only fit loosely. An empty list when none fits.`,
  });
  const short = (l.ids ?? []).map((id) => pool.find((c) => c.id === id)).filter((c): c is PixabayClip => c !== undefined);
  if (!short.length) return undefined;
  const frames = process.env.GEMINI_VIA === 'agy' || !(await hasFfmpeg()) ? [] : await Promise.all(short.map(frameOf));
  const seenClips = short.filter((_, i) => frames[i]);
  if (!seenClips.length) return short[0];
  const { value: p } = await geminiStructured({
    schema: pickSchema,
    temperature: 0.1,
    images: frames.filter((f): f is Buffer => f !== undefined),
    prompt: `${about}\n\nThe pictures are one frame from each candidate clip, in this order: ${seenClips.map((c) => c.id).join(', ')}.\nPick the clip a reader would connect with this article at a glance, that looks good full screen behind white text, with no faces, text, logos or cartoon look. If none of them does, answer id 0.`,
  });
  return seenClips.find((c) => c.id === p.id);
}

export async function autoMotion(a: ArticleSource, queries: string[]): Promise<CoverVideo | undefined> {
  if (a.coverClip) return motionCover(a, await clipById(pixabayId(a.coverClip)));
  if (hasGemini()) {
    const clip = await geminiClip(a, queries.filter(Boolean).slice(0, 1));
    return clip && motionCover(a, clip);
  }
  for (const q of queries.filter(Boolean)) {
    const [clip] = await searchClips(q, 6);
    if (clip) return motionCover(a, clip);
  }
  return undefined;
}

/** Frames at the start, a third and two thirds of each clip side by side, to judge a loop without playing it. */
export async function previewSheet(clips: string[], out: string) {
  const inputs = clips.flatMap((c) => ['-i', c]);
  const rows = clips.map((_, i) => `[${i}:v]select='eq(n\\,0)+eq(n\\,${FPS * 2})+eq(n\\,${FPS * 4})',scale=-2:480,tile=3x1[r${i}]`);
  const join = clips.length > 1 ? `;${clips.map((_, i) => `[r${i}]`).join('')}hstack=${clips.length}[out]` : ';[r0]copy[out]';
  await ffmpeg([...inputs, '-filter_complex', rows.join(';') + join, '-map', '[out]', '-frames:v', '1', out]);
}
