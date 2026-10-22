// OpenStax: CNXML from the book's GitHub repository (openstax/osbooks-*). The licence is read from
// the book's collection metadata; most books are CC BY-NC-SA 4.0, which the pipeline refuses.
import { XMLParser } from 'fast-xml-parser';
import { httpText } from '../lib';
import { normalizeLicense } from '../licenses';
import { clean, escapeMarkup } from './html';
import type { AdapterContext, Imported, ImportedSection } from './types';

/** Book slug on openstax.org → GitHub repository. Extend when adding books. */
export const BOOK_REPOS: Record<string, string> = {
  'psychology-2e': 'osbooks-psychology',
  'biology-2e': 'osbooks-biology-bundle',
  'concepts-biology': 'osbooks-biology-bundle',
  'introduction-sociology-3e': 'osbooks-introduction-sociology',
  'principles-economics-3e': 'osbooks-principles-economics-bundle',
  'astronomy-2e': 'osbooks-astronomy',
  'anatomy-and-physiology-2e': 'osbooks-anatomy-physiology',
  'us-history': 'osbooks-us-history',
  'world-history-volume-1': 'osbooks-world-history',
  'world-history-volume-2': 'osbooks-world-history',
  'lifespan-development': 'osbooks-lifespan-development',
  'introduction-philosophy-2e': 'osbooks-introduction-philosophy',
  physics: 'osbooks-physics',
  'life-liberty-and-pursuit-happiness': 'osbooks-life-liberty-and-pursuit-happiness',
};

type Node = Record<string, unknown>;
const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true, attributeNamePrefix: '@', trimValues: false });

const raw = (repo: string, file: string) => `https://raw.githubusercontent.com/openstax/${repo}/main/${file}`;
const tagOf = (n: Node) => Object.keys(n).find((k) => k !== ':@' && k !== '#text');
const attrs = (n: Node) => (n[':@'] ?? {}) as Record<string, string>;
const kids = (n: Node) => ((tagOf(n) ? n[tagOf(n)!] : []) as Node[]) ?? [];

function text(nodes: Node[], markup = true): string {
  let out = '';
  for (const n of nodes) {
    if ('#text' in n) {
      out += markup ? escapeMarkup(String(n['#text'])) : String(n['#text']);
      continue;
    }
    const tag = tagOf(n);
    if (!tag || ['footnote', 'figure', 'media', 'image', 'table', 'note', 'exercise', 'equation', 'm:math', 'title'].includes(tag)) continue;
    const inner = text(kids(n), markup);
    const effect = attrs(n)['@effect'];
    if (markup && tag === 'emphasis' && effect === 'bold') out += `**${inner.trim()}** `.replace(/\*\*\s*\*\*/, '');
    else if (markup && (tag === 'term' || (tag === 'emphasis' && effect !== 'bold') || tag === 'foreign')) out += tag === 'term' ? `**${inner.trim()}**` : `*${inner.trim()}*`;
    else out += inner;
  }
  return out;
}

function walk(nodes: Node[], sections: ImportedSection[], depth = 0) {
  for (const n of nodes) {
    const tag = tagOf(n);
    if (!tag) continue;
    const a = attrs(n);
    if (tag === 'note' || tag === 'figure' || tag === 'exercise' || tag === 'table' || tag === 'glossary') continue;
    if (tag === 'section') {
      const titleNode = kids(n).find((k) => tagOf(k) === 'title');
      const heading = titleNode ? clean(text(kids(titleNode), false)) : undefined;
      if (heading && /^(link to learning|everyday connection|dig deeper|what do you think\??|connect the concepts|review questions|summary)$/i.test(heading)) continue;
      sections.push({ heading, paragraphs: [] });
      walk(kids(n), sections, depth + 1);
      continue;
    }
    if (tag === 'para' && !a['@class']?.includes('note')) {
      const p = clean(text(kids(n)));
      if (p && /\p{L}/u.test(p)) sections[sections.length - 1].paragraphs.push(p);
      continue;
    }
    if (tag === 'list') {
      for (const item of kids(n).filter((k) => tagOf(k) === 'item')) {
        const p = clean(text(kids(item)));
        if (p) sections[sections.length - 1].paragraphs.push(`• ${p}`);
      }
      continue;
    }
    if (tag === 'content' || tag === 'document') walk(kids(n), sections, depth);
  }
}

export async function importOpenStax(ctx: AdapterContext): Promise<Imported> {
  const m = new URL(ctx.url).pathname.match(/^\/books\/([^/]+)\/pages\/(\d+)-(\d+)-([^/?#]+)/);
  if (!m) throw new Error('Expected a section URL like https://openstax.org/books/<book>/pages/<chapter>-<section>-<title>');
  const [, book, chapter, section, titleSlug] = m;
  const repo = BOOK_REPOS[book];
  if (!repo) throw new Error(`Unknown OpenStax book "${book}"; add it to BOOK_REPOS`);
  const collectionXml = await httpText(raw(repo, `collections/${book}.collection.xml`));
  const license = normalizeLicense(collectionXml.match(/<md:license url="([^"]+)"/)?.[1]);
  const licenseUrl = collectionXml.match(/<md:license url="([^"]+)"/)?.[1];
  if (!license) throw new Error(`OpenStax book "${book}" is licensed ${licenseUrl ?? 'unknown'}, which Reader cannot use (non-commercial or unknown)`);
  const bookTitle = collectionXml.match(/<md:title>([^<]+)<\/md:title>/)?.[1] ?? book;
  // The n-th chapter is the n-th top-level subcollection; section 0 is the chapter introduction.
  const chapters = [...collectionXml.matchAll(/<col:subcollection>([\s\S]*?)<\/col:subcollection>/g)].map((c) =>
    [...c[1].matchAll(/<col:module document="(m\d+)"/g)].map((x) => x[1]),
  );
  const moduleId = chapters[Number(chapter) - 1]?.[Number(section)];
  if (!moduleId) throw new Error(`Chapter ${chapter}, section ${section} not found in ${book}`);
  const cnxml = await httpText(raw(repo, `modules/${moduleId}/index.cnxml`));
  const doc = parser.parse(cnxml) as Node[];
  const root = doc.find((n) => tagOf(n) === 'document')!;
  const title = clean(text(kids(kids(root).find((k) => tagOf(k) === 'title') ?? {}), false)) || titleSlug.replace(/-/g, ' ');
  const content = kids(root).find((k) => tagOf(k) === 'content');
  const sections: ImportedSection[] = [{ paragraphs: [] }];
  if (content) walk(kids(content), sections);
  return {
    url: ctx.url,
    title,
    authors: [`OpenStax ${bookTitle} authors`],
    publisher: `OpenStax, ${bookTitle}`,
    license,
    licenseUrl,
    group: 1,
    sections: sections.filter((s) => s.paragraphs.length),
    termsUrl: raw(repo, `collections/${book}.collection.xml`),
  };
}
