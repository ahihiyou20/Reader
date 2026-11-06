// Source pages go through Firecrawl when a key is set, and fall back to a direct request otherwise.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPageHtml } from '../../scripts/pipeline/firecrawl';

describe('fetchPageHtml', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FIRECRAWL_API_KEY;
  });
  it('uses Firecrawl rawHtml when a key is set', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-test';
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push(url);
      expect(JSON.parse(String(init.body))).toMatchObject({ url: 'https://example.org/a', formats: ['rawHtml'] });
      return new Response(JSON.stringify({ success: true, data: { rawHtml: '<p>via firecrawl</p>', metadata: { statusCode: 200 } } }));
    });
    expect(await fetchPageHtml('https://example.org/a')).toBe('<p>via firecrawl</p>');
    expect(calls).toEqual(['https://api.firecrawl.dev/v2/scrape']);
  });
  it('falls back to a direct request when Firecrawl refuses (e.g. out of credits)', async () => {
    process.env.FIRECRAWL_API_KEY = 'fc-test';
    vi.stubGlobal('fetch', async (url: string) =>
      url.startsWith('https://api.firecrawl.dev') ? new Response('Payment required', { status: 402 }) : new Response('<p>direct</p>'),
    );
    expect(await fetchPageHtml('https://example.org/b')).toBe('<p>direct</p>');
  });
  it('fetches directly without a key', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return new Response('<p>direct</p>');
    });
    expect(await fetchPageHtml('https://example.org/c')).toBe('<p>direct</p>');
    expect(calls).toEqual(['https://example.org/c']);
  });
});
