// Wikipedia (CC BY-SA 4.0, group 2): Parsoid HTML from the Wikimedia REST API, with the
// action API as a fallback. Authors are the page's contributors (linked through the history page).
import { http, httpJson, httpText } from '../lib';
import { htmlToSections } from './html';
import type { AdapterContext, Imported } from './types';

export async function importWikipedia(ctx: AdapterContext): Promise<Imported> {
  const u = new URL(ctx.url);
  const title = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ''));
  const base = `${u.protocol}//${u.host}`;
  let html: string;
  const rest = await http(`${base}/api/rest_v1/page/html/${encodeURIComponent(title)}`);
  if (rest.ok) html = await rest.text();
  else {
    const parsed = await httpJson<{ parse?: { text?: { '*': string } } }>(
      `${base}/w/api.php?action=parse&format=json&prop=text&redirects=1&page=${encodeURIComponent(title)}`,
    );
    html = parsed.parse?.text?.['*'] ?? (await httpText(ctx.url));
  }
  return {
    url: ctx.url,
    title: title.replace(/_/g, ' '),
    authors: ['Wikipedia contributors'],
    publisher: ctx.publisher,
    year: new Date().getFullYear(),
    license: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    group: 2,
    sections: htmlToSections(html, { baseUrl: ctx.url }),
    termsUrl: `${base}/w/index.php?title=${encodeURIComponent(title)}&action=history`,
  };
}
