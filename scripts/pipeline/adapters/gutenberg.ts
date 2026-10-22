// Project Gutenberg (public domain in the U.S.): metadata from Gutendex, text from the plain-text file.
import { httpJson, httpText } from '../lib';
import { escapeMarkup } from './html';
import type { AdapterContext, Imported } from './types';

interface GutendexBook {
  title: string;
  authors: Array<{ name: string }>;
  copyright: boolean | null;
  formats: Record<string, string>;
}

export async function importGutenberg(ctx: AdapterContext): Promise<Imported> {
  const id = ctx.url.match(/ebooks\/(\d+)/)?.[1];
  if (!id) throw new Error('Expected a Gutenberg book URL like https://www.gutenberg.org/ebooks/1342');
  const book = await httpJson<GutendexBook>(`https://gutendex.com/books/${id}`);
  if (book.copyright !== false) throw new Error('Gutendex does not mark this book as public domain');
  const txtUrl = Object.entries(book.formats).find(([k]) => k.startsWith('text/plain'))?.[1];
  if (!txtUrl) throw new Error('No plain-text edition');
  let txt = await httpText(txtUrl);
  txt = txt.replace(/\r\n/g, '\n');
  const start = txt.search(/\*\*\* START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/);
  const end = txt.search(/\*\*\* END OF (THE|THIS) PROJECT GUTENBERG EBOOK/);
  if (start >= 0) txt = txt.slice(txt.indexOf('\n', start) + 1, end > 0 ? end : undefined);
  const sections: Imported['sections'] = [{ paragraphs: [] }];
  for (const block of txt.split(/\n\s*\n/)) {
    const line = block.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (/^(chapter|book|part)\s+[\dIVXLC]+\.?/i.test(line) && line.length < 80) sections.push({ heading: line, paragraphs: [] });
    else if (line.length > 40) sections[sections.length - 1].paragraphs.push(escapeMarkup(line.replace(/_([^_]+)_/g, '$1')));
  }
  return {
    url: ctx.url,
    title: book.title,
    authors: book.authors.map((a) => a.name.split(', ').reverse().join(' ')),
    publisher: 'Project Gutenberg',
    license: 'PD',
    group: 1,
    sections: sections.filter((s) => s.paragraphs.length),
    termsUrl: `https://www.gutenberg.org/ebooks/${id}`,
  };
}
