import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleSource } from '@/lib/content/types';

// Gemini answers from a script; Pixabay from a fixed list. No ffmpeg frames: the shortlist decides.
const replies: unknown[] = [];
vi.mock('@/scripts/pipeline/gemini', () => ({
  hasGemini: () => true,
  geminiStructured: async () => ({ value: replies.shift() ?? {}, retried: false, dropped: [] }),
}));

const hit = (id: number, tags: string) => ({
  id,
  pageURL: `https://pixabay.com/videos/x-${id}/`,
  duration: 20,
  user: 'someone',
  tags,
  videos: { large: { url: `https://cdn.example/${id}.mp4`, width: 1920, height: 1080 }, medium: { url: `https://cdn.example/${id}.mp4`, width: 1280, height: 720 } },
});

const article = { title: { en: 'Our restless Sun' }, hook: { en: 'Solar storms' }, tags: ['sun'] } as unknown as ArticleSource;

describe('geminiClip', () => {
  beforeEach(() => {
    process.env.PIXABAY_API_KEY = 'test';
    process.env.GEMINI_VIA = 'agy'; // no frames: the shortlist's first clip is the pick
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ hits: [hit(901, 'sun, solar flare'), hit(902, 'woman, smile, portrait')] })));
  });
  afterEach(() => {
    replies.length = 0;
    vi.unstubAllGlobals();
    delete process.env.GEMINI_VIA;
  });

  it('takes the clip Gemini shortlists first', async () => {
    replies.push({ queries: ['sun surface'] }, { ids: [901] });
    const { geminiClip } = await import('@/scripts/pipeline/motion');
    expect((await geminiClip(article, []))?.id).toBe(901);
  });

  it('gives no clip when Gemini finds none that fits, or names one Pixabay did not return', async () => {
    const { geminiClip } = await import('@/scripts/pipeline/motion');
    replies.push({ queries: ['sun surface'] }, { ids: [] });
    expect(await geminiClip(article, [])).toBeUndefined();
    replies.push({ queries: ['sun surface'] }, { ids: [12345] });
    expect(await geminiClip(article, [])).toBeUndefined();
  });
});
