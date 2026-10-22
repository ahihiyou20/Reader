// Generic adapter for HTML pages (Our World in Data, Frontiers for Young Minds, NASA, NOAA, USGS,
// NIH institutes, Global Voices, VOA): Mozilla Readability extracts the article body.
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { httpText } from '../lib';
import { clean, htmlToSections } from './html';
import type { AdapterContext, Imported } from './types';

/** Sites where the byline is not in standard meta tags. */
const AUTHOR_SELECTORS: Record<string, string> = {
  'kids.frontiersin.org': '[data-test-id="display-authors-container"] .fulltext-person-name',
  'ourworldindata.org': '.article-block__byline a, .byline a',
};
const DATE_SELECTORS: Record<string, string> = {
  'kids.frontiersin.org': '.fulltext-date',
};

export async function importReadable(ctx: AdapterContext, opts: { plain?: boolean } = {}): Promise<Imported> {
  if (!ctx.license) throw new Error(`No licence known for ${new URL(ctx.url).hostname}`);
  const html = await httpText(ctx.url);
  const dom = new JSDOM(html, { url: ctx.url });
  const doc = dom.window.document;
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute('content')?.trim() || undefined;
  const authorsMeta = [...doc.querySelectorAll('meta[name="author"], meta[property="article:author"], meta[name="citation_author"]')]
    .map((m) => m.getAttribute('content')?.trim())
    .filter((x): x is string => Boolean(x) && !/^https?:/.test(x!));
  const host = new URL(ctx.url).hostname;
  const siteAuthors = AUTHOR_SELECTORS[host]
    ? [...doc.querySelectorAll(AUTHOR_SELECTORS[host])].map((e) => clean(e.textContent ?? '')).filter(Boolean)
    : [];
  const siteDate = DATE_SELECTORS[host] ? doc.querySelector(DATE_SELECTORS[host])?.textContent?.replace(/^[^:]*:\s*/, '') : undefined;
  const published =
    meta('meta[property="article:published_time"]') ?? meta('meta[name="citation_publication_date"]') ?? meta('meta[name="date"]') ?? siteDate;
  const article = new Readability(doc).parse();
  if (!article?.content) throw new Error('Could not find the article text on the page');
  const sections = htmlToSections(article.content, { plain: opts.plain, baseUrl: ctx.url });
  const byline = article.byline ? clean(article.byline.replace(/^by\s+/i, '')) : '';
  const authors = siteAuthors.length ? [...new Set(siteAuthors)] : authorsMeta.length ? [...new Set(authorsMeta)] : byline ? byline.split(/,\s*|\s+and\s+|\s*&\s*/).filter(Boolean) : [ctx.publisher];
  return {
    url: ctx.url,
    title: clean(article.title ?? meta('meta[property="og:title"]') ?? ctx.url),
    authors: authors.slice(0, 8),
    publisher: ctx.publisher,
    year: published ? new Date(published).getFullYear() || undefined : undefined,
    license: ctx.license,
    group: ctx.group,
    sections,
    termsUrl: ctx.url,
  };
}
