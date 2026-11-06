// Gemini free tier (optional), shared by ai-suggest, the daily feeds and the issue intake. Only
// article text is ever sent: never user data (comments, accounts, reading history).
import { z } from 'zod';
import { http } from './lib';
import { BANNED_WORDS_EN, STOCK_PHRASES_EN, STOCK_PHRASES_VI } from './prose-lint';

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

/** The API may not know `responseJsonSchema` (older models); then fall back to `responseSchema` once. */
let jsonSchemaRejected = false;

/** OpenAPI subset for `responseSchema`: upper-case types, no keywords it rejects. */
function toOpenApi(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toOpenApi);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (['$schema', 'additionalProperties', 'pattern', 'minLength', 'maxLength', 'exclusiveMinimum', 'exclusiveMaximum'].includes(k)) continue;
    out[k] = k === 'type' && typeof v === 'string' ? v.toUpperCase() : toOpenApi(v);
  }
  return out;
}

async function generate(text: string, jsonSchema: object, temperature: number): Promise<unknown> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const wait = last + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  used++;
  const schemaField = jsonSchemaRejected ? { responseSchema: toOpenApi(jsonSchema) } : { responseJsonSchema: jsonSchema };
  const res = await http(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature, responseMimeType: 'application/json', ...schemaField },
      }),
    },
    1,
  );
  if (res.status === 429) throw new QuotaError('Gemini free-tier quota reached');
  if (!res.ok) {
    const body = await res.text();
    if (!jsonSchemaRejected && res.status === 400 && /response_?json_?schema/i.test(body)) {
      jsonSchemaRejected = true;
      return generate(text, jsonSchema, temperature);
    }
    const msg = `Gemini ${MODEL} ${res.status}: ${body.slice(0, 300)}`;
    throw isSetupFailure(res.status, body) ? new GeminiSetupError(msg) : new Error(msg);
  }
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Empty Gemini response');
  try {
    return JSON.parse(out);
  } catch {
    return undefined;
  }
}

export interface StructuredResult<T> {
  value: Partial<T>;
  retried: boolean;
  dropped: string[];
}

const issueList = (issues: readonly z.core.$ZodIssue[]) => issues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');

/**
 * Delete what the schema rejects from an object reply: a key inside an array item when the issue points
 * there, otherwise the whole top-level field. Repeats until only problems with absent fields remain.
 */
function prune<T>(reply: Record<string, unknown>, schema: z.ZodType<T>, known: string[]): string[] {
  const dropped: string[] = [];
  for (const key of Object.keys(reply)) if (!known.includes(key)) delete reply[key];
  for (let pass = 0; pass < 8; pass++) {
    const r = schema.safeParse(reply);
    if (r.success) {
      // Keep what zod produced (preprocessed, transformed), not the raw reply.
      for (const key of Object.keys(reply)) delete reply[key];
      Object.assign(reply, r.data);
      break;
    }
    let changed = false;
    for (const i of r.error.issues) {
      const [top, idx, sub] = i.path as [string, number | undefined, string | undefined];
      if (!(top in reply)) continue;
      const list = reply[top];
      if (Array.isArray(list) && typeof idx === 'number' && typeof sub === 'string' && list[idx] && sub in list[idx]) {
        delete (list[idx] as Record<string, unknown>)[sub];
        dropped.push(`${top}.${idx}.${sub}`);
      } else {
        delete reply[top];
        dropped.push(top);
      }
      changed = true;
    }
    if (!changed) break;
  }
  return dropped;
}

/**
 * Gemini JSON that must pass a zod schema. The JSON Schema sent to the API comes from the same zod
 * schema unless one is given. A failing reply is retried once with the problems listed; a second
 * failure keeps the valid fields and reports the dropped ones, so an invalid value is never returned.
 */
export async function geminiStructured<T>(args: {
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema?: object;
  temperature?: number;
}): Promise<StructuredResult<T>> {
  const { $schema: _drop, ...jsonSchema } = (args.jsonSchema ?? z.toJSONSchema(args.schema)) as Record<string, unknown>;
  const temperature = args.temperature ?? 0.3;
  const first = await generate(args.prompt, jsonSchema, temperature);
  const r1 = args.schema.safeParse(first);
  if (r1.success) return { value: r1.data, retried: false, dropped: [] };
  const second = await generate(
    `${args.prompt}\n\nYour previous reply broke these rules. Return the whole JSON again with them fixed:\n${issueList(r1.error.issues)}`,
    jsonSchema,
    temperature,
  );
  const r2 = args.schema.safeParse(second);
  if (r2.success) return { value: r2.data, retried: true, dropped: [] };
  if (!(args.schema instanceof z.ZodObject) || !second || typeof second !== 'object' || Array.isArray(second))
    return { value: {}, retried: true, dropped: ['(root)'] };
  const reply = structuredClone(second as Record<string, unknown>);
  const shape = args.schema.shape as Record<string, z.ZodType>;
  const dropped = prune(reply, args.schema, Object.keys(shape));
  // Required fields may still be missing; the fields that remain are each valid, so keep their parsed form.
  for (const [key, field] of Object.entries(shape)) {
    const r = key in reply ? field.safeParse(reply[key]) : undefined;
    if (r?.success) reply[key] = r.data;
  }
  return { value: reply as Partial<T>, retried: true, dropped };
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
  '- Plan the piece as a reader\'s journey before writing: what the reader knows at the start, what they should know at the end, and one move per section (a finding, how it works, the evidence, what it changes, what is still unknown). Lead with the finding, then the evidence. Cut any sentence that only fills space or repeats an earlier one.',
  '- Explain how things work instead of naming them. Back each claim with the number, name, date or example from the source. Never invent a specific, a quote, an experience or an opinion the source does not contain; if a detail is missing, leave it out.',
  '- Keep the source\'s level of certainty: say "may" only where the source hedges, and say plainly what is unknown.',
  `- Never use these words: ${BANNED_WORDS_EN.join(', ')}; nor these phrases: ${STOCK_PHRASES_EN.map((p) => `"${p}"`).join(', ')}; nor "landscape" as a metaphor, nor "experts say" without naming them.`,
  '- No "not X, but Y" pairs where one half carries the meaning, no lists of three by habit, no closing line that restates the article or predicts a bright future, no rhetorical questions as openers, no exclamation marks, at most one em dash per section, and bold only on the one phrase that matters. Connect ideas through their meaning, not with transition words.',
  '- Vary sentence length because the content varies, not by chopping sentences into fragments. Use plain verbs ("is", "has") rather than "serves as", "boasts", "features".',
  `- Vietnamese: the same rules apply. Never use ${STOCK_PHRASES_VI.map((p) => `"${p}"`).join(', ')}, nor "không chỉ… mà còn…" by habit or translated-sounding noun stacks; write the way a Vietnamese science journalist would.`,
  '- Titles and headings are plain text on one line: no markup, no bracketed English terms, about as long as the English.',
].join('\n');

