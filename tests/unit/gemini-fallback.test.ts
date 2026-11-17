// A fallback model when the configured one is overloaded.
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.GEMINI_GAP_MS = '0';
process.env.GEMINI_RETRY_MS = '0';
const { MODEL, geminiStructured } = await import('../../scripts/pipeline/gemini');
const { z } = await import('zod');

const reply = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }));

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
