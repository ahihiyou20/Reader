// Motion covers: the short muted loop the app plays over a cover photo (CoverMedia, `cover.video`).
// Two ways to make one, both self-hosted in public/covers/video as a portrait clip for phones and a
// landscape one for wide screens:
//   fromClip()  — a stock clip (Pexels, Pixabay), cropped to each shape and cross-faded into a loop;
//   generate()  — made from the article's own cover photo: a slow breathing zoom plus a moving layer
//                 (fog, dust, stars, rain, snow, glow, shimmer). Every movement repeats exactly once per
//                 loop, so the clip loops without a seam, and its first frame is the photo itself, so the
//                 fade-in over the still is invisible.
// Needs ffmpeg on the PATH.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { ArticleSource, CoverVideo } from '../../lib/content/types';
import { ROOT, USER_AGENT } from './lib';

export const EFFECTS = ['fog', 'dust', 'stars', 'rain', 'snow', 'glow', 'shimmer'] as const;
export type Effect = (typeof EFFECTS)[number];

/** A sensible effect when nobody chose one. */
export const EFFECT_FOR_CATEGORY: Record<string, Effect> = {
  science: 'dust',
  technology: 'glow',
  health: 'glow',
  psychology: 'fog',
  productivity: 'dust',
  economics: 'shimmer',
  history: 'fog',
  society: 'dust',
};

const SECONDS = 6;
const FPS = 24;
/** Portrait for phones, landscape for wide screens; small enough to start at once on a phone. */
const SHAPES = { portrait: { w: 720, h: 1280 }, wide: { w: 1280, h: 720 } } as const;
type Shape = keyof typeof SHAPES;

export const VIDEO_DIR = path.join(ROOT, 'public', 'covers', 'video');

export const hasFfmpeg = () =>
  new Promise<boolean>((resolve) => execFile('ffmpeg', ['-version'], (err) => resolve(!err)));

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) =>
    execFile('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 16 * 1024 * 1024, timeout: 300_000 }, (err, _out, stderr) =>
      err ? reject(new Error(`ffmpeg: ${(stderr || err.message).slice(0, 400)}`)) : resolve(),
    ),
  );
}

/** About 0.3–0.5 MB a clip: every article adds two to the repository. */
const encode = (crf = 29) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];

