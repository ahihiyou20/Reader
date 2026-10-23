// Generic adapter for HTML pages (Our World in Data, Frontiers for Young Minds, NASA, NOAA, USGS,
// NIH institutes, Global Voices, VOA): Mozilla Readability extracts the article body.
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { httpText } from '../lib';
import { clean, htmlToSections } from './html';
import type { AdapterContext, Imported, ImportedSection } from './types';

/** Sites where the byline is not in standard meta tags. */
const AUTHOR_SELECTORS: Record<string, string> = {
  'kids.frontiersin.org': '[data-test-id="display-authors-container"] .fulltext-person-name',
  'ourworldindata.org': '.article-block__byline a, .byline a',
};
const DATE_SELECTORS: Record<string, string> = {
  'kids.frontiersin.org': '.fulltext-date',
};

export interface Page {
  title: string;
  authors: string[];
  /** og:site_name, when the page has one */
  siteName?: string;
  year?: number;
  lang?: string;
  sections: ImportedSection[];
}

/** Fetch a page and extract its article body, byline and date (no licence check). */
export async function readPage(url: string, opts: { plain?: boolean } = {}): Promise<Page> {
  const html = await httpText(url);
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const meta = (sel: string) => doc.querySelector(sel)?.getAttribute('content')?.trim() || undefined;
  const authorsMeta = [...doc.querySelectorAll('meta[name="author"], meta[property="article:author"], meta[name="citation_author"]')]
    .map((m) => m.getAttribute('content')?.trim())
    .filter((x): x is string => Boolean(x) && !/^https?:/.test(x!));
  const host = new URL(url).hostname;
  const siteAuthors = AUTHOR_SELECTORS[host]
    ? [...doc.querySelectorAll(AUTHOR_SELECTORS[host])].map((e) => clean(e.textContent ?? '')).filter(Boolean)
    : [];
  const siteDate = DATE_SELECTORS[host] ? doc.querySelector(DATE_SELECTORS[host])?.textContent?.replace(/^[^:]*:\s*/, '') : undefined;
  const published =
    meta('meta[property="article:published_time"]') ?? meta('meta[name="citation_publication_date"]') ?? meta('meta[name="date"]') ?? siteDate;
  const siteName = meta('meta[property="og:site_name"]');
  const lang = doc.documentElement.getAttribute('lang') ?? undefined;
  const article = new Readability(doc).parse();
  if (!article?.content) throw new Error('Could not find the article text on the page');
  const sections = htmlToSections(article.content, { plain: opts.plain, baseUrl: url });
  const byline = article.byline ? clean(article.byline.replace(/^by\s+/i, '')) : '';
  const authors = siteAuthors.length
    ? [...new Set(siteAuthors)]
    : authorsMeta.length
      ? [...new Set(authorsMeta)]
      : byline && byline.length < 120
        ? byline.split(/,\s*|\s+and\s+|\s*&\s*/).filter(Boolean)
        : [];
  // "El Niño Then and Now - NASA Science" → "El Niño Then and Now"
  let title = clean(article.title || meta('meta[property="og:title"]') || url);
  if (siteName) title = title.replace(new RegExp(`\\s+[-–—|:]\\s+${siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '');
  return {
    title,
    authors: authors.slice(0, 8),
    siteName,
    year: published ? new Date(published).getFullYear() || undefined : undefined,
    lang,
    sections,
  };
}

export async function importReadable(ctx: AdapterContext, opts: { plain?: boolean } = {}): Promise<Imported> {
  if (!ctx.license) throw new Error(`No licence known for ${new URL(ctx.url).hostname}`);
  const page = await readPage(ctx.url, opts);
  const title = page.title.replace(new RegExp(`\\s+[-–—|]\\s+${ctx.publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '');
  return {
    url: ctx.url,
    title,
    authors: page.authors.length ? page.authors : [ctx.publisher],
    publisher: ctx.publisher,
    year: page.year,
    license: ctx.license,
    group: ctx.group,
    sections: page.sections,
    termsUrl: ctx.url,
  };
}
