// Gemini free tier (optional), shared by ai-suggest, the daily feeds and the issue intake. Only
// article text is ever sent: never user data (comments, accounts, reading history).
import { http } from './lib';

// Google retires model names for new keys (gemini-2.5-flash-lite was closed in 2026-10); override with
// the GEMINI_MODEL repository variable when this one goes the same way.
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
/** The free tier allows about 15 requests a minute: keep a gap between calls. */
const GAP_MS = Number(process.env.GEMINI_GAP_MS ?? 4500);

export class QuotaError extends Error {}
/** The model or key cannot work at all (retired model, bad key, API off): no article can succeed, so stop. */
export class GeminiSetupError extends Error {}

/** Which errors are about the setup rather than the article being sent. */
export function isSetupFailure(status: number, body: string) {
  if (status === 401 || status === 403 || status === 404) return true;
  return status === 400 && /API key|API_KEY|no longer available|not found|not supported|INVALID_ARGUMENT.*model/i.test(body);
}

export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY);

let last = 0;
let used = 0;
export const requestsUsed = () => used;

export async function geminiJson<T>(text: string, schema: object, opts: { temperature?: number } = {}): Promise<T> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  used++;
  const res = await http(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: opts.temperature ?? 0.3, responseMimeType: 'application/json', responseSchema: schema },
      }),
    },
    1,
  );
  if (res.status === 429) throw new QuotaError('Gemini free-tier quota reached');
  if (!res.ok) {
    const body = await res.text();
    const msg = `Gemini ${MODEL} ${res.status}: ${body.slice(0, 300)}`;
    throw isSetupFailure(res.status, body) ? new GeminiSetupError(msg) : new Error(msg);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Empty Gemini response');
  return JSON.parse(out) as T;
}

export const MARKUP_RULES =
  'Reader markup, which you must keep exactly where it applies: **bold**, *italic*, [y:yellow highlight], [p:pink highlight], [g:green highlight], {reference-id}. Never invent or remove {reference-id} chips, numbers, names or years.';

export const VI_STYLE =
  'Write natural Vietnamese for educated adult readers, not word-for-word. Keep each English technical term in italics in brackets after its first Vietnamese use, e.g. thiên kiến xác nhận (*confirmation bias*).';

/**
 * House writing rules, distilled from the avoid-ai-writing and creative-writing (llm-writing) skills
 * the editors use. Every prompt that writes prose for readers includes them.
 */
export const WRITING_RULES = [
  'Writing rules (they apply to every field you write, in both languages):',
  '- Write for the reader of the app, who knows nothing yet. Each section makes one move; lead with the finding, then the evidence. Cut any sentence that only fills space.',
  '- Explain how things work instead of naming them. Back each claim with the number, name, date or example from the source. Never invent a specific, a quote, an experience or an opinion the source does not contain; if a detail is missing, leave it out.',
  '- Keep the source\'s level of certainty: say "may" only where the source hedges, and say plainly what is unknown.',
  '- Banned words and phrases: delve, landscape (as a metaphor), tapestry, realm, paradigm, embark, beacon, testament to, robust, comprehensive, cutting-edge, leverage, pivotal, underscores, meticulous, seamless, game-changer, watershed moment, nestled, vibrant, thriving, showcasing, deep dive, unpack, bustling, intricate, ever-evolving, holistic, actionable, impactful, at its core, interplay, "it\'s worth noting", "notably", "moreover", "furthermore", "additionally", "in today\'s…", "in an era where", "when it comes to", "at the end of the day", "in conclusion", "in summary", "the future looks bright", "only time will tell", "experts say" without naming them.',
  '- No "not X, but Y" pairs where one half carries the meaning, no lists of three by habit, no closing line that restates the article or predicts a bright future, no rhetorical questions as openers, no exclamation marks, at most one em dash per section, and bold only on the one phrase that matters.',
  '- Vary sentence length because the content varies, not by chopping sentences into fragments. Use plain verbs ("is", "has") rather than "serves as", "boasts", "features".',
  '- Vietnamese: the same rules apply. Avoid stock openers and fillers such as "Trong thời đại…", "Không thể phủ nhận…", "đóng vai trò quan trọng", "Tóm lại", "Có thể nói", "không chỉ… mà còn…" used by habit, and translated-sounding noun stacks; write the way a Vietnamese science journalist would.',
].join('\n');
