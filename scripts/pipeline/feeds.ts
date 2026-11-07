// Daily articles (docs/05 §9): read the RSS/Atom feeds in content/feeds.json, keep unseen recent items,
// let triage.ts choose the ones worth an article (rules, then one Gemini scoring call), turn each into
// an article with scripts/pipeline/create.ts, and check its prose (prose-lint.ts, one revision pass).
// The workflow puts the result in one pull request; merging it publishes.
//   pnpm tsx scripts/pipeline/feeds.ts [--limit 20] [--dry-run] [--report report.md]
import fs from 'node:fs/promises';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import type { ArticleSource } from '../../lib/content/types';
import { type Created, type Mode, SkipError, createArticle, modeFor } from './create';
import { reviseProse } from './compose';
import { GeminiSetupError, QuotaError, hasGemini } from './gemini';
import { lintProse, plainFieldsOf, proseFields, type ProseFinding } from './prose-lint';
import { type Candidate, triage } from './triage';
import { CONTENT, dirs, httpText, jobSummary, listJson, readJson, setOutput, writeJson } from './lib';

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  category: string;
  mode: Exclude<Mode, 'auto'>;
  /** Most items taken from this feed per run (default 3). */
  max?: number;
  /** Only items whose title matches (case-insensitive regular expression). */
  include?: string;
  exclude?: string;
  enabled?: boolean;
  /** Verbatim feeds: skip texts longer than this many words. */
  maxWords?: number;
  /** How to find the article link: the Wikipedia "Today's featured article" feed links to a feed page. */
  resolve?: 'wikipedia-featured';
  /** Triage bar for this feed when it is stricter than the default. */
  minScore?: number;
}
export interface FeedConfig {
  maxPerDay: number;
  /** Items older than this are ignored (default 14 days). */
  maxAgeDays?: number;
  triage?: { minScore?: number; perCategory?: number; dupThreshold?: number };
  feeds: FeedSource[];
}
export interface FeedItem {
  title: string;
  url: string;
  date?: Date;
  summary?: string;
}
interface SeenEntry {
  at: string;
  feed: string;
  slug?: string;
  error?: string;
}
type State = { seen: Record<string, SeenEntry> };

/** Links that failed only because Gemini itself was unusable (retired model, bad key, outage) get another try. */
export function forgetGeminiFailures(seen: Record<string, SeenEntry>) {
  for (const [k, v] of Object.entries(seen)) if (v.error && /^Gemini\b/.test(v.error)) delete seen[k];
  return seen;
}

export const CONFIG_FILE = path.join(CONTENT, 'feeds.json');
export const STATE_FILE = path.join(dirs.generated, 'feed-state.json');
const KEEP_SEEN_DAYS = 180;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', cdataPropName: '#cdata', trimValues: true });

const arr = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
function text(x: unknown): string {
  if (x == null) return '';
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  const o = x as Record<string, unknown>;
  return text(o['#cdata'] ?? o['#text'] ?? '');
}
const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** RSS 2.0, RSS 1.0 (RDF) and Atom. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const date = (s: string) => {
    const d = s ? new Date(s) : undefined;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  };
  if (doc.feed) {
    return arr(doc.feed.entry).map((e: Record<string, unknown>) => {
      const links = arr(e.link as Record<string, string> | Record<string, string>[]);
      const link = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
      return {
        title: decode(text(e.title)),
        url: link?.['@_href'] ?? text(e.id),
        date: date(text(e.published) || text(e.updated)),
        summary: decode(text(e.summary) || text(e.content)),
      };
    });
  }
  const items = doc.rss ? arr(doc.rss.channel?.item) : arr(doc['rdf:RDF']?.item);
  return items.map((i: Record<string, unknown>) => ({
    title: decode(text(i.title)),
    url: text(i.link) || text(i.guid),
    date: date(text(i.pubDate) || text(i['dc:date'])),
    summary: decode(text(i.description)),
  }));
}

