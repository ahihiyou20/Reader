// Gemini free tier (optional), shared by ai-suggest, the daily feeds and the issue intake. Only
// article text is ever sent: never user data (comments, accounts, reading history).
import { http } from './lib';

export const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
/** The free tier allows about 15 requests a minute: keep a gap between calls. */
const GAP_MS = Number(process.env.GEMINI_GAP_MS ?? 4500);

export class QuotaError extends Error {}

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
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Empty Gemini response');
  return JSON.parse(out) as T;
}

export const MARKUP_RULES =
  'Reader markup, which you must keep exactly where it applies: **bold**, *italic*, [y:yellow highlight], [p:pink highlight], [g:green highlight], {reference-id}. Never invent or remove {reference-id} chips, numbers, names or years.';

export const VI_STYLE =
  'Write natural Vietnamese for educated adult readers, not word-for-word. Keep each English technical term in italics in brackets after its first Vietnamese use, e.g. thiên kiến xác nhận (*confirmation bias*).';
