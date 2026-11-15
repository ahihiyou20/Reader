// Tap to understand: the meaning of the word the reader tapped. The bot's glossary (written with the
// article, in context) wins; any other word is looked up on Wiktionary in the reading language.
import type { Lang } from '@/lib/content/types';

export interface Meaning {
  term: string;
  meaning: string;
  source: 'glossary' | 'wiktionary';
  url?: string;
  /** Dictionary form looked up instead of the tapped inflected form. */
  base?: string;
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
  // A label such as "intransitiv:" may come before the first numbered sense.
  const de = extract.match(/Bedeutungen:\n(?:[^\n[]*:\n)?\[1\]\s*(.+)/);
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

type RestDefinitions = Record<string, Array<{ partOfSpeech?: string; definitions: Array<{ definition: string }> }>>;
/** Entries that are not a meaning a reader is after ("run": ISO language code). */
const NOT_A_SENSE = /^(Symbol|Abbreviation|Initialism|Acronym|Letter|Proper noun)$/;

const FORM_OF = 'form-of-definition';
const restUrl = (word: string) => `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;

async function rest(word: string): Promise<RestDefinitions | null> {
  const res = await fetch(restUrl(word));
  return res.ok ? ((await res.json()) as RestDefinitions) : null;
}

/**
 * The dictionary form of an inflected word ("heated" → "heat", "mangé" → "manger", "ging" → "gehen",
 * "comiendo" → "comer"), read from the English Wiktionary, which marks every inflected entry with a
 * link to its lemma in all four languages. Undefined when the word is already a dictionary form.
 */
export function lemmaFrom(data: RestDefinitions | null, lang: Lang, word: string): { lemma: string; pos?: string } | undefined {
  for (const entry of data?.[lang] ?? [])
    for (const d of entry.definitions) {
      if (!d.definition.includes(FORM_OF)) continue;
      const link = d.definition.match(/form-of-definition-link[^>]*>(?:<[^>]+>)*<a [^>]*title="([^"]+)"/);
      if (link && link[1].toLowerCase() !== word.toLowerCase()) return { lemma: link[1], pos: entry.partOfSpeech };
    }
  return undefined;
}

// Sub-senses come as a nested list after the main sense; the main sense is enough for a popover.
const textOf = (html: string) =>
  new DOMParser().parseFromString(html.replace(/<ol[\s\S]*$/, ''), 'text/html').body.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function wiktionary(word: string, lang: Lang, data?: RestDefinitions | null, pos?: string): Promise<Meaning | null> {
  const url = `https://${lang}.wiktionary.org/wiki/${encodeURIComponent(word)}`;
  if (lang === 'en') {
    // The English edition has a structured endpoint; the others only give page text.
    const entries = ((data ?? (await rest(word)))?.en ?? []).filter((e) => !NOT_A_SENSE.test(e.partOfSpeech ?? ''));
    // Same part of speech as the tapped form first: "heated" (verb) means the verb "heat", not the noun.
    const defs = [...entries.filter((e) => e.partOfSpeech === pos), ...entries].flatMap((e) => e.definitions);
    // Skip "simple past of …" lines: the reader wants what the word means.
    const html = defs.find((d) => !d.definition.includes(FORM_OF) && d.definition.replace(/<[^>]+>/g, '').trim())?.definition;
    const meaning = html && textOf(html);
    return meaning ? { term: word, meaning, source: 'wiktionary', url } : null;
  }
  const q = new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', redirects: '1', format: 'json', origin: '*', titles: word });
  const res = await fetch(`https://${lang}.wiktionary.org/w/api.php?${q}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { query?: { pages?: Record<string, { extract?: string }> } };
  const extract = Object.values(json.query?.pages ?? {})[0]?.extract;
  const meaning = extract && firstDefinition(extract, word);
  return meaning ? { term: word, meaning, source: 'wiktionary', url } : null;
}

/** Look up the dictionary form of `word`; `base` records the change so the reader sees it. */
async function define(word: string, lang: Lang): Promise<Meaning | null> {
  // Vietnamese words do not inflect.
  const data = lang === 'vi' ? null : await rest(word).catch(() => null);
  const form = lemmaFrom(data, lang, word);
  if (form) {
    const m = await wiktionary(form.lemma, lang, undefined, form.pos).catch(() => null);
    if (m) return { ...m, term: word, base: form.lemma };
  }
  return wiktionary(word, lang, lang === 'en' ? data : undefined);
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
          for (const form of new Set([c.toLowerCase(), c])) {
            const m = await define(form, lang).catch(() => null);
            if (m) return m;
          }
        return null;
      })(),
    );
  return cache.get(key)!;
}
