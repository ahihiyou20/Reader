// eLife: the article's digest (plain-language summary) from the eLife API, CC BY 4.0.
import { httpJson } from '../lib';
import { normalizeLicense } from '../licenses';
import { htmlToSections } from './html';
import type { AdapterContext, Imported } from './types';

interface ElifeArticle {
  title: string;
  published?: string;
  authors?: Array<{ name?: { preferred?: string } }>;
  copyright?: { license?: string };
  digest?: { content?: Array<{ type: string; text?: string }> };
}

export async function importElife(ctx: AdapterContext): Promise<Imported> {
  const id = ctx.url.match(/articles\/(\d+)/)?.[1];
  if (!id) throw new Error('Expected an eLife article URL like https://elifesciences.org/articles/12345');
  const a = await httpJson<ElifeArticle>(`https://api.elifesciences.org/articles/${id}`, {
    headers: { accept: 'application/vnd.elife.article-vor+json, application/vnd.elife.article-poa+json' },
  });
  const license = normalizeLicense(a.copyright?.license?.replace(/-/g, ' ')) ?? (a.copyright?.license === 'CC-BY-4.0' ? 'CC-BY-4.0' : null);
  if (!license) throw new Error(`Unsupported licence ${a.copyright?.license}`);
  const paragraphs = (a.digest?.content ?? []).filter((c) => c.type === 'paragraph' && c.text).map((c) => `<p>${c.text}</p>`);
  if (!paragraphs.length) throw new Error('This eLife article has no digest');
  return {
    url: ctx.url,
    title: a.title.replace(/<[^>]+>/g, ''),
    authors: (a.authors ?? []).map((x) => x.name?.preferred).filter((x): x is string => Boolean(x)).slice(0, 8),
    publisher: 'eLife',
    year: a.published ? new Date(a.published).getFullYear() : undefined,
    license,
    group: 1,
    sections: htmlToSections(`<div>${paragraphs.join('')}</div>`),
    termsUrl: `https://elifesciences.org/articles/${id}`,
  };
}
