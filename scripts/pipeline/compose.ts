// Gemini-written parts of an article (optional, free tier). Three jobs:
//   enrich()      — an imported draft (groups 1–3): Vietnamese, KEY POINT, Apply steps, highlights, tags;
//                   for group 3 only Reader's own Vietnamese summary (the text itself is never changed).
//   summarize()   — group 5: Reader's own short summary of a copyrighted page, plus a link to it.
//   fromText()    — group 4: text an editor pasted into the issue form, shaped into a Reader article.
// Every result is checked: markup must parse, highlights must not change the words.
import type { ArticleSource, HlColor } from '../../lib/content/types';
import { parseRich, plainText } from '../../lib/content/markup';
import { MARKUP_RULES, MODEL, VI_STYLE, geminiJson } from './gemini';

const S = { type: 'STRING' } as const;
const LIST = { type: 'ARRAY', items: S } as const;
const SECTION_VI = { type: 'OBJECT', properties: { heading_vi: S, body_vi: S }, required: ['body_vi'] } as const;
const SECTION = { type: 'OBJECT', properties: { heading_en: S, heading_vi: S, body_en: S, body_vi: S }, required: ['body_en', 'body_vi'] } as const;
const HIGHLIGHT = { type: 'OBJECT', properties: { section: { type: 'INTEGER' }, text: S, color: { type: 'STRING', enum: ['yellow', 'pink', 'green'] } }, required: ['section', 'text'] } as const;

const CODE: Record<HlColor, string> = { yellow: 'y', pink: 'p', green: 'g' };

const KEY_POINT = 'keyPoint_en (40–60 words): one everyday metaphor plus one question or action the reader can take, with at most one [p:…] highlight and optional *italics*; keyPoint_vi is its Vietnamese version.';
const APPLY = 'applySteps_en: exactly 3 steps, each starting with a verb, each doable in under 10 minutes, based only on the article; applySteps_vi in the same order.';
const TAGS = 'tags: 3–5 lowercase English search keywords (single words or short phrases).';

/** Markup that does not parse is reduced to plain text rather than published broken. */
export function safeMarkup(s: string | undefined, refs: Map<string, string>): string | undefined {
  if (!s?.trim()) return undefined;
  const t = s.trim();
  if (!parseRich(t, { refs }).errors.length) return t;
  const plain = t
    .replace(/\[[ypg]:([^\]]*)\]/g, '$1')
    .replace(/\[[ypg]:/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\*+/g, '')
    .replace(/ {2,}/g, ' ');
  return parseRich(plain, { refs }).errors.length ? plain.replace(/([\\*[\]{}])/g, '\\$1') : plain;
}

/**
 * Wrap `phrase` in highlight markup at its first occurrence outside existing markup. Returns the body
 * unchanged when the phrase is not found exactly, or when the visible text would change.
 */
export function addHighlight(body: string, phrase: string, color: HlColor): string {
  const p = phrase.trim();
  if (p.length < 3 || /[[\]{}*\\]/.test(p)) return body;
  // Skip text already inside [..] or {..} or **..**.
  const masked = body.replace(/\[[^\]]*\]|\{[^}]*\}|\*\*[^*]*\*\*/g, (m) => '\u0000'.repeat(m.length));
  const at = masked.indexOf(p);
  if (at < 0) return body;
  const out = `${body.slice(0, at)}[${CODE[color]}:${p}]${body.slice(at + p.length)}`;
  return plainText(out) === plainText(body) ? out : body;
}