/** Deterministic random numbers, so the same article and effect always give the same clip. */
function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const svg = (w: number, h: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

/**
 * A tile of `tw`×`th` repeated over `cw`×`ch`. Scrolling the result by whole tiles brings back the
 * same picture, which is what makes the loop close.
 */
async function tiled(tw: number, th: number, cw: number, ch: number, body: string): Promise<Buffer> {
  const tile = await sharp(svg(tw, th, body)).png().toBuffer();
  const composite = [];
  for (let y = 0; y < ch; y += th) for (let x = 0; x < cw; x += tw) composite.push({ input: tile, left: x, top: y });
  return sharp({ create: { width: cw, height: ch, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composite)
    .png()
    .toBuffer();
}

/** Soft dots that wrap around the tile edges, so neighbouring tiles join without a seam. */
function dots(rand: () => number, w: number, h: number, n: number, size: [number, number], alpha: [number, number], color: string, blur: number): string {
  let out = `<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs><g filter="url(#b)">`;
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = size[0] + rand() ** 2 * (size[1] - size[0]);
    const a = alpha[0] + rand() * (alpha[1] - alpha[0]);
    for (const [ox, oy] of WRAP(w, h)) out += `<circle cx="${(x + ox).toFixed(1)}" cy="${(y + oy).toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" fill-opacity="${a.toFixed(2)}"/>`;
  }
  return `${out}</g>`;
}
const WRAP = (w: number, h: number) => [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h], [-w, -h], [w, h], [-w, h], [w, -h]];

/** Tileable fractal noise as near-white, with the noise in the alpha channel. */
const noise = (seed: number, fx: number, fy: number, gain: number, offset: number) =>
  `<filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${fx.toFixed(5)} ${fy.toFixed(5)}" numOctaves="4" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0.92  0 0 0 0 0.93  0 0 0 0 0.95  ${gain} 0 0 0 ${offset}"/></filter><rect width="100%" height="100%" filter="url(#f)"/>`;

interface Layer {
  png: Buffer;
  /** Position of the layer's top-left corner over time (ffmpeg expressions in t); each repeats every SECONDS. */
  x: string;
  y: string;
  /** ffmpeg filter applied to the layer before it is laid over the photo. */
  filter?: string;
}

/** Scroll by `k` whole tiles of size `tile` per loop (negative: left or up); the layer starts one tile out. */
const scroll = (k: number, tile: number) => (k === 0 ? '0' : k < 0 ? `-mod(t*${-k * tile}/${SECONDS},${tile})` : `mod(t*${k * tile}/${SECONDS},${tile})-${tile}`);
/** Sway around `centre` by `amp` pixels, once per loop. */
const sway = (centre: number, amp: number, phase = 0) => `${centre}+${amp}*sin(2*PI*t/${SECONDS}+${phase})`;

async function layersFor(effect: Effect, w: number, h: number, seed: string): Promise<{ layers: Layer[]; base?: string; displace?: { png: Buffer; amp: number } }> {
  const rand = rng(`${seed}:${effect}`);
  const s = Math.floor(rand() * 1000);
  const T = SECONDS;
  const u = Math.min(w, h);
  switch (effect) {
    case 'fog': {
      // Two banks of fog on one canvas wider than the frame, swaying against each other: swaying needs
      // no tiling, so the noise has no seams.
      const cw = Math.round(w * 1.4);
      const bank = async (seedN: number, scale: number, gain: number, offset: number) =>
        sharp(await sharp(svg(cw, h, noise(seedN, scale / w, (scale * 1.6) / h, gain, offset))).png().toBuffer())
          .blur(3)
          .png()
          .toBuffer();
      const mid = -(cw - w) / 2;
      return {
        layers: [
          { png: await bank(s, 2.5, 1.2, -0.5), x: sway(mid, u * 0.08), y: '0' },
          { png: await bank(s + 7, 5, 1.0, -0.55), x: sway(mid, u * 0.11, Math.PI), y: '0' },
        ],
      };
    }
    case 'dust': {
      // Specks rising slowly: a small tile scrolled one tile per loop, two depths at two speeds.
      const near = Math.round(h / 4);
      const far = Math.round(h / 6);
      return {
        layers: [
          { png: await tiled(w, far, w, h + far, dots(rand, w, far, 24, [1.1, 2.8], [0.35, 0.9], '#fff3dc', 0.7)), x: '0', y: scroll(-1, far) },
          { png: await tiled(w, near, w, h + near, dots(rand, w, near, 6, [6, 14], [0.1, 0.26], '#ffe9c7', 3.5)), x: sway(0, u * 0.02), y: scroll(-1, near) },
        ],
      };
    }
    case 'snow': {
      const a = Math.round(h / 3);
      const b = Math.round(h / 2);
      return {
        layers: [
          { png: await tiled(w, a, w + u * 0.1, h + a, dots(rand, w, a, 45, [1.2, 2.6], [0.5, 0.9], '#ffffff', 0.5)), x: sway(-u * 0.05, u * 0.04), y: scroll(1, a) },
          { png: await tiled(w, b, w + u * 0.1, h + b, dots(rand, w, b, 14, [3.5, 6], [0.4, 0.75], '#ffffff', 1.8)), x: sway(-u * 0.05, u * 0.05, 1.3), y: scroll(2, b) },
        ],
        base: 'eq=brightness=-0.03:saturation=0.85',
      };
    }
    case 'stars': {
      // Each star fades in and out on its own phase, so the field twinkles rather than blinks.
      const twinkle = `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(0.5+0.5*sin(2*PI*T/${T}+mod(X*7+Y*13\,628)/100))'`;
      return {
        layers: [
          { png: await tiled(w, h, w * 2, h, dots(rand, w, h, 170, [0.6, 1.5], [0.55, 1], '#ffffff', 0.3)), x: sway(-w / 2, u * 0.015), y: '0', filter: twinkle },
          { png: await tiled(w, h, w * 2, h, dots(rand, w, h, 14, [2, 4], [0.3, 0.6], '#dfe8ff', 2.5)), x: sway(-w / 2, u * 0.03, 2), y: '0', filter: twinkle },
        ],
      };
    }
    case 'rain': {
      const th = Math.round(h / 2);
      let streaks = '';
      for (let i = 0; i < 70; i++) {
        const x = rand() * w;
        const y = rand() * th;
        const len = 18 + rand() * 40;
        const a = (0.12 + rand() * 0.28).toFixed(2);
        for (const [ox, oy] of WRAP(w, th))
          streaks += `<line x1="${(x + ox).toFixed(1)}" y1="${(y + oy).toFixed(1)}" x2="${(x + ox - len * 0.12).toFixed(1)}" y2="${(y + oy + len).toFixed(1)}" stroke="#dfe7f2" stroke-opacity="${a}" stroke-width="1.3" stroke-linecap="round"/>`;
      }
      return { layers: [{ png: await tiled(w, th, w, h + th, streaks), x: '0', y: scroll(8, th) }], base: 'eq=brightness=-0.06:saturation=0.8' };
    }
    case 'glow': {
      // Two soft lights, warm and cool, circling slowly over the photo.
      const g = (id: string, color: string, a: number) =>
        `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${a}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
      const r = Math.max(w, h) * 0.45;
      const body = `<defs>${g('a', '#ffcf8a', 0.42)}${g('b', '#9fd4ff', 0.24)}</defs><circle cx="${w * 0.75}" cy="${h * 0.65}" r="${r}" fill="url(#a)"/><circle cx="${w * 1.35}" cy="${h * 1.4}" r="${r * 0.8}" fill="url(#b)"/>`;
      const png = await sharp(svg(w * 2, h * 2, body)).png().toBuffer();
      return { layers: [{ png, x: sway(-w / 2, u * 0.12), y: `${-h / 2}+${u * 0.1}*cos(2*PI*t/${T})` }] };
    }
    case 'shimmer': {
      // A grey noise map bends the photo a few pixels, as water or hot air does.
      const map = `<filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${(8 / w).toFixed(5)} ${(28 / h).toFixed(5)}" numOctaves="2" seed="${s}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"/></filter><rect width="100%" height="100%" fill="#808080"/><rect width="100%" height="100%" filter="url(#f)" opacity="0.07"/>`;
      return { layers: [], displace: { png: await tiled(w, h, w * 2, h, map), amp: w } };
    }
  }
}

/** The loop from a cover photo (any size; it is cropped to the shape like the still). */
export async function generate(image: Buffer, shape: Shape, effect: Effect, out: string, seed: string) {
  const { w, h } = SHAPES[shape];
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'motion-'));
  const input = async (name: string, png: Buffer) => {
    const f = path.join(tmp, name);
    await fs.writeFile(f, png);
    return ['-loop', '1', '-framerate', String(FPS), '-t', String(SECONDS), '-i', f];
  };
  try {
    // A little larger than the frame, so the breathing zoom never shows an edge.
    const still = await sharp(image).rotate().resize(Math.round(w * 1.06), Math.round(h * 1.06), { fit: 'cover', position: 'attention' }).png().toBuffer();
    const { layers, base, displace } = await layersFor(effect, w, h, seed);
    const args = await input('still.png', still);
    for (const [i, l] of layers.entries()) args.push(...(await input(`l${i}.png`, l.png)));
    // Zoom from the still's framing to 4.5 % closer and back, once per loop.
    const z = `(1+0.045*(1-cos(2*PI*t/${SECONDS}))/2)`;
    const chain = [`[0:v]scale=w='trunc(${w}*${z}/2)*2':h=-2:eval=frame,crop=${w}:${h}:(iw-${w})/2:(ih-${h})/2,setsar=1${base ? `,${base}` : ''}[v0]`];
    let last = 'v0';
    if (displace) {
      args.push(...(await input('map.png', displace.png)));
      const m = layers.length + 1;
      // In planar RGB every channel moves by the same map, so colours stay aligned.
      chain.push(
        `[${m}:v]format=gbrp,split[mx][my]`,
        `[mx]crop=${w}:${h}:'${displace.amp / 2}+${displace.amp / 2}*sin(2*PI*t/${SECONDS})':0[xm]`,
        `[my]crop=${w}:${h}:'${displace.amp / 2}-${displace.amp / 2}*sin(2*PI*t/${SECONDS})':0[ym]`,
        `[${last}]format=gbrp[vb]`,
        `[vb][xm][ym]displace=edge=smear[vd]`,
      );
      last = 'vd';
    }
    layers.forEach((l, i) => {
      chain.push(`[${i + 1}:v]format=rgba${l.filter ? `,${l.filter}` : ''}[t${i}]`, `[${last}][t${i}]overlay=x='${l.x}':y='${l.y}':eval=frame[o${i}]`);
      last = `o${i}`;
    });
    chain.push(`[${last}]format=yuv420p[out]`);
    await fs.mkdir(path.dirname(out), { recursive: true });
    await ffmpeg([...args, '-filter_complex', chain.join(';'), '-map', '[out]', '-t', String(SECONDS), '-r', String(FPS), ...encode(effect === 'shimmer' ? 32 : 29), out]);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

/** A stock clip (at least 6.5 s from `start`) cut to `shape`, its last half second cross-faded into its start so it loops. */
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
  await ffmpeg(['-ss', String(start), '-i', input, '-filter_complex', graph, '-map', '[out]', '-t', String(SECONDS), ...encode(), out]);
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The cover photo in a given shape: the landscape file when there is one, so the wide clip stays sharp. */
async function coverImage(a: ArticleSource, shape: Shape): Promise<Buffer> {
  const src = shape === 'wide' && a.cover.wide ? a.cover.wide : a.cover.type === 'video' ? a.cover.poster : a.cover.url;
  if (!src) throw new Error(`${a.slug}: no cover image to animate`);
  return src.startsWith('/') ? fs.readFile(path.join(ROOT, 'public', src)) : download(src);
}

/**
 * Make and store both clips for an article and return the `cover.video` entry. With `clip` (a URL or
 * a file) the stock clip is used and `credit` names its site; otherwise the photo is animated.
 */
export async function motionCover(a: ArticleSource, opts: { effect?: Effect; clip?: string; start?: number; credit?: string } = {}): Promise<CoverVideo> {
  const files = { portrait: path.join(VIDEO_DIR, `${a.slug}.mp4`), wide: path.join(VIDEO_DIR, `${a.slug}-wide.mp4`) };
  if (opts.clip) {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-'));
    try {
      const input = /^https?:/.test(opts.clip) ? path.join(tmp, 'in.mp4') : opts.clip;
      if (input !== opts.clip) await fs.writeFile(input, await download(opts.clip));
      for (const shape of ['portrait', 'wide'] as const) await fromClip(input, shape, files[shape], opts.start ?? 0);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  } else {
    const effect = opts.effect ?? EFFECT_FOR_CATEGORY[a.category] ?? 'dust';
    for (const shape of ['portrait', 'wide'] as const) await generate(await coverImage(a, shape), shape, effect, files[shape], a.slug);
  }
  return {
    url: `/covers/video/${a.slug}.mp4`,
    wide: `/covers/video/${a.slug}-wide.mp4`,
    ...(opts.clip && opts.credit ? { credit: opts.credit } : {}),
  };
}

export interface StockClip {
  site: 'Pexels' | 'Pixabay';
  /** Page of the clip on its site. */
  page: string;
  /** Video file to download (the smallest one at least 720 px on its short side). */
  file: string;
  width: number;
  height: number;
  seconds: number;
  author: string;
}

/** Stock clips for a search, from Pexels (PEXELS_API_KEY) and Pixabay (PIXABAY_API_KEY), both free to use. */
export async function searchClips(query: string): Promise<StockClip[]> {
  const out: StockClip[] = [];
  const short = (w: number, h: number) => Math.min(w, h) >= 720;
  if (process.env.PEXELS_API_KEY) {
    const q = new URLSearchParams({ query, per_page: '12', size: 'medium' });
    const res = await fetch(`https://api.pexels.com/videos/search?${q}`, { headers: { authorization: process.env.PEXELS_API_KEY }, signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const body = (await res.json()) as { videos: Array<{ url: string; duration: number; user: { name: string }; video_files: Array<{ link: string; width: number; height: number; file_type: string }> }> };
      for (const v of body.videos) {
        const f = v.video_files.filter((x) => x.file_type === 'video/mp4' && short(x.width, x.height)).sort((a, b) => a.width * a.height - b.width * b.height)[0];
        if (f && v.duration > SECONDS) out.push({ site: 'Pexels', page: v.url, file: f.link, width: f.width, height: f.height, seconds: v.duration, author: v.user.name });
      }
    } else console.warn(`pexels: HTTP ${res.status}`);
  }
  if (process.env.PIXABAY_API_KEY) {
    const q = new URLSearchParams({ key: process.env.PIXABAY_API_KEY, q: query, per_page: '12', safesearch: 'true' });
    const res = await fetch(`https://pixabay.com/api/videos/?${q}`, { signal: AbortSignal.timeout(30_000) });
    if (res.ok) {
      const body = (await res.json()) as { hits: Array<{ pageURL: string; duration: number; user: string; videos: Record<string, { url: string; width: number; height: number }> }> };
      for (const v of body.hits) {
        const f = ['medium', 'large', 'small'].map((k) => v.videos[k]).find((x) => x?.url && short(x.width, x.height));
        if (f && v.duration > SECONDS) out.push({ site: 'Pixabay', page: v.pageURL, file: f.url, width: f.width, height: f.height, seconds: v.duration, author: v.user });
      }
    } else console.warn(`pixabay: HTTP ${res.status}`);
  }
  return out;
}

/** Frames at the start, a third and two thirds of each clip side by side, to judge a loop without playing it. */
export async function previewSheet(clips: string[], out: string) {
  const inputs = clips.flatMap((c) => ['-i', c]);
  const rows = clips.map((_, i) => `[${i}:v]select='eq(n\\,0)+eq(n\\,${FPS * 2})+eq(n\\,${FPS * 4})',scale=-2:480,tile=3x1[r${i}]`);
  const join = clips.length > 1 ? `;${clips.map((_, i) => `[r${i}]`).join('')}hstack=${clips.length}[out]` : ';[r0]copy[out]';
  await ffmpeg([...inputs, '-filter_complex', rows.join(';') + join, '-map', '[out]', '-frames:v', '1', out]);
}
