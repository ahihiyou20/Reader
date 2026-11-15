// Tap to understand: the meaning of the word the reader tapped. The bot's glossary (written with the
// article, in context) wins; any other word is looked up on Wiktionary in the reading language.
import type { Lang } from '@/lib/content/types';

export interface Meaning {
  term: string;
  meaning: string;
  source: 'glossary' | 'wiktionary';
  url?: string;
}

const isLetter = (ch: string | undefined) => !!ch && /[\p{L}\p{M}\p{N}'’-]/u.test(ch);

/** The run of letters around `offset` in `text`. */
export function wordAt(text: string, offset: number): { word: string; start: number; end: number } | null {
  let start = Math.min(offset, text.length);
  let end = start;
  while (start > 0 && isLetter(text[start - 1])) start--;
  while (end < text.length && isLetter(text[end])) end++;
  const word = text.slice(start, end).replace(/^['’-]+|['’-]+$/g, '');
  return word ? { word, start, end } : null;
}

/** The longest glossary term whose occurrence in `text` covers `offset` (terms may span several words). */
export function glossaryAt(glossary: Record<string, string> | undefined, text: string, offset: number): Meaning | null {
  if (!glossary) return null;
  const lower = text.toLowerCase();
  let best: Meaning | null = null;
  for (const term of Object.keys(glossary)) {
    for (let i = lower.indexOf(term); i >= 0; i = lower.indexOf(term, i + 1)) {
      const whole = !isLetter(lower[i - 1]) && !isLetter(lower[i + term.length]);
      if (whole && i <= offset && offset <= i + term.length && (!best || term.length > best.term.length))
        best = { term: text.slice(i, i + term.length), meaning: glossary[term], source: 'glossary' };
    }
  }
  return best;
}

const SKIP_HEADING = /etym|étym|etim|pronunc|prononc|phát âm|từ nguyên|aussprache|herkunft|worttrennung/i;
const NOISE = /^\(.*\)$|^(\d+|IPA|Ejemplo|Sinónimo|Sinónimos|Worttrennung|Aussprache|Hörbeispiele|Reime)\b|:\s*$/i;

/** First definition line in a Wiktionary plain-text extract (vi, fr, de, es editions). */
export function firstDefinition(extract: string, word: string): string | null {
  const de = extract.match(/Bedeutungen:\n\[1\]\s*(.+)/);
  if (de) return de[1].trim();
  const w = word.toLowerCase();
  let skipping = false;
  let inEntry = false;
  for (const raw of extract.split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^(=+)\s*(.+?)\s*=+$/);
    if (heading) {
      // A second language section means the first had no usable definition.
      if (heading[1].length === 2 && inEntry) return null;
      if (heading[1].length === 2) inEntry = true;
      skipping = SKIP_HEADING.test(heading[2]);
      continue;
    }
    if (!inEntry || skipping || line.length < 10 || NOISE.test(line)) continue;
    // Headword lines repeat the word with grammar notes ("horizon (h muet) masculin").
    if (line.toLowerCase().startsWith(w)) continue;
    return line.length > 240 ? `${line.slice(0, 237)}…` : line;
  }
  return null;
}

async function wiktionary(word: string, lang: Lang): Promise<Meaning | null> {
  const url = `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  if (lang === 'en') {
    // The English edition has a structured endpoint; the others only give page text.
    const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, Array<{ definitions: Array<{ definition: string }> }>>;
    const html = data.en?.flatMap((e) => e.definitions).find((d) => d.definition.replace(/<[^>]+>/g, '').trim())?.definition;
    const meaning = html && new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim();
    return meaning ? { term: word, meaning, source: 'wiktionary', url } : null;
  }
  const q = new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', format: 'json', origin: '*', titles: word });
  const res = await fetch(`https://${lang}.wiktionary.org/w/api.php?${q}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
  const extract = Object.values(data.query?.pages ?? {})[0]?.extract;
  const meaning = extract && firstDefinition(extract, word);
  return meaning ? { term: word, meaning, source: 'wiktionary', url } : null;
}

const cache = new Map<string, Promise<Meaning | null>>();

/**
 * Look a tapped word up. `candidates` go from most to least specific (Vietnamese words are often two
 * syllables, so the caller offers the pair before the single syllable); lowercase forms are tried too.
 */
export function lookup(candidates: string[], lang: Lang): Promise<Meaning | null> {
  const key = `${lang}:${candidates.join('|')}`;
  if (!cache.has(key))
    cache.set(
      key,
      (async () => {
        for (const c of candidates)
          for (const form of new Set([c, c.toLowerCase()])) {
            const m = await wiktionary(form, lang).catch(() => null);
            if (m) return m;
          }
        return null;
      })(),
    );
  return cache.get(key)!;
}
