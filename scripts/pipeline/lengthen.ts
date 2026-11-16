// Lengthen short group 4 and group 5 articles from their sources with Gemini (docs/10), the way the
// Gemini writer writes a researched article: gather() reads the original page, Wikipedia and Europe
// PMC; writeResearched() writes the English from them; translate.ts writes the other languages.
// Groups 1 and 2 keep their adapted text word for word, so they are left to an editor.
//   GEMINI_VIA=agy pnpm tsx scripts/pipeline/lengthen.ts [--limit 10] [slug…]
// An article that does not pass the standard and the prose check afterwards is left as it was.
import path from 'node:path';
import { citedIds } from '../../lib/content/markup';
import type { ArticleSource } from '../../lib/content/types';
import { RESEARCHED_WORDS, applyWritten, writeResearched, writtenWords } from './compose';
import { MODEL, QuotaError, GeminiSetupError, hasGemini } from './gemini';
import { dirs, readJson, writeJson } from './lib';
import { lintProse, plainFieldsOf, proseFields } from './prose-lint';
import { gather, materialWords } from './research';
import { shortArticles } from './short-articles';
import { STANDARDS, articleWords, standardProblems } from './standard';
import { translateInto } from './translate';
import { LANGS } from '../../lib/content/types';

/** Everything the reader saw in English, so the longer article keeps the short one's points. */
const englishOf = (a: ArticleSource) => [a.hook.en, ...a.sections.map((s) => `${s.heading_en ?? ''}\n${s.body_en}`)].join('\n\n').replace(/\{[a-z0-9-]+\}/gi, '');

export async function lengthen(a: ArticleSource): Promise<string> {
  const before = articleWords(a);
  const url = a.origin.originalUrl ?? a.references[0]?.url;
  const sources = await gather({ title: a.title.en, url, wiki: a.tags?.slice(0, 2), category: a.category });
  const material = materialWords(sources);
  if (sources.length < 2 || material < 900) throw new Error(`not enough source material (${sources.length} sources, ${material} words)`);
  const brief = {
    title: a.title.en,
    angle: `A longer version of the short Pagemoor article below: cover every point it makes, then go deeper with the sources. Short article:\n${englishOf(a)}`,
    sources,
    categories: [a.category],
  };
  // The length and markup rules are strict: a reply that misses them is asked for again.
  let w: Awaited<ReturnType<typeof writeResearched>> | undefined;
  for (let i = 0; i < 3 && !w; i++) {
    try {
      w = await writeResearched(brief);
    } catch (e) {
      if (e instanceof QuotaError || e instanceof GeminiSetupError || i === 2) throw e;
    }
  }
  if (!w) throw new Error('no usable reply');
  const words = writtenWords(w);
  if (words < RESEARCHED_WORDS.min) throw new Error(`too short: ${words} words written`);
  const cited = new Set([w.hook_en, w.keyPoint_en, ...w.sections.map((x) => x.body_en)].flatMap((t) => citedIds(t ?? '')));

  // The reader knows the article by its title, cover and place in the feed: those stay.
  const { title, slug, category, cover, publishAt, status } = a;
  a.references = sources.filter((d) => cited.has(d.id)).map(({ id, label, url: u }) => ({ id, label, url: u }));
  applyWritten(a, w, [category]);
  Object.assign(a, { title, slug, category, cover, publishAt, status });
  // Every other language is written again from the new English, glossaries included.
  delete a.glossary;
  delete a.summary;
  if (a.origin.group === 5) a.origin = { group: 4, license: 'Reader-CC-BY-4.0', authors: ['Pagemoor editors'], changes: [] };
  a.ai = { fields: ['written', 'keyPoint', 'applySteps'], reviewed: true, model: MODEL };
  return `${before} → ${articleWords(a)} words, ${a.references.length} sources`;
}

/** One language, tried again when a reply comes back unusable (a section lost or merged). */
async function translateWithRetry(a: ArticleSource, lang: (typeof LANGS)[number]): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      await translateInto(a, lang);
      return true;
    } catch (e) {
      if (e instanceof QuotaError || e instanceof GeminiSetupError) throw e;
    }
  }
  return false;
}

/** English problems that keep a lengthened article from replacing the short one. */
function problems(a: ArticleSource): string[] {
  const out = standardProblems(a, STANDARDS.expanded).filter((p) => !/^(not complete|glossary|cover)/i.test(p));
  for (const lang of ['en'] as const) {
    const fields = proseFields(a, lang);
    for (const f of lintProse(fields, lang, { plainFields: plainFieldsOf(fields) })) out.push(`${f.field}: ${f.rule} “${f.text}”`);
  }
  return out;
}

async function main() {
  if (!hasGemini()) return console.log('No Gemini access (set GEMINI_API_KEY or GEMINI_VIA=agy).');
  const args = process.argv.slice(2);
  const at = args.indexOf('--limit');
  const limit = at >= 0 ? Number(args.splice(at, 2)[1]) : 10;
  const slugs = args.length ? args : (await shortArticles()).filter((s) => s.group === 4 || s.group === 5).slice(0, limit).map((s) => s.slug);
  for (const slug of slugs) {
    const file = path.join(dirs.articles, `${slug}.json`);
    const a = await readJson<ArticleSource>(file);
    if (a.origin.group !== 4 && a.origin.group !== 5) {
      console.log(`${slug}: group ${a.origin.group}, left to an editor`);
      continue;
    }
    try {
      const report = await lengthen(a);
      const found = problems(a);
      if (found.length) {
        console.log(`${slug}: kept short, ${found.length} problems: ${found.slice(0, 3).join(' | ')}`);
        continue;
      }
      // The English is saved first; a language still missing after its retries is filled by the next translate.ts run.
      await writeJson(file, a);
      const failed: string[] = [];
      for (const l of LANGS) {
        if (await translateWithRetry(a, l)) await writeJson(file, a);
        else failed.push(l);
      }
      const left = standardProblems(a, STANDARDS.expanded);
      console.log(`${slug}: ${report}${failed.length ? `; translate.ts must finish ${failed.join(', ')}` : ''}${left.length ? `; standard: ${left.join(' | ')}` : ''}`);
    } catch (e) {
      if (e instanceof QuotaError || e instanceof GeminiSetupError) return console.log(`${(e as Error).message}. Stopped at ${slug}.`);
      console.log(`${slug}: kept short (${(e as Error).message.slice(0, 200)})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