/** Drop tracking parameters and fragments so the same article is recognised across feeds. */
export function normalizeUrl(u: string): string {
  try {
    // Some feeds escape the query twice (?amp;utm_medium=…).
    const url = new URL(decode(u.trim()).replace(/&amp;|%26amp%3B/gi, '&').replace(/([?&])amp(?:;|%3B)/gi, '$1'));
    url.hash = '';
    for (const k of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|rss$)/i.test(k)) url.searchParams.delete(k);
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, '');
  } catch {
    return u.trim();
  }
}

function resolveLink(feed: FeedSource, item: FeedItem): string {
  if (feed.resolve === 'wikipedia-featured') {
    const m = item.summary?.match(/<b><a href="(\/wiki\/[^"#]+)"/);
    return m ? new URL(m[1], 'https://en.wikipedia.org').toString() : '';
  }
  return item.url;
}

/**
 * Round-robin across feeds: the first unseen item of each feed, then the second… until `limit`.
 * `candidates` maps feed id → its items in feed order (newest first). `capScale` multiplies each
 * feed's `max`; links in `skip` are passed over (used to build a backup queue after the first pick).
 */
export function pickRoundRobin(
  feeds: FeedSource[],
  candidates: Map<string, FeedItem[]>,
  limit: number,
  capScale = 1,
  skip: ReadonlySet<string> = new Set(),
) {
  const picked: Array<{ feed: FeedSource; item: FeedItem }> = [];
  const taken = new Map<string, number>();
  const seen = new Set<string>();
  for (let round = 0; picked.length < limit; round++) {
    let any = false;
    for (const feed of feeds) {
      const items = candidates.get(feed.id) ?? [];
      if (round >= items.length || (taken.get(feed.id) ?? 0) >= (feed.max ?? 3) * capScale) continue;
      any = true;
      const item = items[round];
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      if (skip.has(item.url)) continue;
      picked.push({ feed, item });
      taken.set(feed.id, (taken.get(feed.id) ?? 0) + 1);
      if (picked.length >= limit) break;
    }
    if (!any) break;
  }
  return picked;
}

async function knownArticles(): Promise<{ urls: Set<string>; titles: string[] }> {
  const urls = new Set<string>();
  const titles: string[] = [];
  for (const f of await listJson(dirs.articles)) {
    const a = await readJson<ArticleSource>(path.join(dirs.articles, f));
    if (a.origin.originalUrl) urls.add(normalizeUrl(a.origin.originalUrl));
    titles.push(a.title.en);
  }
  return { urls, titles };
}

const lintArticleProse = (a: ArticleSource): ProseFinding[] =>
  (['en', 'vi'] as const).flatMap((lang) => {
    const fields = proseFields(a, lang);
    return lintProse(fields, lang, { plainFields: plainFieldsOf(fields) });
  });

/** Lint a new article's prose; one Gemini revision pass; what still fails keeps it in review. */
async function checkProse(slug: string): Promise<string[]> {
  const file = path.join(dirs.articles, `${slug}.json`);
  const a = await readJson<ArticleSource>(file);
  let findings = lintArticleProse(a);
  if (findings.length && hasGemini()) {
    await reviseProse(a, findings);
    findings = lintArticleProse(a);
  }
  if (findings.length) a.status = 'review';
  await writeJson(file, a);
  return findings.map((f) => `${f.field}: ${f.rule} “${f.text}”`);
}

/**
 * Feed items in round-robin order (so a fallback without a model stays fair across feeds), then
 * triage. Returns the picks with their feed, best first; the run takes as many as it needs.
 */
export async function selectArticles(
  feeds: FeedSource[],
  candidates: Map<string, FeedItem[]>,
  opts: { limit: number; existingTitles: string[]; categories: string[]; triage?: FeedConfig['triage'] },
) {
  const order = pickRoundRobin(feeds, candidates, opts.limit * 4, 2);
  const byUrl = new Map(order.map((p) => [p.item.url, p]));
  const cands: Candidate[] = order.map(({ feed, item }) => ({
    url: item.url,
    title: item.title,
    summary: item.summary,
    feedId: feed.id,
    category: feed.category === 'auto' ? undefined : feed.category,
  }));
  const { picked, rejected } = await triage(cands, {
    minScore: opts.triage?.minScore ?? 6,
    perCategory: opts.triage?.perCategory ?? 3,
    dupThreshold: opts.triage?.dupThreshold ?? 0.6,
    limit: opts.limit * 2,
    existingTitles: opts.existingTitles,
    categories: opts.categories,
    minScoreByFeed: Object.fromEntries(feeds.filter((f) => f.minScore !== undefined).map((f) => [f.id, f.minScore!])),
  });
  return {
    picked: picked.map((s) => ({ ...byUrl.get(s.url)!, category: s.category, why: `${s.score}/10 ${s.kind}: ${s.reason}` })),
    rejected,
  };
}

const GROUP_LABEL: Record<number, string> = { 1: 'phỏng theo', 2: 'phỏng theo (SA)', 3: 'nguyên văn', 4: 'tự viết', 5: 'tóm tắt + link' };

export function reportTable(rows: Created[]): string {
  if (!rows.length) return '';
  return [
    '| Bài | Kiểu | Từ | Lưu ý |',
    '|-----|------|----|-------|',
    ...rows.map((r) => {
      const notes = r.issues.filter((i) => i.level === 'warning' && i.field !== 'seed').map((i) => i.message);
      return `| [${r.title.replace(/\|/g, '\\|')}](${r.url ?? '#'}) · [preview](${process.env.SITE_URL ?? 'https://reader-xtm.pages.dev'}/preview?slug=${r.slug}) | ${GROUP_LABEL[r.group]}${r.ai.length ? ' · AI' : ''} | ${r.words} | ${notes.join('; ').replace(/\|/g, '/') || '—'} |`;
    }),
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const config = await readJson<FeedConfig>(CONFIG_FILE);
  const limit = Math.min(Number(flag('limit') ?? config.maxPerDay ?? 20), config.maxPerDay ?? 20);
  const dry = args.includes('--dry-run');
  const state = await readJson<State>(STATE_FILE, { seen: {} });
  forgetGeminiFailures(state.seen);
  const cutoff = Date.now() - (config.maxAgeDays ?? 14) * 86400_000;
  const { urls: known, titles } = await knownArticles();
  const categories = (await readJson<Array<{ id: string }>>(path.join(CONTENT, 'categories.json'))).map((c) => c.id);

  const feeds = config.feeds.filter((f) => f.enabled !== false && (f.mode !== 'summary' || hasGemini()));
  const skippedSummary = config.feeds.filter((f) => f.enabled !== false && f.mode === 'summary' && !hasGemini());
  if (skippedSummary.length) console.log(`No GEMINI_API_KEY: skipping summary feeds (${skippedSummary.map((f) => f.id).join(', ')}).`);

  const candidates = new Map<string, FeedItem[]>();
  for (const feed of feeds) {
    try {
      const items = parseFeed(await httpText(feed.url));
      const inc = feed.include ? new RegExp(feed.include, 'i') : null;
      const exc = feed.exclude ? new RegExp(feed.exclude, 'i') : null;
      const fresh: FeedItem[] = [];
      for (const it of items) {
        const url = resolveLink(feed, it);
        if (!url || !/^https?:/.test(url)) continue;
        const key = normalizeUrl(url);
        if (state.seen[key] || known.has(key)) continue;
        if (it.date && it.date.getTime() < cutoff) continue;
        if ((inc && !inc.test(it.title)) || (exc && exc.test(it.title))) continue;
        try {
          modeFor(key, feed.mode);
        } catch (e) {
          console.warn(`${feed.id}: ${(e as Error).message}`);
          break;
        }
        fresh.push({ ...it, url: key });
      }
      candidates.set(feed.id, fresh);
      console.log(`${feed.id}: ${items.length} items, ${fresh.length} new`);
    } catch (e) {
      console.warn(`${feed.id}: feed failed — ${(e as Error).message}`);
    }
  }

  // Triage returns up to twice `limit`: links that fail (too long, no licence, fetch error) are
  // replaced by the next best, so a run still reaches `limit` articles when it can.
  const { picked, rejected } = await selectArticles(feeds, candidates, { limit, existingTitles: titles, categories, triage: config.triage });
  const feedOf = new Map(feeds.flatMap((f) => (candidates.get(f.id) ?? []).map((it) => [it.url, f.id] as const)));
  for (const r of rejected) state.seen[r.url] = { at: new Date().toISOString(), feed: feedOf.get(r.url) ?? '?', error: `triage: ${r.reason}` };
  console.log(`Triage: ${picked.length} picked, ${rejected.length} rejected.`);
  if (dry) {
    for (const p of picked) console.log(`- [${p.feed.id}/${p.feed.mode}] ${p.item.title} (${p.why}) — ${p.item.url}`);
    for (const r of rejected) console.log(`  ✗ ${r.url}: ${r.reason}`);
    return;
  }

  const created: Created[] = [];
  const failed: string[] = [];
  let setupError: Error | undefined;
  const start = Date.now();
  for (const { feed, item, category } of picked) {
    if (created.length >= limit) break;
    try {
      // A minute apart, so the feed keeps the order of this run.
      const publishAt = new Date(start + (limit - created.length) * 60_000).toISOString();
      const c = await createArticle({ url: item.url, category, mode: feed.mode, publishAt, maxWords: feed.maxWords });
      for (const note of await checkProse(c.slug)) c.issues.push({ level: 'warning', field: 'prose', message: `kept in review: ${note}` });
      created.push(c);
      state.seen[item.url] = { at: new Date().toISOString(), feed: feed.id, slug: c.slug };
      console.log(`✓ ${c.slug} (${feed.id})`);
    } catch (e) {
      if (e instanceof GeminiSetupError) {
        // Nothing can succeed until the model or key is fixed; keep the link unseen and fail the run.
        setupError = e;
        console.error(`Stopping: ${e.message}`);
        break;
      }
      if (e instanceof QuotaError || e instanceof SkipError) {
        console.log(`Stopping: ${(e as Error).message}`);
        break;
      }
      const message = (e as Error).message.slice(0, 300);
      state.seen[item.url] = { at: new Date().toISOString(), feed: feed.id, error: message };
      failed.push(`- ${item.title} (${item.url}): ${message}`);
      console.warn(`✗ ${item.url}: ${message}`);
    }
  }

  const keepAfter = Date.now() - KEEP_SEEN_DAYS * 86400_000;
  for (const [k, v] of Object.entries(state.seen)) if (Date.parse(v.at) < keepAfter) delete state.seen[k];
  await writeJson(STATE_FILE, { seen: Object.fromEntries(Object.entries(state.seen).sort(([a], [b]) => a.localeCompare(b))) });

  const report = [
    created.length ? `### ${created.length} bài mới\n\n${reportTable(created)}` : '### Không có bài mới',
    failed.length ? `\n<details><summary>${failed.length} link không dùng được</summary>\n\n${failed.join('\n')}\n</details>` : '',
  ].join('\n');
  console.log(report);
  await jobSummary(report);
  const out = flag('report');
  if (out) await fs.writeFile(out, report + '\n');
  await setOutput('created', String(created.length));
  if (setupError) throw new Error(`Gemini is not usable, set the GEMINI_MODEL variable or check GEMINI_API_KEY: ${setupError.message}`);
}

if (process.argv[1]?.endsWith('feeds.ts'))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });

