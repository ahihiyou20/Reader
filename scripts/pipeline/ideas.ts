// Topics Reader can write about when the feeds bring fewer good stories than the day needs: Gemini
// proposes well-documented subjects for the thinnest categories, avoiding what Reader already has,
// and research.ts then finds the sources (Wikipedia, Europe PMC, the web) for each one.
import { z } from 'zod';
import { geminiStructured } from './gemini';
import { slugify } from './lib';
import { KINDS, titleSimilarity } from './triage';

export interface Idea {
  title: string;
  category: string;
  kind: (typeof KINDS)[number];
  angle: string;
  wiki: string[];
  paper?: string;
  photo?: string;
}

/** Key under which an idea is remembered in the feed state, so it is not proposed and written twice. */
export const ideaKey = (title: string) => `idea:${slugify(title)}`;

export async function proposeIdeas(
  n: number,
  opts: { categories: string[]; counts: Record<string, number>; existingTitles: string[]; seen: ReadonlySet<string>; dupThreshold: number },
): Promise<Idea[]> {
  if (n <= 0) return [];
  const schema = z.object({
    items: z.array(
      z.object({
        title: z.string().min(3).max(90),
        category: z.enum(opts.categories as [string, ...string[]]),
        kind: z.enum(KINDS),
        angle: z.string().min(10).max(300),
        wiki: z.array(z.string().min(2).max(80)).min(1).max(2),
        paper: z.string().max(120).optional(),
        photo: z.string().max(80).optional(),
      }),
    ),
  });
  const byNeed = [...opts.categories].sort((a, b) => (opts.counts[a] ?? 0) - (opts.counts[b] ?? 0));
  const prompt = [
    'You plan articles for Reader, a free app of in-depth, sourced articles (about 1,200 words each) for curious general readers.',
    `Propose ${n + 6} topics for new articles. Each must be a well-documented subject with a solid English Wikipedia article and, for science, health, psychology, productivity and technology, peer-reviewed research: a finding, a mechanism, a piece of history, research-backed practical advice or a trend told through data, that a reader would still find worth knowing in a year.`,
    `Spread them over the categories, giving more to those Reader has fewest articles in (fewest first): ${byNeed.map((c) => `${c} (${opts.counts[c] ?? 0})`).join(', ')}. Mix the kinds (${KINDS.join(', ')}).`,
    'No news, politics, people a general reader has no reason to know, products, or topics that would repeat one of the titles below.',
    'title: a working title of at most 12 words. angle: one sentence on what the article will explain. wiki: 1–2 English Wikipedia searches for the background (the general subject, e.g. "Placebo"). paper: a short search for the peer-reviewed research, where it applies. photo: 2–4 concrete English words for an Unsplash cover photo (things a camera can capture).',
    `Reader already has: ${opts.existingTitles.slice(-500).join(' | ')}`,
  ].join('\n\n');
  const { value } = await geminiStructured({ prompt, schema, temperature: 0.8 });
  const known = [...opts.existingTitles];
  const out: Idea[] = [];
  for (const it of value.items ?? []) {
    if (out.length >= n) break;
    if (opts.seen.has(ideaKey(it.title)) || known.some((t) => titleSimilarity(t, it.title) >= opts.dupThreshold)) continue;
    known.push(it.title);
    out.push(it);
  }
  return out;
}
