import { groupForLicense, ruleFor } from '../licenses';
import { importElife } from './elife';
import { importGutenberg } from './gutenberg';
import { importOpenStax } from './openstax';
import { importPlos } from './plos';
import { importReadable } from './readability';
import type { Imported } from './types';
import { importWikipedia } from './wikipedia';

export async function importUrl(url: string): Promise<Imported> {
  const src = await importBySite(url);
  // The licence read from the page decides the group (e.g. OpenStax books under CC BY-NC-SA → 2).
  return { ...src, group: groupForLicense(src.license) };
}

async function importBySite(url: string): Promise<Imported> {
  const rule = ruleFor(url);
  if (!rule) throw new Error(`${new URL(url).hostname} is not in the licence table (scripts/pipeline/licenses.ts)`);
  const ctx = { url, publisher: rule.publisher, group: rule.group, license: rule.license };
  switch (rule.adapter) {
    case 'openstax':
      return importOpenStax(ctx);
    case 'wikipedia':
      return importWikipedia(ctx);
    case 'elife':
      return importElife(ctx);
    case 'plos':
      return importPlos(ctx);
    case 'gutenberg':
      return importGutenberg(ctx);
    case 'conversation':
      // CC BY-ND: the text is kept word for word, without emphasis markup.
      return importReadable(ctx, { plain: true });
    default:
      return importReadable(ctx);
  }
}
