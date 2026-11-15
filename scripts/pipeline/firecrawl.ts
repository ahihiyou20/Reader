// Page fetching through Firecrawl (https://docs.firecrawl.dev/api-reference/endpoint/scrape) when the
// FIRECRAWL_API_KEY secret is set: it renders JavaScript pages and gets past most bot walls, then hands
// the HTML to the same Readability step as before. Without a key, over the per-run cap, or when
// Firecrawl fails (quota, outage), pages are fetched directly as before.
import { httpText } from './lib';

/** The free plan has 1,000 credits a month (1 per page): keep one run well inside it. */
const MAX_PER_RUN = Number(process.env.FIRECRAWL_MAX_PER_RUN || 30);
let usedThisRun = 0;
export const firecrawlPagesUsed = () => usedThisRun;

export const hasFirecrawl = () => Boolean(process.env.FIRECRAWL_API_KEY);

/** Raw HTML of a page via Firecrawl, or null when it is unavailable for this request. */
async function scrapeHtml(url: string): Promise<string | null> {
  if (!hasFirecrawl() || usedThisRun >= MAX_PER_RUN) return null;
  usedThisRun++;
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
      body: JSON.stringify({ url, formats: ['rawHtml'], onlyMainContent: false, timeout: 60000 }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      console.warn(`Firecrawl ${res.status} for ${url}; fetching directly.`);
      return null;
    }
    const body = (await res.json()) as { success?: boolean; data?: { rawHtml?: string; metadata?: { statusCode?: number } } };
    const status = body.data?.metadata?.statusCode ?? 200;
    if (!body.success || !body.data?.rawHtml || status >= 400) return null;
    return body.data.rawHtml;
  } catch (e) {
    console.warn(`Firecrawl failed for ${url} (${(e as Error).message}); fetching directly.`);
    return null;
  }
}

export interface SearchHit {
  url: string;
  title: string;
  markdown: string;
}

/**
 * Web search with each hit's page as markdown (https://docs.firecrawl.dev/api-reference/endpoint/search).
 * Each scraped hit costs a credit, so hits count against the same per-run cap as scrapes.
 */
export async function firecrawlSearch(query: string, limit = 3): Promise<SearchHit[]> {
  if (!hasFirecrawl() || usedThisRun + limit > MAX_PER_RUN) return [];
  usedThisRun += limit;
  try {
    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
      body: JSON.stringify({ query, limit, scrapeOptions: { formats: ['markdown'], onlyMainContent: true } }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      console.warn(`Firecrawl search ${res.status} for "${query}"`);
      return [];
    }
    const body = (await res.json()) as { data?: { web?: Array<{ url?: string; title?: string; markdown?: string }> } };
    return (body.data?.web ?? [])
      .filter((h): h is Required<typeof h> => Boolean(h.url && h.markdown))
      .map((h) => ({ url: h.url, title: h.title ?? h.url, markdown: h.markdown }));
  } catch (e) {
    console.warn(`Firecrawl search failed for "${query}" (${(e as Error).message})`);
    return [];
  }
}

/** HTML of a source page: Firecrawl first when configured, a direct request otherwise. */
export async function fetchPageHtml(url: string): Promise<string> {
  return (await scrapeHtml(url)) ?? httpText(url);
}
