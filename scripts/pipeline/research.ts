// Source material for an article Reader writes itself (group 4): the page that suggested the topic,
// Wikipedia for background and history, Europe PMC abstracts for research findings, and a Firecrawl
// web search when those are thin. Each source becomes a reference the writer cites with {id}.
// Wikipedia and Europe PMC need no key and cost nothing; Firecrawl hits count against its run cap.
import { readPage } from './adapters/readability';
import { firecrawlSearch } from './firecrawl';
import { ruleFor } from './licenses';
import { httpJson, wordCount } from './lib';

export interface SourceDoc {
  id: string;
  label: string;
  url: string;
  text: string;
}

export interface Brief {
  title: string;
  summary?: string;
  /** The page that suggested the topic, when there is one. */
  url?: string;
  /** Wikipedia search queries (the title when absent). */
  wiki?: string[];
  /** Europe PMC query for research papers (the title when absent). */
  paper?: string;
  category: string;
}

/** Categories where peer-reviewed abstracts usually carry the evidence. */
const PAPER_CATEGORIES = new Set(['science', 'health', 'psychology', 'productivity', 'technology']);
/** Below this much material a 1,000-word article would have to pad; a web search adds more. */
const ENOUGH_WORDS = 2500;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);
const norm = (u: string) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

/** Wikipedia's tail sections are lists of links, not material. */
function trimWikipedia(text: string): string {
  const cut = text.search(/\n\s*(References|See also|Notes|External links|Further reading|Bibliography|Sources|Citations)\s*\n/);
  return (cut > 0 ? text.slice(0, cut) : text).replace(/\n{3,}/g, '\n\n').trim();
}

export async function wikipedia(query: string): Promise<Omit<SourceDoc, 'id'> | null> {
  const q = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '1',
    gsrnamespace: '0',
    prop: 'extracts|info',
    inprop: 'url',
    explaintext: '1',
    redirects: '1',
  });
  try {
    const r = await httpJson<{ query?: { pages?: Array<{ title: string; extract?: string; fullurl?: string }> } }>(`https://en.wikipedia.org/w/api.php?${q}`);
    const page = r.query?.pages?.[0];
    if (!page?.extract || wordCount(page.extract) < 150) return null;
    return { label: `Wikipedia: ${page.title}`, url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, text: clip(trimWikipedia(page.extract), 14_000) };
  } catch (e) {
    console.warn(`wikipedia "${query}": ${(e as Error).message}`);
    return null;
  }
}

interface PmcResult {
  title?: string;
  authorString?: string;
  journalTitle?: string;
  journalInfo?: { journal?: { title?: string } };
  pubYear?: string;
  doi?: string;
  pmid?: string;
  abstractText?: string;
}

export async function europePmc(query: string, n = 2): Promise<Array<Omit<SourceDoc, 'id'>>> {
  const q = new URLSearchParams({ query: `(${query}) AND HAS_ABSTRACT:y AND LANG:eng`, resultType: 'core', format: 'json', pageSize: String(n + 3) });
  try {
    const r = await httpJson<{ resultList?: { result?: PmcResult[] } }>(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${q}`);
    return (r.resultList?.result ?? [])
      .filter((p) => p.abstractText && p.title && (p.doi || p.pmid))
      .slice(0, n)
      .map((p) => {
        const first = p.authorString?.split(',')[0]?.trim().split(' ')[0] ?? 'Anon.';
        const journal = p.journalTitle ?? p.journalInfo?.journal?.title ?? 'Europe PMC';
        const abstract = p.abstractText!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return {
          label: `${first} et al. (${p.pubYear ?? 'n.d.'}), ${journal}`,
          url: p.doi ? `https://doi.org/${p.doi}` : `https://europepmc.org/article/MED/${p.pmid}`,
          text: clip(`${p.title}\n\n${abstract}`, 4_000),
        };
      });
  } catch (e) {
    console.warn(`europepmc "${query}": ${(e as Error).message}`);
    return [];
  }
}

async function seedPage(url: string): Promise<Omit<SourceDoc, 'id'> | null> {
  try {
    const page = await readPage(url, { plain: true });
    const text = page.sections.map((s) => [s.heading, ...s.paragraphs].filter(Boolean).join('\n\n')).join('\n\n');
    // Paywalls and script-only pages leave a teaser: the topic still stands on the other sources.
    if (wordCount(text) < 200) return null;
    const publisher = ruleFor(url)?.publisher ?? page.siteName ?? new URL(url).hostname.replace(/^www\./, '');
    return { label: `${publisher} (${page.year ?? new Date().getFullYear()})`, url, text: clip(text, 16_000) };
  } catch (e) {
    console.warn(`seed ${url}: ${(e as Error).message}`);
    return null;
  }
}

/** Everything the writer may use for one topic, each source with a short reference id. */
export async function gather(b: Brief): Promise<SourceDoc[]> {
  const docs: SourceDoc[] = [];
  const add = (d: Omit<SourceDoc, 'id'> | null, id: string) => {
    if (d && !docs.some((x) => norm(x.url) === norm(d.url))) docs.push({ id, ...d });
  };
  if (b.url) add(await seedPage(b.url), 'source');
  // Two Wikipedia articles at most; the topic's own title is the last search when the hints find fewer.
  const queries = [...new Set([...(b.wiki ?? []).slice(0, 2), b.title])];
  for (const q of queries) {
    const n = docs.filter((d) => d.id.startsWith('wiki')).length;
    if (n >= 2) break;
    add(await wikipedia(q), `wiki${n + 1}`);
  }
  if (PAPER_CATEGORIES.has(b.category)) for (const [i, p] of (await europePmc(b.paper ?? b.title)).entries()) add(p, `paper${i + 1}`);
  const words = docs.reduce((n, d) => n + wordCount(d.text), 0);
  if (words < ENOUGH_WORDS || docs.length < 3) {
    const hits = await firecrawlSearch(b.title, 2);
    for (const [i, h] of hits.entries())
      add({ label: `${h.title.slice(0, 70)} (${new URL(h.url).hostname.replace(/^www\./, '')})`, url: h.url, text: clip(h.markdown, 10_000) }, `web${i + 1}`);
  }
  return docs;
}

export const materialWords = (docs: SourceDoc[]) => docs.reduce((n, d) => n + wordCount(d.text), 0);
