// Local checker for the house writing rules (distilled from the avoid-ai-writing and llm-writing
// skills). The same lists feed WRITING_RULES in gemini.ts, so the prompt and the checker never drift.

/** Words that mark generated prose; matched as whole words in English text. */
export const BANNED_WORDS_EN = [
  'delve',
  'delves',
  'delving',
  'tapestry',
  'realm',
  'paradigm',
  'embark',
  'embarks',
  'beacon',
  'robust',
  'comprehensive',
  'cutting-edge',
  'leverage',
  'leverages',
  'pivotal',
  'underscores',
  'underscore',
  'meticulous',
  'meticulously',
  'seamless',
  'seamlessly',
  'game-changer',
  'nestled',
  'vibrant',
  'thriving',
  'showcasing',
  'unpack',
  'bustling',
  'intricate',
  'ever-evolving',
  'holistic',
  'actionable',
  'impactful',
  'interplay',
  'moreover',
  'furthermore',
  'additionally',
  'notably',
];

/** Stock openers, transitions and closers (case-insensitive substrings). */
export const STOCK_PHRASES_EN = [
  "in today's",
  'in an era where',
  'when it comes to',
  'at the end of the day',
  'in conclusion',
  'in summary',
  'the future looks bright',
  'only time will tell',
  "it's worth noting",
  'it is worth noting',
  'fast-paced world',
  'a testament to',
  'testament to the',
  'watershed moment',
  'deep dive',
  'at its core',
  'plays a crucial role',
  'plays a vital role',
  'plays a pivotal role',
  'experts say',
  'let’s dive',
  "let's dive",
];

export const STOCK_PHRASES_VI = [
  'trong thời đại',
  'không thể phủ nhận',
  'đóng vai trò quan trọng',
  'tóm lại,',
  'nói tóm lại',
  'có thể nói',
  'không chỉ đơn thuần',
  'hãy cùng khám phá',
  'trong bối cảnh hiện nay',
  'một minh chứng cho',
];

export interface ProseFinding {
  rule: 'banned-word' | 'stock-phrase' | 'repeated-ngram' | 'em-dash' | 'markup-in-plain';
  text: string;
  field: string;
}

/** Reader markup reduced to its words, so checks see what the reader sees. */
const visible = (s: string) =>
  s
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\[[ypg]:/g, '')
    .replace(/[\]*]/g, '');

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) ?? [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BANNED_RE = new RegExp(`(?<![\\p{L}-])(${BANNED_WORDS_EN.map(escape).join('|')})(?![\\p{L}-])`, 'giu');

export function lintProse(
  fields: Record<string, string | undefined>,
  lang: 'en' | 'vi',
  opts: { plainFields?: string[] } = {},
): ProseFinding[] {
  const out: ProseFinding[] = [];
  const plain = new Set(opts.plainFields ?? []);
  for (const [field, raw] of Object.entries(fields)) {
    if (!raw) continue;
    if (plain.has(field) && /[*[\]{}]|_(?:vi|en)\b/.test(raw))
      out.push({ rule: 'markup-in-plain', text: raw.slice(0, 80), field });
    const text = visible(raw);
    const lower = text.toLowerCase();
    if (lang === 'en') for (const m of text.matchAll(BANNED_RE)) out.push({ rule: 'banned-word', text: m[1], field });
    for (const p of lang === 'en' ? STOCK_PHRASES_EN : STOCK_PHRASES_VI)
      if (lower.includes(p)) out.push({ rule: 'stock-phrase', text: p, field });
    const w = words(text);
    const grams = new Map<string, number>();
    // Vietnamese words are single syllables, so a phrase needs a longer window.
    const n = lang === 'en' ? 5 : 8;
    for (let i = 0; i + n <= w.length; i++) {
      const g = w.slice(i, i + n).join(' ');
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
    for (const [g, count] of grams)
      if (count >= (lang === 'en' ? 4 : 3)) out.push({ rule: 'repeated-ngram', text: g, field });
    const dashes = (text.match(/—/g) ?? []).length;
    if (dashes > Math.max(1, Math.floor(w.length / 150)))
      out.push({ rule: 'em-dash', text: `${dashes} em dashes`, field });
  }
  return out;
}

/** The prose fields of an article in one language, keyed by their JSON path. */
export function proseFields(
  a: {
    title: { en: string; vi?: string };
    hook: { en: string; vi?: string };
    sections: Array<{ heading_en?: string; heading_vi?: string; body_en: string; body_vi?: string }>;
    keyPoint?: { en: string; vi?: string };
  },
  lang: 'en' | 'vi',
): Record<string, string | undefined> {
  const f: Record<string, string | undefined> = {
    [`title.${lang}`]: a.title[lang],
    [`hook.${lang}`]: a.hook[lang],
    [`keyPoint.${lang}`]: a.keyPoint?.[lang],
  };
  a.sections.forEach((s, i) => {
    f[`sections.${i}.heading_${lang}`] = lang === 'en' ? s.heading_en : s.heading_vi;
    f[`sections.${i}.body_${lang}`] = lang === 'en' ? s.body_en : s.body_vi;
  });
  return f;
}

/** Fields that render as plain text (no Reader markup allowed). */
export const plainFieldsOf = (fields: Record<string, unknown>) =>
  Object.keys(fields).filter((k) => /^title\.|heading_/.test(k));