const countHl = (s: string) => (s.match(/\[[ypg]:/g) ?? []).length;

interface EnrichOut {
  title_vi?: string;
  hook_vi?: string;
  sections_vi?: Array<{ heading_vi?: string; body_vi: string }>;
  keyPoint_en?: string;
  keyPoint_vi?: string;
  applySteps_en?: string[];
  applySteps_vi?: string[];
  highlights?: Array<{ section: number; text: string; color?: HlColor }>;
  tags?: string[];
  summary_vi?: string;
  category?: string;
}

const categoryRule = (ids: string[]) => `category: the one id from this list that fits the article best: ${ids.join(', ')}.`;
const pickCategory = (c: string | undefined, ids: string[] | undefined) => (c && ids?.includes(c.trim().toLowerCase()) ? c.trim().toLowerCase() : undefined);

/** Fill the missing Reader parts of an imported draft. Returns the names of the fields Gemini wrote. */
export async function enrich(a: ArticleSource, opts: { categories?: string[] } = {}): Promise<string[]> {
  const verbatim = a.origin.group === 3;
  const want = {
    vi: !verbatim && (!a.title.vi || !a.hook.vi || a.sections.some((s) => !s.body_vi)),
    keyPoint: !a.keyPoint?.en,
    apply: !a.applySteps?.en?.length,
    highlights: !verbatim && !a.sections.some((s) => /\[[ypg]:/.test(s.body_en)),
    summary: verbatim && !a.summary?.vi,
    tags: !a.tags?.length,
    category: Boolean(opts.categories?.length),
  };
  if (!Object.values(want).some(Boolean)) return [];
  const prompt = [
    'You help the editors of Reader, a free, non-commercial app of short, sourced articles in English and Vietnamese.',
    `The text uses ${MARKUP_RULES}`,
    want.highlights
      ? 'highlights: in each section pick at most 2 short phrases (2–7 words) worth noticing — a key number, a surprising finding, a term. Copy each phrase EXACTLY as it appears in that section body (same characters, no markup), with the 0-based section index; color yellow for facts and numbers, pink for the main idea, green for a practical tip.'
      : '',
    want.vi
      ? `Translate title, hook and every section (heading and body) into Vietnamese. ${VI_STYLE} Return sections_vi in the same order and count as the input.${want.highlights ? ' Wrap the Vietnamese words matching each of your highlights in the same [y:…]/[p:…]/[g:…] markup.' : ''}`
      : '',
    want.summary
      ? 'This article must be republished word for word, so it is not translated. Write summary_vi: Reader\'s own Vietnamese summary of it in 60–120 words, in your own words, with no quotation longer than 8 words.'
      : '',
    want.keyPoint ? `Write ${KEY_POINT}` : '',
    want.apply ? `Write ${APPLY}` : '',
    want.tags ? `Write ${TAGS}` : '',
    want.category ? categoryRule(opts.categories!) : '',
    'Article JSON:',
    JSON.stringify({ title: a.title.en, hook: a.hook.en, sections: a.sections.map((s, i) => ({ index: i, heading: s.heading_en, body: s.body_en })) }),
  ]
    .filter(Boolean)
    .join('\n\n');
  const s = await geminiJson<EnrichOut>(prompt, {
    type: 'OBJECT',
    properties: {
      title_vi: S,
      hook_vi: S,
      sections_vi: { type: 'ARRAY', items: SECTION_VI },
      keyPoint_en: S,
      keyPoint_vi: S,
      applySteps_en: LIST,
      applySteps_vi: LIST,
      highlights: { type: 'ARRAY', items: HIGHLIGHT },
      tags: LIST,
      summary_vi: S,
      category: S,
    },
  });
  const category = pickCategory(s.category, opts.categories);
  if (category) a.category = category;
  const refs = new Map(a.references.map((r) => [r.id, r.label]));
  const fields: string[] = [];
  if (want.highlights && s.highlights?.length) {
    let added = 0;
    for (const h of s.highlights) {
      const sec = a.sections[h.section];
      if (!sec || countHl(sec.body_en) >= 2) continue;
      const next = addHighlight(sec.body_en, h.text, h.color ?? 'yellow');
      if (next !== sec.body_en) {
        sec.body_en = next;
        added++;
      }
    }
    if (added) {
      fields.push('highlights');
      if (!a.origin.changes.includes('highlights added')) a.origin.changes.push('highlights added');
    }
  }
  if (want.vi) {
    a.title.vi ??= s.title_vi?.trim() || undefined;
    a.hook.vi ??= safeMarkup(s.hook_vi, refs);
    if (s.sections_vi?.length === a.sections.length)
      a.sections = a.sections.map((sec, i) => ({
        ...sec,
        heading_vi: sec.heading_vi ?? (sec.heading_en ? s.sections_vi![i].heading_vi?.trim() || undefined : undefined),
        body_vi: sec.body_vi ?? safeMarkup(s.sections_vi![i].body_vi, refs),
      }));
    fields.push('vi');
    if (!a.origin.changes.includes('translated to Vietnamese') && a.origin.group !== 4) a.origin.changes.push('translated to Vietnamese');
  }
  if (want.summary && s.summary_vi?.trim()) {
    a.summary = { ...a.summary, vi: safeMarkup(s.summary_vi, refs) };
    fields.push('summary');
  }
  if (want.keyPoint && s.keyPoint_en?.trim()) {
    a.keyPoint = { en: safeMarkup(s.keyPoint_en, refs)!, ...(s.keyPoint_vi?.trim() ? { vi: safeMarkup(s.keyPoint_vi, refs) } : {}) };
    fields.push('keyPoint');
  }
  if (want.apply && s.applySteps_en?.length === 3) {
    a.applySteps = { en: s.applySteps_en, ...(s.applySteps_vi?.length === 3 ? { vi: s.applySteps_vi } : {}) };
    fields.push('applySteps');
    if (a.origin.group !== 4 && !a.origin.changes.includes('key point and apply steps added')) a.origin.changes.push('key point and apply steps added');
  }
  if (want.tags && s.tags?.length) a.tags = s.tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 5);
  a.ai = { fields: [...new Set([...(a.ai?.fields ?? []), ...fields])], reviewed: a.ai?.reviewed ?? false, model: MODEL };
  return fields;
}

export interface Written {
  title_en: string;
  title_vi?: string;
  hook_en: string;
  hook_vi?: string;
  sections: Array<{ heading_en?: string; heading_vi?: string; body_en: string; body_vi?: string }>;
  keyPoint_en?: string;
  keyPoint_vi?: string;
  applySteps_en?: string[];
  applySteps_vi?: string[];
  tags?: string[];
  category?: string;
}

const WRITTEN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title_en: S,
    title_vi: S,
    hook_en: S,
    hook_vi: S,
    sections: { type: 'ARRAY', items: SECTION },
    keyPoint_en: S,
    keyPoint_vi: S,
    applySteps_en: LIST,
    applySteps_vi: LIST,
    tags: LIST,
    category: S,
  },
  required: ['title_en', 'hook_en', 'sections'],
};

