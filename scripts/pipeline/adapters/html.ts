// HTML → sections of Reader markup, shared by the Readability, Wikipedia and The Conversation adapters.
import { JSDOM } from 'jsdom';
import type { ImportedSection } from './types';

const SKIP = 'script, style, noscript, figure, figcaption, table, aside, nav, footer, form, button, iframe, svg, video, audio, sup.reference, .reference, a.ref, a[href^="#"] > sup, sup > a[href^="#"], .mw-editsection, .hatnote, .navbox, .infobox, .thumb, .gallery, .mw-references-wrap, .reflist, .metadata, .noprint, .shortdescription, .sr-only';
const BLOCK = new Set(['P', 'LI', 'BLOCKQUOTE', 'DD']);
const HEADINGS = new Set(['H2', 'H3', 'H4']);
const DROP_HEADINGS = /^(references?|notes?|see also|external links|further reading|bibliography|sources|footnotes|citations?|related|acknowledg(e)?ments?|glossary|link to learning|conflict of interest|author contributions?|funding|cite this work|past versions|reuse this work( freely)?|endnotes|keep reading|you may also be interested in:?|stay up-to-date.*|related terms|explore more|more from nasa|discover more topics.*|related (research|articles|charts|topics)|about the authors?|more resources|share this|ai tool statement|young reviewers?|original source article|tài liệu tham khảo|xem thêm|liên kết ngoài|chú thích)$/i;

/** A heading that is only a date (NASA puts reference lists under one). */
const DATE_HEADING = /^(\w+ \d{1,2}, \d{4}|\d{1,2} \w+ \d{4}|\d{4}-\d{2}-\d{2})$/;
/** Page furniture that Readability sometimes keeps as paragraphs. */
const JUNK_PARAGRAPH = /^(\d+\s*min(ute)?s?\s+read|share|print|email|advertisement|read more|listen to this article.*|image credit:.*)$/i;
const LEAD_IN = /^(Image of the Day for \w+ \d{1,2}, \d{4})\s+/;

/** Escape characters that mean something in Reader markup. */
export const escapeMarkup = (s: string) => s.replace(/([\\*[\]{}])/g, '\\$1');

function inline(node: Node, plain: boolean): string {
  let out = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      out += plain ? child.textContent ?? '' : escapeMarkup(child.textContent ?? '');
      return;
    }
    if (child.nodeType !== 1) return;
    const el = child as Element;
    if (el.matches(SKIP)) return;
    const inner = inline(el, plain);
    const tag = el.tagName;
    if (plain || !inner.trim()) out += inner;
    else if (tag === 'B' || tag === 'STRONG') out += wrap(inner, '**');
    else if (tag === 'I' || tag === 'EM' || tag === 'CITE') out += wrap(inner, '*');
    else if (tag === 'BR') out += ' ';
    else out += inner;
  });
  return out;
}

function wrap(s: string, mark: string) {
  const lead = s.match(/^\s*/)![0];
  const trail = s.match(/\s*$/)![0];
  const core = s.trim().replace(/\*+/g, '');
  return core ? `${lead}${mark}${core}${mark}${trail}` : s;
}

export function clean(s: string): string {
  return s
    .replace(/ /g, ' ')
    .replace(/\s*\[(\d+|[a-z]|citation needed|note \d+)\]/gi, '')
    .replace(/\s*\((?:see )?(?:Figure|Fig\.|Table)\s[\d.]+[a-z]?\)/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
}

/** Walk the document in order: H2–H4 start a section, P/LI/BLOCKQUOTE become paragraphs. */
export function htmlToSections(html: string, opts: { plain?: boolean; baseUrl?: string } = {}): ImportedSection[] {
  const dom = new JSDOM(html, { url: opts.baseUrl });
  const doc = dom.window.document;
  doc.querySelectorAll(SKIP).forEach((el) => el.remove());
  const sections: ImportedSection[] = [{ paragraphs: [] }];
  let dropping = false;
  const walker = doc.createTreeWalker(doc.body, 1 /* elements */);
  let node = walker.nextNode() as Element | null;
  while (node) {
    const tag = node.tagName;
    if (HEADINGS.has(tag)) {
      const heading = clean(node.textContent ?? '');
      dropping = DROP_HEADINGS.test(heading) || DATE_HEADING.test(heading);
      if (!dropping && heading) sections.push({ heading, paragraphs: [] });
    } else if (BLOCK.has(tag) && !dropping) {
      // nested lists/paragraphs are handled by their own entries
      if (!(tag === 'P' && node.closest('li')) && !(tag === 'LI' && node.querySelector('p'))) {
        const text = clean(inline(node, Boolean(opts.plain))).replace(LEAD_IN, '');
        if (text && /\p{L}/u.test(text) && !JUNK_PARAGRAPH.test(text)) sections[sections.length - 1].paragraphs.push(tag === 'LI' ? `• ${text}` : text);
      }
    }
    node = walker.nextNode() as Element | null;
  }
  return sections.filter((s) => s.paragraphs.length > 0);
}
