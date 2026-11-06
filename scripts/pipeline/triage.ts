// Which feed items deserve a Reader article. Rule-based rejects first (free), then one batched Gemini
// call scores what is left for lasting value to a curious general reader, then a pure selection step
// balances categories and kinds and drops near-duplicates of articles Reader already has.
import { z } from 'zod';
import { geminiStructured, hasGemini } from './gemini';

export interface Candidate {
  url: string;
  title: string;
  summary?: string;
  feedId: string;
  category?: string;
}
export const KINDS = ['finding', 'explainer', 'history', 'practical', 'data'] as const;
export interface Scored extends Candidate {
  score: number;
  category: string;
  kind: (typeof KINDS)[number];
  reason: string;
}
export interface TriageOptions {
  minScore: number;
  perCategory: number;
  limit: number;
  dupThreshold: number;
  existingTitles: string[];
  categories: string[];
  /** A stricter bar for some feeds (e.g. Wikipedia's random featured article). */
  minScoreByFeed?: Record<string, number>;
}

// Each rule names what it catches; they read the title, and the summary where noted.
const TITLE_RULES: Array<[RegExp, string]> = [
  [
    /\b(webinars?|seminars?|symposi(um|a)|workshops?|colloqui(um|a)|town hall|open house|livestream|conference|summit|expo)\b/i,
    'event notice',
  ],
  [/\bpresents? (at|to)\b|\bto (speak|present) at\b/i, 'talk announcement'],
  [
    /\b(call for (proposals|papers|abstracts|nominations|applications)|solicitation|funding opportunit|request for (information|proposals)|notice of)\b/i,
    'call for proposals',
  ],
  [
    /\b(names?|appoints?|welcomes?|selects?|hires?|taps)\b.{0,60}\b(director|chief|head|administrator|ceo|president|chair(man|woman)?|dean|manager|lead)\b/i,
    'personnel news',
  ],
  [/\b(new|acting|deputy|interim) (director|chief|administrator|head)\b/i, 'personnel news'],
  [
    /\b(19|20)\d\d\s*[–-]\s*\d\d\b.*\bseason\b|\bseason\b.*\b(f\.?c\.?|football|club|league|team)\b|^\d{4} [\p{L} .]+ season$/iu,
    'sports season',
  ],
  [/\b(job (opening|posting)|we('re| are) hiring|vacanc(y|ies)|internship opportunit|apply now)\b/i, 'job ad'],
  [
    /\b(wins?|receives?|awarded|earns?|honou?red|honou?rs)\b.{0,60}\b(award|prize|medal|grant|fellowship|recognition)\b|\baward (honou?rs|recognizes)\b/i,
    'award or grant notice',
  ],
  [/\b(obituary|in memoriam|dies at \d+|passes away)\b/i, 'obituary'],
  [/\b(press release|media advisory|newsletter|this week in|weekly roundup|digest)\b/i, 'roundup or press notice'],
  [
    /\((\d{4} )?(film|movie|album|song|single|tv series|television series|episode|video game|band|novel)\)$/i,
    'film, album or show as a subject',
  ],
];
const SUMMARY_RULES: Array<[RegExp, string]> = [
  [
    /\b(is|was) (an?|the) (\d{4} )?([\p{L}-]+ ){0,3}(film|movie|album|single|song|television (series|film)|tv series|episode|video game|soap opera|sitcom)\b/iu,
    'film, album or show as a subject',
  ],
  [
    /\b(is|was) (an?|the) ([\p{L}-]+ ){0,3}(footballer|football club|cricketer|racing driver|wrestler)\b/iu,
    'sports biography',
  ],
];

/** Rule-based reject, before any Gemini call. Returns the reason, or null to keep. */
export function hardReject(c: Candidate): string | null {
  const title = c.title.trim();
  for (const [re, why] of TITLE_RULES) if (re.test(title)) return why;
  if (c.summary) for (const [re, why] of SUMMARY_RULES) if (re.test(c.summary)) return why;
  if (title.split(/\s+/).filter(Boolean).length < 4 && !c.summary?.trim()) return 'title too short and no summary';
  return null;
}

const STOP = new Set(
  'a an and are as at be by for from how in into is it its of on or that the this to was what when where which who why will with really does do your you we our new study'.split(
    ' ',
  ),
);
const tokens = (s: string) =>
  new Set(
    (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      .filter((w) => !STOP.has(w))
      .map((w) => (w.length > 4 ? w.replace(/(ies|es|s)$/, '') : w)),
  );

/**
 * How alike two titles are (lowercase, stop words removed, plurals folded): token Jaccard, or the
 * share of the shorter title found in the longer one (scaled down a little) when that is higher, so
 * "How habits really form" matches "How habits form, and why 21 days is a myth".
 */
export function titleSimilarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let both = 0;
  for (const t of x) if (y.has(t)) both++;
  const jaccard = both / (x.size + y.size - both);
  const contained = Math.min(x.size, y.size) >= 2 ? (0.8 * both) / Math.min(x.size, y.size) : 0;
  return Math.max(jaccard, contained);
}

/** Pure selection over scored candidates (no I/O). */
export function pickTriaged(scored: Scored[], opts: TriageOptions): Scored[] {
  const bar = (c: Scored) => opts.minScoreByFeed?.[c.feedId] ?? opts.minScore;
  const pool = scored.filter((c) => c.score >= bar(c)).map((c, i) => ({ c, i }));
  const picked: Scored[] = [];
  const perCat = new Map<string, number>();
  const perKind = new Map<string, number>();
  const known = [...opts.existingTitles];
  while (picked.length < opts.limit && pool.length) {
    // Highest score first; among equal scores the less used kind, then feed order.
    pool.sort(
      (a, b) => b.c.score - a.c.score || (perKind.get(a.c.kind) ?? 0) - (perKind.get(b.c.kind) ?? 0) || a.i - b.i,
    );
    const { c } = pool.shift()!;
    if ((perCat.get(c.category) ?? 0) >= opts.perCategory) continue;
    if (known.some((t) => titleSimilarity(t, c.title) >= opts.dupThreshold)) continue;
    picked.push(c);
    known.push(c.title);
    perCat.set(c.category, (perCat.get(c.category) ?? 0) + 1);
    perKind.set(c.kind, (perKind.get(c.kind) ?? 0) + 1);
  }
  return picked;
}

const RUBRIC = [
  'You choose stories for Reader, a free app of short, sourced articles for curious general readers in English and Vietnamese.',
  'Score each candidate from 0 to 10 for the value of a Reader article built from it:',
  '- 8–10: a finding, mechanism or piece of history a reader would still find worth knowing in a year, with evidence the article can explain (how it works, what was measured, what it changes).',
  '- 5–7: solid but narrow, local, or mostly news without much to explain.',
  '- 0–4: announcements, events, personnel, product or institutional promotion, sports results or seasons, entertainment plots, biographies of people a general reader has no reason to know, lists without substance, or anything that would repeat an existing Reader article.',
  'Set reject to true for 0–4. kind: finding (new research result), explainer (how something works), history, practical (research-backed advice), data (a trend told through numbers).',
  'category: the one id from the given list that fits best. reason: one short sentence a human editor can check.',
].join('\n');

/** Full step: hard rejects, one batched Gemini call (or a neutral fallback without a key), then pickTriaged. */
export async function triage(
  cands: Candidate[],
  opts: TriageOptions,
): Promise<{ picked: Scored[]; rejected: Array<{ url: string; reason: string }> }> {
  const rejected: Array<{ url: string; reason: string }> = [];
  const kept: Candidate[] = [];
  for (const c of cands) {
    const why = hardReject(c);
    if (why) rejected.push({ url: c.url, reason: why });
    else kept.push(c);
  }
  const fallbackCategory = (c: Candidate) =>
    c.category && opts.categories.includes(c.category) ? c.category : (opts.categories[0] ?? 'science');
  if (!hasGemini() || !kept.length) {
    // Without a model every survivor scores the bar, so selection keeps feed order (round-robin upstream).
    const scored = kept.map((c) => ({
      ...c,
      score: opts.minScore,
      category: fallbackCategory(c),
      kind: 'explainer' as const,
      reason: 'no model: rule-based pick',
    }));
    return { picked: pickTriaged(scored, opts), rejected };
  }
  const schema = z.object({
    items: z.array(
      z.object({
        index: z
          .number()
          .int()
          .min(0)
          .max(kept.length - 1),
        score: z.number().min(0).max(10),
        category: z.enum(opts.categories as [string, ...string[]]),
        kind: z.enum(KINDS),
        reason: z.string().min(3).max(240),
        reject: z.boolean(),
      }),
    ),
  });
  const prompt = [
    RUBRIC,
    `Categories: ${opts.categories.join(', ')}.`,
    `Reader already has these titles (do not pick near-repeats): ${opts.existingTitles.slice(-400).join(' | ')}`,
    'Candidates (index, source, title, summary):',
    ...kept.map(
      (c, i) =>
        `${i}. [${c.feedId}] ${c.title} — ${(c.summary ?? '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 400)}`,
    ),
    'Return one item per candidate index.',
  ].join('\n');
  const { value } = await geminiStructured({ prompt, schema, temperature: 0.2 });
  const scored: Scored[] = [];
  for (const it of value.items ?? []) {
    const c = kept[it.index];
    if (!c || scored.some((s) => s.url === c.url)) continue;
    if (it.reject) rejected.push({ url: c.url, reason: `score ${it.score}: ${it.reason}` });
    else scored.push({ ...c, score: it.score, category: it.category, kind: it.kind, reason: it.reason });
  }
  return { picked: pickTriaged(scored, opts), rejected };
}
