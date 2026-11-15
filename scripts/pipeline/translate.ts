// Translations (vi, fr, de, es) and the tap-to-understand glossary (all five languages), written by
// Gemini from the English text. One request per article and language. Group 3 (CC BY-ND) text is never
// translated: it gets a summary in each language instead. Only article text is sent, never user data.
//   GEMINI_API_KEY=… pnpm tsx scripts/pipeline/translate.ts [--limit N] [--langs fr,de] [slug…]
// Without slugs it works through every article that still misses something, newest first, and stops
// when the quota or --limit is reached; run it again to continue.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { countWords, plainText } from '../../lib/content/markup';
import { LANG_NAME, LANGS, TLANGS, type ArticleSource, type Lang, type TLang } from '../../lib/content/types';
import { fullLangs, isCleanLine } from '../../lib/content/validate';
import { safeMarkup } from './compose';
import { GeminiSetupError, MARKUP_RULES, MODEL, QuotaError, VI_STYLE, geminiStructured, hasGemini } from './gemini';
import { dirs, jobSummary, listJson, readJson, writeJson } from './lib';

const STYLE: Record<TLang, string> = {
  vi: VI_STYLE,
  fr: 'Write natural French for educated adult readers, not word-for-word, with French typography (space before : ; ? ! and « guillemets »).',
  de: 'Write natural German for educated adult readers, not word-for-word. Address the reader with "du" only where the English addresses "you" directly.',
  es: 'Write natural, neutral international Spanish for educated adult readers, not word-for-word, with opening ¿ and ¡ where needed.',
};

const GLOSSARY_RULE = (lang: Lang) =>
  `glossary: 8–14 entries for readers who tap a word to understand it. term: a word or phrase of 1–3 words copied EXACTLY as it appears in the ${LANG_NAME[lang]} text (no markup) — technical terms, rare words, named concepts, abbreviations. meaning: what it means in this article, in ${LANG_NAME[lang]}, in at most 20 plain words, no markup. Do not explain everyday words.`;

interface Reply {
  title?: string;
  hook?: string;
  sections?: Array<{ heading?: string; body: string }>;
  keyPoint?: string;
  applySteps?: string[];
  summary?: string;
  glossary?: Array<{ term: string; meaning: string }>;
}

const words = (s: string) => countWords(plainText(s));

function replySchema(a: ArticleSource): z.ZodType<Reply> {
  return z.object({
    title: z
      .string()
      .refine((s) => isCleanLine(s.trim(), a.title.en), 'title: one plain line about as long as the English, no markup')
      .optional(),
    hook: z.string().min(1).optional(),
    sections: z
      .array(z.object({ heading: z.string().optional(), body: z.string().min(1) }))
      .length(a.sections.length)
      .superRefine((list, ctx) =>
        list.forEach((x, i) => {
          const en = a.sections[i];
          if (x.heading && !isCleanLine(x.heading.trim(), en.heading_en ?? '')) ctx.addIssue({ code: 'custom', path: [i, 'heading'], message: `heading ${i}: one plain line translating "${en.heading_en ?? ''}"` });
          if (words(x.body) < words(en.body_en) * 0.4) ctx.addIssue({ code: 'custom', path: [i, 'body'], message: `body ${i} must translate the whole section` });
        }),
      )
      .optional(),
    keyPoint: z.string().min(1).optional(),
    applySteps: z.array(z.string().min(1)).optional(),
    summary: z
      .string()
      .refine((s) => words(s) >= 50 && words(s) <= 140, 'summary must be 60–120 words')
      .optional(),
    glossary: z.array(z.object({ term: z.string().min(2).max(60), meaning: z.string().min(3).max(240) })).optional(),
  });
}

/** What `lang` still lacks in this article. */
export function missing(a: ArticleSource, lang: Lang): { text: boolean; summary: boolean; glossary: boolean } {
  const verbatim = a.origin.group === 3;
  return {
    text: lang !== 'en' && !verbatim && !fullLangs(a).includes(lang),
    summary: lang !== 'en' && verbatim && !a.summary?.[lang]?.trim(),
    // Group 3 readers see the English original in every language, so only the English glossary applies.
    glossary: !a.glossary?.[lang] && (!verbatim || lang === 'en'),
  };
}

const textIn = (a: ArticleSource, lang: Lang) => ({
  title: a.title[lang],
  hook: a.hook[lang],
  sections: a.sections.map((s, i) => ({ index: i, heading: s[`heading_${lang}`], body: s[`body_${lang}`] })),
  keyPoint: a.keyPoint?.[lang],
  applySteps: a.applySteps?.[lang],
});

/** Keep glossary entries whose term really occurs in the text; keys are lowercase for lookup on tap. */
export function cleanGlossary(entries: Reply['glossary'], haystack: string): Record<string, string> {
  const text = haystack.toLowerCase();
  const out: Record<string, string> = {};
  for (const e of entries ?? []) {
    const term = e.term.trim().toLowerCase();
    if (term && !/[*[\]{}]/.test(e.meaning) && text.includes(term)) out[term] = e.meaning.trim();
  }
  return out;
}

