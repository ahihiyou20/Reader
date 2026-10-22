// Markup used in content files (docs/05 §6.3):
//   **bold**  *italic*  [y:yellow] [p:pink] [g:green]  {reference-id}
// Blank lines separate paragraphs. A backslash escapes the next character.
import type { HlColor, InlineNode, Rich } from './types';

export interface MarkupError {
  message: string;
  index: number;
}

const HL: Record<string, HlColor> = { y: 'yellow', p: 'pink', g: 'green' };
const REF_ID = /^[a-z0-9][a-z0-9._-]*$/i;

export interface ParseOptions {
  /** Resolve a reference id to its chip label. Unknown ids are reported as errors. */
  refs?: Map<string, string> | Record<string, string>;
}

function lookup(refs: ParseOptions['refs'], id: string): string | undefined {
  if (!refs) return id;
  return refs instanceof Map ? refs.get(id) : refs[id];
}

function pushText(out: InlineNode[], v: string) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === 'text') last.v += v;
  else out.push({ t: 'text', v });
}

/** Parse one paragraph of inline markup. */
export function parseInline(src: string, opts: ParseOptions = {}, base = 0): { nodes: InlineNode[]; errors: MarkupError[] } {
  const out: InlineNode[] = [];
  const errors: MarkupError[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    pushText(out, buf);
    buf = '';
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (c === '*') {
      const bold = src[i + 1] === '*';
      const mark = bold ? '**' : '*';
      const end = findClose(src, i + mark.length, mark);
      if (end < 0) {
        errors.push({ message: `Unclosed ${mark}`, index: base + i });
        buf += mark;
        i += mark.length;
        continue;
      }
      const inner = unescape(src.slice(i + mark.length, end));
      if (!inner.trim()) errors.push({ message: `Empty ${mark}${mark}`, index: base + i });
      flush();
      out.push({ t: bold ? 'bold' : 'italic', v: inner });
      i = end + mark.length;
      continue;
    }
    if (c === '[' && HL[src[i + 1]] && src[i + 2] === ':') {
      const end = findClose(src, i + 3, ']');
      if (end < 0) {
        errors.push({ message: 'Unclosed highlight [x:…]', index: base + i });
        buf += c;
        i += 1;
        continue;
      }
      let inner = src.slice(i + 3, end);
      let bold = false;
      let italic = false;
      if (/^\*\*[^*].*\*\*$/.test(inner)) {
        bold = true;
        inner = inner.slice(2, -2);
      } else if (/^\*[^*].*\*$/.test(inner)) {
        italic = true;
        inner = inner.slice(1, -1);
      }
      inner = unescape(inner);
      if (!inner.trim()) errors.push({ message: 'Empty highlight', index: base + i });
      if (/[[\]{}*]/.test(inner)) errors.push({ message: 'Nested markup inside a highlight', index: base + i });
      flush();
      const node: InlineNode = { t: 'hl', v: inner, color: HL[src[i + 1]] };
      if (bold) node.bold = true;
      if (italic) node.italic = true;
      out.push(node);
      i = end + 1;
      continue;
    }
    if (c === '{') {
      const end = src.indexOf('}', i + 1);
      const id = end > 0 ? src.slice(i + 1, end) : '';
      if (end > 0 && REF_ID.test(id)) {
        const label = lookup(opts.refs, id);
        if (label === undefined) errors.push({ message: `Unknown reference {${id}}`, index: base + i });
        flush();
        out.push({ t: 'cite', v: label ?? id, refId: id });
        i = end + 1;
        continue;
      }
    }
    buf += c;
    i += 1;
  }
  flush();
  return { nodes: out, errors };
}

function findClose(src: string, from: number, mark: string): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] === '\\') {
      j++;
      continue;
    }
    if (src.startsWith(mark, j)) {
      // a single * must not be the first half of **
      if (mark === '*' && src[j + 1] === '*') {
        j++;
        continue;
      }
      return j;
    }
    if (src[j] === '\n' && src[j + 1] === '\n') return -1;
  }
  return -1;
}

function unescape(s: string) {
  return s.replace(/\\(.)/g, '$1');
}

/** Parse a block (possibly several paragraphs separated by blank lines). */
export function parseRich(src: string | undefined, opts: ParseOptions = {}): { rich: Rich; errors: MarkupError[] } {
  const errors: MarkupError[] = [];
  const rich: Rich = [];
  if (!src) return { rich, errors };
  let offset = 0;
  for (const part of src.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
    const text = part.replace(/\s*\n\s*/g, ' ').trim();
    if (text) {
      const r = parseInline(text, opts, offset);
      rich.push(r.nodes);
      errors.push(...r.errors);
    }
    offset += part.length + 2;
  }
  return { rich, errors };
}

/** Markup → plain text (for word counts, search and meta descriptions). */
export function plainText(src: string | undefined, refs?: ParseOptions['refs']): string {
  if (!src) return '';
  return parseRich(src, { refs })
    .rich.map((p) => p.map((n) => n.v).join(''))
    .join('\n\n');
}

export function richToText(rich: Rich | undefined): string {
  if (!rich) return '';
  return rich.map((p) => p.map((n) => n.v).join('')).join('\n\n');
}

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’.,%-]*/gu);
  return m ? m.length : 0;
}

/** Ids of every {ref} used in a markup string. */
export function citedIds(src: string | undefined): string[] {
  if (!src) return [];
  const ids: string[] = [];
  for (const p of parseRich(src).rich) for (const n of p) if (n.t === 'cite') ids.push(n.refId);
  return ids;
}

export function highlightCount(src: string | undefined): number {
  if (!src) return 0;
  let n = 0;
  for (const p of parseRich(src).rich) for (const node of p) if (node.t === 'hl') n++;
  return n;
}
