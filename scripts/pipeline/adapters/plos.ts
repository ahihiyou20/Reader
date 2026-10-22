// PLOS journals: the "Author summary" from the article XML (JATS), CC BY 4.0.
import { JSDOM } from 'jsdom';
import { httpText } from '../lib';
import { normalizeLicense } from '../licenses';
import { clean, htmlToSections } from './html';
import type { AdapterContext, Imported } from './types';

export async function importPlos(ctx: AdapterContext): Promise<Imported> {
  const u = new URL(ctx.url);
  const doi = u.searchParams.get('id');
  const journal = u.pathname.split('/')[1];
  if (!doi || !journal) throw new Error('Expected a PLOS article URL like https://journals.plos.org/plosbiology/article?id=10.1371/...');
  const xml = await httpText(`https://journals.plos.org/${journal}/article/file?id=${encodeURIComponent(doi)}&type=manuscript`);
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  const licenseHref = doc.querySelector('license')?.getAttribute('xlink:href') ?? doc.querySelector('license')?.textContent;
  const license = normalizeLicense(licenseHref);
  if (!license) throw new Error(`Unsupported licence ${licenseHref}`);
  const summary = doc.querySelector('abstract[abstract-type="summary"]') ?? doc.querySelector('abstract');
  if (!summary) throw new Error('No author summary found');
  const html = [...summary.querySelectorAll('p')].map((p) => `<p>${p.innerHTML.replace(/<(\/?)italic>/g, '<$1i>').replace(/<(\/?)bold>/g, '<$1b>')}</p>`).join('');
  const authors = [...doc.querySelectorAll('contrib[contrib-type="author"] name')].map((n) =>
    clean(`${n.querySelector('given-names')?.textContent ?? ''} ${n.querySelector('surname')?.textContent ?? ''}`),
  );
  return {
    url: ctx.url,
    title: clean(doc.querySelector('article-title')?.textContent ?? doi),
    authors: authors.slice(0, 8),
    publisher: `PLOS ${journal.replace(/^plos/, '').replace(/^./, (c) => c.toUpperCase())}`,
    year: Number(doc.querySelector('pub-date year')?.textContent) || undefined,
    license,
    licenseUrl: licenseHref ?? undefined,
    group: 1,
    sections: htmlToSections(`<div>${html}</div>`),
    termsUrl: ctx.url,
  };
}
