// The Pagemoor standard both writers are held to, and motion covers made from a cover photo.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ArticleSource } from '../../lib/content/types';
import { generate, fromClip } from '../../scripts/pipeline/motion';
import { STANDARDS, standardProblems } from '../../scripts/pipeline/standard';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 9}`).join(' ');
const langs = ['vi', 'fr', 'de', 'es'] as const;
const glossary = Object.fromEntries(['en', ...langs].map((l) => [l, Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`term${i}`, 'a meaning']))]));

function article(): ArticleSource {
  const body = `A [y:key fact] here {wiki1}. ${words(170)}`;
  const a: ArticleSource = {
    slug: 'tides',
    status: 'published',
    category: 'science',
    title: { en: 'How tides work: the moon pulls twice' },
    hook: { en: words(60) },
    sections: Array.from({ length: 6 }, (_, i) => ({ heading_en: `Part ${i}`, body_en: body })),
    keyPoint: { en: words(45) },
    applySteps: { en: ['a b c', 'd e f', 'g h i'] },
    references: ['wiki1', 'paper1', 'web1'].map((id) => ({ id, label: id, url: `https://x.org/${id}` })),
    cover: {
      type: 'image',
      url: 'https://images.unsplash.com/photo-1?w=1080',
      wide: 'https://images.unsplash.com/photo-1?w=2560',
      provider: 'unsplash',
      author: 'Ann',
      license: 'Unsplash License',
      sourceUrl: 'https://unsplash.com/photos/AbCdEfGhIjK',
    },
    origin: { group: 4, license: 'Reader-CC-BY-4.0', authors: ['Claude for Reader'], changes: [] },
    glossary,
  };
  for (const l of langs) {
    a.title[l] = 'Titre';
    a.hook[l] = 'Hook';
    a.keyPoint![l] = 'Point';
    a.applySteps![l] = ['a', 'b', 'c'];
    for (const s of a.sections) {
      s[`heading_${l}`] = 'Partie';
      s[`body_${l}`] = 'Corps';
    }
  }
  return a;
}

describe('standardProblems', () => {
  it('passes a finished article, except the motion cover the Claude writer needs', () => {
    expect(standardProblems(article(), STANDARDS.gemini)).toEqual([]);
    expect(standardProblems(article(), STANDARDS.claude)).toEqual([expect.stringMatching(/motion cover/)]);
  });
  it('names what is missing', () => {
    const a = article();
    a.sections[1].body_en = words(40);
    a.sections[3].body_en = `[y:short] {wiki1} ${words(40)}`;
    delete a.sections[2].body_de;
    a.cover = { ...a.cover, wide: undefined };
    const out = standardProblems(a, STANDARDS.gemini).join(' | ');
    expect(out).toMatch(/English words/);
    expect(out).toMatch(/section 2: 0 highlights/);
    expect(out).toMatch(/section 2: no source chip/);
    expect(out).toMatch(/not complete in de/);
    expect(out).toMatch(/no landscape version/);
  });
});

const ffmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const probe = (f: string) =>
  execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim();

describe.skipIf(!ffmpeg)('motion covers', () => {
  it('animates a photo into a 6-second loop in each shape, and loops a stock clip', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-test-'));
    const photo = await sharp({ create: { width: 900, height: 1600, channels: 3, background: { r: 40, g: 70, b: 110 } } }).jpeg().toBuffer();
    await generate(photo, 'portrait', 'dust', path.join(dir, 'p.mp4'), 'seed');
    await generate(photo, 'wide', 'fog', path.join(dir, 'w.mp4'), 'seed');
    expect(probe(path.join(dir, 'p.mp4'))).toBe('720,1280,144');
    expect(probe(path.join(dir, 'w.mp4'))).toBe('1280,720,144');
    // A stock clip needs half a second more than the loop, for the cross-fade.
    execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=8', '-pix_fmt', 'yuv420p', path.join(dir, 's.mp4')]);
    await fromClip(path.join(dir, 's.mp4'), 'portrait', path.join(dir, 'c.mp4'));
    expect(probe(path.join(dir, 'c.mp4'))).toBe('720,1280,144');
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120_000);
});
