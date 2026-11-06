// ACCEPTANCE A3: Gemini replies are schema-checked, retried once, and never return an invalid field.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

process.env.GEMINI_GAP_MS = '0';
const { geminiStructured } = await import('../../scripts/pipeline/gemini');

const schema = z.object({
  title: z.string().max(20),
  steps: z.array(z.string()).length(3),
  sections: z.array(z.object({ heading: z.string().max(10).optional(), body: z.string().min(1) })).optional(),
});
type Out = z.infer<typeof schema>;

const reply = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }));
let bodies: Array<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const queue = (...objs: unknown[]) => {
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return reply(objs.shift());
  });
};

describe('geminiStructured', () => {
  beforeEach(() => {
    bodies = [];
    process.env.GEMINI_API_KEY = 'test';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('returns a valid first reply without retrying, and sends a JSON schema', async () => {
    queue({ title: 'Short', steps: ['a', 'b', 'c'] });
    const r = await geminiStructured<Out>({ prompt: 'p', schema });
    expect(r).toEqual({ value: { title: 'Short', steps: ['a', 'b', 'c'] }, retried: false, dropped: [] });
    const cfg = bodies[0].generationConfig;
    expect(cfg.responseJsonSchema ?? cfg.responseSchema).toBeTruthy();
  });

  it('retries once with the problems listed', async () => {
    queue({ title: 'x'.repeat(40), steps: ['a'] }, { title: 'Fine', steps: ['a', 'b', 'c'] });
    const r = await geminiStructured<Out>({ prompt: 'p', schema });
    expect(r.retried).toBe(true);
    expect(r.value.title).toBe('Fine');
    const second = bodies[1].contents[0].parts[0].text as string;
    expect(second).toMatch(/title/);
    expect(second).toMatch(/steps/);
  });

  it('drops only the invalid fields after a second failure', async () => {
    const bad = {
      title: 'x'.repeat(40),
      steps: ['a', 'b', 'c'],
      sections: [
        { heading: 'ok', body: 'b' },
        { heading: 'a heading far too long', body: 'b2' },
      ],
    };
    queue(bad, bad);
    const r = await geminiStructured<Out>({ prompt: 'p', schema });
    expect(r.value.title).toBeUndefined();
    expect(r.value.steps).toEqual(['a', 'b', 'c']);
    expect(r.value.sections).toEqual([{ heading: 'ok', body: 'b' }, { body: 'b2' }]);
    expect(r.dropped).toEqual(expect.arrayContaining(['title', 'sections.1.heading']));
  });

  it('falls back to responseSchema when the API rejects responseJsonSchema', async () => {
    let n = 0;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (n++ === 0)
        return new Response('Invalid JSON payload received. Unknown name "responseJsonSchema"', { status: 400 });
      return reply({ title: 'Ok', steps: ['a', 'b', 'c'] });
    });
    const r = await geminiStructured<Out>({ prompt: 'p', schema });
    expect(r.value.title).toBe('Ok');
    expect(bodies[1].generationConfig.responseSchema.type).toBe('OBJECT');
  });
});