/** Apply a Gemini-written article to a draft, checking its markup. */
export function applyWritten(a: ArticleSource, w: Written, categories?: string[]) {
  const category = pickCategory(w.category, categories);
  if (category) a.category = category;
  const refs = new Map(a.references.map((r) => [r.id, r.label]));
  a.title = { en: w.title_en.trim(), ...(w.title_vi?.trim() ? { vi: w.title_vi.trim() } : {}) };
  a.hook = { en: safeMarkup(w.hook_en, refs)!, ...(w.hook_vi?.trim() ? { vi: safeMarkup(w.hook_vi, refs) } : {}) };
  a.sections = w.sections
    .filter((s) => s.body_en?.trim())
    .map((s) => ({
      ...(s.heading_en?.trim() ? { heading_en: s.heading_en.trim() } : {}),
      ...(s.heading_en?.trim() && s.heading_vi?.trim() ? { heading_vi: s.heading_vi.trim() } : {}),
      body_en: safeMarkup(s.body_en, refs)!,
      ...(s.body_vi?.trim() ? { body_vi: safeMarkup(s.body_vi, refs) } : {}),
    }));
  if (w.keyPoint_en?.trim()) a.keyPoint = { en: safeMarkup(w.keyPoint_en, refs)!, ...(w.keyPoint_vi?.trim() ? { vi: safeMarkup(w.keyPoint_vi, refs) } : {}) };
  if (w.applySteps_en?.length === 3) a.applySteps = { en: w.applySteps_en, ...(w.applySteps_vi?.length === 3 ? { vi: w.applySteps_vi } : {}) };
  if (w.tags?.length) a.tags = w.tags.map((t) => t.toLowerCase().trim()).filter(Boolean).slice(0, 5);
}

/** Group 5: Reader's own summary of a page it may not republish. The page text is only sent to Gemini. */
export async function summarize(page: { title: string; publisher: string; text: string }, categories?: string[]): Promise<Written> {
  const prompt = [
    'You write for Reader, a free, non-commercial app of short, sourced articles in English and Vietnamese.',
    `The original below is copyrighted, so Reader only publishes its own short summary with a link to it. Write that summary in your own words: never copy a sentence, no quotation longer than 8 words, do not reproduce lists or tables. Keep every number, name and claim faithful to the original and add nothing that is not in it. The original may be in English or Vietnamese; write both languages either way.`,
    `Use ${MARKUP_RULES} The only reference id is {source}: cite it once, right after the main finding. Use at most 2 highlights per section.`,
    'title_en: a clear title of at most 12 words (it may differ from the original). hook_en: 40–70 words that make the reader want to know more. sections: 3 or 4 sections with short headings, 50–90 words each; the whole summary (hook plus sections) stays between 200 and 380 English words. Give every field a Vietnamese version (_vi). ' +
      VI_STYLE,
    `Write ${KEY_POINT}`,
    `Write ${APPLY}`,
    `Write ${TAGS}`,
    categories?.length ? categoryRule(categories) : '',
    `Original: “${page.title}” (${page.publisher})`,
    page.text.slice(0, 30000),
  ]
    .filter(Boolean)
    .join('\n\n');
  return geminiJson<Written>(prompt, WRITTEN_SCHEMA);
}

/** Group 4: an editor's own text (from the issue form), lightly shaped into a Reader article. */
export async function fromText(text: string, hint?: string, categories?: string[]): Promise<Written> {
  const prompt = [
    'You help the editors of Reader, a free, non-commercial app of short articles in English and Vietnamese.',
    'Below is text an editor wrote. Shape it into a Reader article: keep the editor\'s ideas, facts and voice, fix only clarity and grammar, and do not add facts. The text may be in English or Vietnamese; write both languages either way.',
    `Use ${MARKUP_RULES} There are no reference ids: do not write any {…} chips. Use at most 2 highlights per section.`,
    'title_en: at most 12 words. hook_en: 40–80 words. sections: 5–7 sections with short headings, each at most 130 words (fewer sections if the text is short; never pad). Give every field a Vietnamese version (_vi). ' + VI_STYLE,
    `Write ${KEY_POINT}`,
    `Write ${APPLY}`,
    `Write ${TAGS}`,
    categories?.length ? categoryRule(categories) : '',
    hint ? `Suggested title: ${hint}` : '',
    'Text:',
    text.slice(0, 20000),
  ]
    .filter(Boolean)
    .join('\n\n');
  return geminiJson<Written>(prompt, WRITTEN_SCHEMA);
}
