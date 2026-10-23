// Optional step 5 (docs/05): Gemini free tier suggests the Vietnamese version, a KEY POINT, three
// Apply steps, highlights and tags (scripts/pipeline/compose.ts). Only openly licensed article text is
// sent — never user data. Group 3 (CC BY-ND) text is never changed: it only gets Reader's own
// Vietnamese summary. Suggestions are marked ai.reviewed = false, which blocks publishing until an
// editor checks.
//   GEMINI_API_KEY=… pnpm tsx scripts/pipeline/ai-suggest.ts <slug…> | --queue
import path from 'node:path';
import type { ArticleSource } from '../../lib/content/types';
import { enrich } from './compose';
import { QuotaError, hasGemini, requestsUsed } from './gemini';
import { CONTENT, dirs, jobSummary, readJson, writeJson } from './lib';

const MAX_REQUESTS = Number(process.env.GEMINI_MAX_REQUESTS ?? 30);
const QUEUE = path.join(CONTENT, 'ai-queue.json');

async function suggest(slug: string): Promise<'done' | 'skipped'> {
  const file = path.join(dirs.articles, `${slug}.json`);
  const a = await readJson<ArticleSource>(file);
  if (a.origin.group === 5) return 'skipped';
  const fields = await enrich(a);
  if (!fields.length) return 'skipped';
  a.ai = { ...a.ai!, reviewed: false };
  await writeJson(file, a);
  return 'done';
}

async function main() {
  if (!hasGemini()) {
    console.log('GEMINI_API_KEY is not set: skipping AI suggestions (editors write them).');
    return;
  }
  const queue = await readJson<{ pending: string[] }>(QUEUE, { pending: [] });
  const args = process.argv.slice(2);
  const slugs = [...new Set([...(args.includes('--queue') ? queue.pending : []), ...args.filter((a) => !a.startsWith('--'))])];
  const left: string[] = [];
  for (const [i, slug] of slugs.entries()) {
    if (requestsUsed() >= MAX_REQUESTS) {
      left.push(...slugs.slice(i));
      break;
    }
    try {
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