/** Fill what `lang` lacks. Returns true when the article changed. */
export async function translateInto(a: ArticleSource, lang: Lang): Promise<boolean> {
  const want = missing(a, lang);
  if (!want.text && !want.summary && !want.glossary) return false;
  const name = LANG_NAME[lang];
  const prompt = [
    'You help the editors of Pagemoor, a free, non-commercial app of short, sourced articles.',
    `The text uses ${MARKUP_RULES}`,
    want.text
      ? `Translate the English article below into ${name}: title, hook, every section (heading and body, same order and count as the input), keyPoint and applySteps when present. ${STYLE[lang as TLang]} Keep every markup token around the matching ${name} words and keep each {reference-id} chip unchanged. title and headings are plain text on one line, about as long as the English, with no markup. Leave out fields the input does not have.`
      : '',
    want.summary ? `This article must be republished word for word, so it is not translated. Write summary: Pagemoor's own ${name} summary of it in 60–120 words, in your own words, with no quotation longer than 8 words. ${STYLE[lang as TLang]}` : '',
    want.glossary ? (want.text ? `Then write ${GLOSSARY_RULE(lang)} Take the terms from your own ${name} translation.` : `Write ${GLOSSARY_RULE(lang)} Return only the glossary.`) : '',
    want.text || want.summary ? 'English article JSON:' : `${name} article JSON:`,
    JSON.stringify(textIn(a, want.text || want.summary ? 'en' : lang)),
  ]
    .filter(Boolean)
    .join('\n\n');
  const { value: r } = await geminiStructured<Reply>({ prompt, schema: replySchema(a), temperature: 0.3 });
  const refs = new Map(a.references.map((x) => [x.id, x.label]));
  let changed = false;

  if (want.text && lang !== 'en') {
    const l = lang;
    if (!r.title || !r.hook || r.sections?.length !== a.sections.length) throw new Error(`${a.slug}: unusable ${name} translation`);
    a.title[l] ??= r.title.trim();
    a.hook[l] ??= safeMarkup(r.hook, refs);
    a.sections.forEach((sec, i) => {
      const t = r.sections![i];
      if (sec.heading_en && t.heading?.trim()) sec[`heading_${l}`] ??= t.heading.trim();
      sec[`body_${l}`] ??= safeMarkup(t.body, refs);
    });
    if (a.keyPoint?.en && r.keyPoint?.trim()) a.keyPoint[l] ??= safeMarkup(r.keyPoint, refs);
    if (a.applySteps?.en.length && r.applySteps?.length === a.applySteps.en.length) a.applySteps[l] ??= r.applySteps.map((s) => s.trim());
    changed = true;
  }
  if (want.summary && lang !== 'en' && r.summary?.trim()) {
    a.summary = { ...a.summary, [lang]: safeMarkup(r.summary, refs) };
    changed = true;
  }
  if (want.glossary) {
    const t = textIn(a, lang);
    const haystack = plainText([t.title, t.hook, ...t.sections.flatMap((s) => [s.heading, s.body]), t.keyPoint, ...(t.applySteps ?? [])].filter(Boolean).join('\n'), refs);
    const g = cleanGlossary(r.glossary, haystack);
    // An empty glossary is still recorded, so the article is not asked again on every run.
    if (r.glossary) {
      a.glossary = { ...a.glossary, [lang]: g };
      changed = true;
    }
  }
  if (changed) a.ai = { fields: [...new Set([...(a.ai?.fields ?? []), lang])], reviewed: a.ai?.reviewed ?? false, model: MODEL };
  return changed;
}

/** Every language in turn; a quota error passes through so the caller can stop and resume later. */
export async function translateAll(a: ArticleSource, langs: Lang[] = LANGS): Promise<Lang[]> {
  const done: Lang[] = [];
  for (const l of langs) if (await translateInto(a, l)) done.push(l);
  return done;
}

const pending = (a: ArticleSource, langs: Lang[]) => langs.some((l) => Object.values(missing(a, l)).some(Boolean));

async function main() {
  if (!hasGemini()) return console.log('No Gemini access (set GEMINI_API_KEY or GEMINI_VIA=agy): nothing translated.');
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const limit = Number(opt('--limit') ?? Infinity);
  const langs = (opt('--langs')?.split(',') as Lang[] | undefined)?.filter((l) => LANGS.includes(l)) ?? LANGS;
  const files = args.length ? args.map((s) => path.join(dirs.articles, `${s}.json`)) : (await listJson(dirs.articles)).map((f) => path.join(dirs.articles, f));
  const all = await Promise.all(files.map(async (f) => ({ f, a: await readJson<ArticleSource>(f) })));
  // Published and newest first: readers meet those first.
  const todo = all
    .filter(({ a }) => a.status === 'published' && pending(a, langs))
    .sort((x, y) => (y.a.publishAt ?? '').localeCompare(x.a.publishAt ?? ''))
    .slice(0, limit);
  console.log(`${todo.length} of ${all.length} articles need work in ${langs.join(', ')}`);
  let ok = 0;
  for (const { f, a } of todo) {
    try {
      for (const l of langs) {
        // Saved after every language, so an interrupted run loses at most one request.
        if (await translateInto(a, l)) await writeJson(f, a);
      }
      ok++;
      console.log(`${a.slug}: ${fullLangs(a).join(' ')}`);
    } catch (e) {
      if (e instanceof QuotaError || e instanceof GeminiSetupError) {
        console.log(`${(e as Error).message}. Stopped at ${a.slug}; run again to continue.`);
        break;
      }
      console.error(`${a.slug}: ${(e as Error).message}`);
    }
  }
  await jobSummary(`Translated ${ok} of ${todo.length} pending articles (${TLANGS.join(', ')} + glossary).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
