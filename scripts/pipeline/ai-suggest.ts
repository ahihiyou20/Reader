// Optional step 5 (docs/05): Gemini free tier suggests the Vietnamese version, a KEY POINT and three
// Apply steps. Only openly licensed article text is sent — never user data. Group 3 (CC BY-ND) is
// skipped. Suggestions are marked ai.reviewed = false, which blocks publishing until an editor checks.
//   GEMINI_API_KEY=… pnpm tsx scripts/pipeline/ai-suggest.ts <slug…> | --queue
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { CONTENT, dirs, http, jobSummary, readJson, writeJson } from './lib';

const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite';
const MAX_REQUESTS = Number(process.env.GEMINI_MAX_REQUESTS ?? 8);
const QUEUE = path.join(CONTENT, 'ai-queue.json');

interface Suggestion {
  title_vi?: string;
  hook_vi?: string;
  sections_vi?: Array<{ heading_vi?: string; body_vi: string }>;
  keyPoint_en?: string;
  keyPoint_vi?: string;
  applySteps_en?: string[];
  applySteps_vi?: string[];
}

class QuotaError extends Error {}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    title_vi: { type: 'STRING' },
    hook_vi: { type: 'STRING' },
    sections_vi: { type: 'ARRAY', items: { type: 'OBJECT', properties: { heading_vi: { type: 'STRING' }, body_vi: { type: 'STRING' } }, required: ['body_vi'] } },
    keyPoint_en: { type: 'STRING' },
    keyPoint_vi: { type: 'STRING' },
    applySteps_en: { type: 'ARRAY', items: { type: 'STRING' } },
    applySteps_vi: { type: 'ARRAY', items: { type: 'STRING' } },
  },
};

function prompt(a: ArticleSource, want: { vi: boolean; keyPoint: boolean; apply: boolean }) {
  return [
    'You help the editors of Reader, a free app of short, sourced articles in English and Vietnamese.',
    'The text uses this markup, which you must keep exactly where it applies: **bold**, *italic*, [y:yellow highlight], [p:pink highlight], [g:green highlight], {reference-id}. Never invent or remove {reference-id} chips, numbers, names or years.',
    want.vi
      ? 'Translate title, hook and every section (heading and body) into natural Vietnamese for educated adult readers. Keep each English technical term in italics in brackets after its first Vietnamese use, e.g. thiên kiến xác nhận (*confirmation bias*). Return sections_vi in the same order and count as the input.'
      : '',
    want.keyPoint
      ? 'Write keyPoint_en (40–60 words): one everyday metaphor plus one question or action the reader can take, with at most one [p:…] highlight and optional *italics*. Also keyPoint_vi, its Vietnamese version.'
      : '',
    want.apply
      ? 'Write applySteps_en: exactly 3 steps, each starting with a verb, each doable in under 10 minutes, based only on the article. Also applySteps_vi.'
      : '',
    'Article JSON:',
    JSON.stringify({ title: a.title.en, hook: a.hook.en, sections: a.sections.map((s) => ({ heading: s.heading_en, body: s.body_en })) }),
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function gemini(text: string): Promise<Suggestion> {
  const res = await http(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: SCHEMA },
      }),
    },
    1,
  );
  if (res.status === 429) throw new QuotaError('Gemini free-tier quota reached');
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const out = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error('Empty Gemini response');
  return JSON.parse(out) as Suggestion;
}

async function suggest(slug: string): Promise<'done' | 'skipped'> {
  const file = path.join(dirs.articles, `${slug}.json`);
  const a = await readJson<ArticleSource>(file);
  if (a.origin.group === 3) return 'skipped';
  const want = {
    vi: !a.title.vi || !a.hook.vi || a.sections.some((s) => !s.body_vi),
    keyPoint: !a.keyPoint?.en,
    apply: !a.applySteps?.en?.length,
  };
  if (!want.vi && !want.keyPoint && !want.apply) return 'skipped';
  const s = await gemini(prompt(a, want));
  const fields: string[] = [];
  if (want.vi) {
    if (s.title_vi && !a.title.vi) a.title.vi = s.title_vi;
    if (s.hook_vi && !a.hook.vi) a.hook.vi = s.hook_vi;
    if (s.sections_vi?.length === a.sections.length)
      a.sections = a.sections.map((sec, i) => ({
        ...sec,
        heading_vi: sec.heading_vi ?? (sec.heading_en ? s.sections_vi![i].heading_vi : undefined),
        body_vi: sec.body_vi ?? s.sections_vi![i].body_vi,
      }));
    fields.push('vi');
  }
  if (want.keyPoint && s.keyPoint_en) {
    a.keyPoint = { en: s.keyPoint_en, ...(s.keyPoint_vi ? { vi: s.keyPoint_vi } : {}) };
    fields.push('keyPoint');
  }
  if (want.apply && s.applySteps_en?.length === 3) {
    a.applySteps = { en: s.applySteps_en, ...(s.applySteps_vi?.length === 3 ? { vi: s.applySteps_vi } : {}) };
    fields.push('applySteps');
  }
  if (a.origin.changes && fields.includes('vi') && !a.origin.changes.includes('translated to Vietnamese')) a.origin.changes.push('translated to Vietnamese');
  a.ai = { fields: [...new Set([...(a.ai?.fields ?? []), ...fields])], reviewed: false, model: MODEL };
  await writeJson(file, a);
  return 'done';
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY is not set: skipping AI suggestions (editors write them).');
    return;
  }
  const queue = await readJson<{ pending: string[] }>(QUEUE, { pending: [] });
  const args = process.argv.slice(2);
  const slugs = [...new Set([...(args.includes('--queue') ? queue.pending : []), ...args.filter((a) => !a.startsWith('--'))])];
  const left: string[] = [];
  let used = 0;
  for (const [i, slug] of slugs.entries()) {
    if (used >= MAX_REQUESTS) {
      left.push(...slugs.slice(i));
      break;
    }
    try {
      used++;
      const r = await suggest(slug);
      console.log(`${slug}: ${r}`);
      await jobSummary(`- ${slug}: ${r}`);
    } catch (e) {
      if (e instanceof QuotaError) {
        console.log(`Quota reached at ${slug}; queued for the next run.`);
        left.push(...slugs.slice(i));
        break;
      }
      console.error(`${slug}: ${(e as Error).message}`);
    }
  }
  await writeJson(QUEUE, { pending: [...new Set(left)] });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
