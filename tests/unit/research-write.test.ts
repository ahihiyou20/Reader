// The content bot's own articles: sources gathered without keys, long sourced articles from Gemini,
// and a fallback model when the configured one is overloaded.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.GEMINI_GAP_MS = '0';
process.env.GEMINI_RETRY_MS = '0';
const { writeResearched, writtenWords } = await import('../../scripts/pipeline/compose');
const { gather } = await import('../../scripts/pipeline/research');
const { MODEL, geminiStructured } = await import('../../scripts/pipeline/gemini');
const { z } = await import('zod');

const reply = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }));
const words = (n: number, seed: string) => Array.from({ length: n }, (_, i) => `${seed}${i % 7}`).join(' ');
const section = (i: number, n: number) => ({
  heading_en: `Part number ${i + 1}`,
  body_en: `The [y:measured rate ${i}] rose {wiki1}. ${words(n, 'word')}.`,
});
const article = (perSection: number) => ({
  title_en: 'Why tides rise twice a day',
  hook_en: words(60, 'hook'),
  sections: Array.from({ length: 6 }, (_, i) => section(i, perSection)),
  keyPoint_en: words(45, 'key'),
  applySteps_en: ['Watch the tide table today', 'Mark the high tides twice', 'Compare them with the moon'],
  tags: ['tides', 'moon', 'ocean'],
  photo: 'ocean tide rocks',
});
const sources = [
  { id: 'wiki1', label: 'Wikipedia: Tide', url: 'https://en.wikipedia.org/wiki/Tide', text: words(800, 'src') },
  { id: 'paper1', label: 'Doe et al. (2020), Nature', url: 'https://doi.org/10/x', text: words(300, 'abs') },
];

describe('writeResearched', () => {
  let prompts: string[];
  beforeEach(() => {
    prompts = [];
    process.env.GEMINI_API_KEY = 'test';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks again when the article is too short, and returns English only', async () => {
    const replies = [article(60), { ...article(180), title_vi: 'Thủy triều' }];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      prompts.push(JSON.parse(String(init.body)).contents[0].parts[0].text);
      return reply(replies.shift());
    });
    const w = await writeResearched({ title: 'Tides', sources });
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/words: write 1100–1400/);
    expect(prompts[0]).toContain('[wiki1] Wikipedia: Tide');
    expect(writtenWords(w)).toBeGreaterThanOrEqual(1000);
    expect(w.title_vi).toBeUndefined();
    expect(w.photo).toBe('ocean tide rocks');
  });

  it('drops reference chips the sources do not have, keeping the highlights', async () => {
    const a = article(180);
    a.sections[0].body_en += ' A claim {made-up}.';
    vi.stubGlobal('fetch', async () => reply(a));
    const w = await writeResearched({ title: 'Tides', sources });
    expect(w.sections[0].body_en).not.toContain('{made-up}');
    expect(w.sections[0].body_en).toContain('[y:measured rate 0]');
  });
});

describe('gather', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('collects Wikipedia and Europe PMC sources with reference ids, without any key', async () => {
    vi.stubGlobal('fetch', async (u: string) => {
      if (u.startsWith('https://en.wikipedia.org/'))
        return new Response(JSON.stringify({ query: { pages: [{ title: 'Tide', fullurl: 'https://en.wikipedia.org/wiki/Tide', extract: `${words(400, 'w')}\n\nReferences\n\nlink list` }] } }));
      if (u.startsWith('https://www.ebi.ac.uk/'))
        return new Response(JSON.stringify({ resultList: { result: [{ title: 'Tidal forcing', authorString: 'Doe J, Roe A.', journalTitle: 'Nature', pubYear: '2021', doi: '10.1/abc', abstractText: '<p>We measured tides.</p>' }] } }));
      return new Response('', { status: 404 });
    });
    const docs = await gather({ title: 'Tides', category: 'science' });
    expect(docs.map((d) => d.id)).toEqual(['wiki1', 'paper1']);
    expect(docs[0].text).not.toContain('link list');
    expect(docs[1]).toMatchObject({ label: 'Doe et al. (2021), Nature', url: 'https://doi.org/10.1/abc' });
  });
});

describe('model fallback', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('moves to the next model when the configured one stays overloaded', async () => {
    process.env.GEMINI_API_KEY = 'test';
    const models: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      const model = u.match(/models\/([^:]+):/)![1];
      models.push(model);
      return model === MODEL ? new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 }) : reply({ ok: 'yes' });
    });
    const r = await geminiStructured({ prompt: 'p', schema: z.object({ ok: z.string() }) });
    expect(r.value).toEqual({ ok: 'yes' });
    expect(models.filter((m) => m === MODEL)).toHaveLength(3);
    expect(models.at(-1)).not.toBe(MODEL);
  });
});
