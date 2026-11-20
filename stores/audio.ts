// Audio reading with the browser's own voices (Web Speech API): free, offline-capable and available
// in all five languages on current phones and desktops. One paragraph is one utterance, so pause,
// skip and seek work per paragraph and long articles do not hit the engines' length limits. Word
// boundaries keep the place inside a paragraph, so pausing or changing speed resumes mid-paragraph.
import { create } from 'zustand';
import { pick } from '@/lib/i18n';
import { LOCALE, type ArticleClient, type Lang, type Rich } from '@/lib/content/types';
import { useReading } from './reading';

export interface Track {
  slug: string;
  title: string;
  lang: Lang;
  paras: string[];
  /** The language the reader asked for, when this device has no voice for it. */
  missingVoice?: Lang;
}

interface AudioState extends Track {
  /** Paragraph being read. */
  i: number;
  /** Characters of that paragraph already read. */
  offset: number;
  playing: boolean;
  play(track: Track): void;
  toggle(): void;
  seek(i: number): void;
  stop(): void;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Paragraphs of a rich block as plain text; reference chips are not read aloud. */
export const speakable = (r: Rich | undefined): string[] =>
  (r ?? []).map((p) => p.filter((n) => n.t !== 'cite').map((n) => n.v).join('').trim()).filter(Boolean);

/** What is read for an article in a language: title, hook, each heading and body, the key point. */
export function trackFor(article: ArticleClient, lang: Lang): Track {
  // Untranslated blocks fall back to English text, so a partly translated article is read in English.
  // A device with no voice for the language would read it with an English voice, which is gibberish:
  // it reads the English text instead (voices not loaded yet count as present).
  const missing = lang !== 'en' && canSpeak() && speechSynthesis.getVoices().length > 0 && !voicesFor(lang).length;
  const spoken: Lang = article.langs.includes(lang) && !missing ? lang : 'en';
  const at = missing ? 'en' : lang;
  const title = pick(article.title, at) ?? '';
  const paras = [
    title,
    ...speakable(pick(article.hook, at)),
    ...article.sections.flatMap((s) => [pick(s.heading, at) ?? '', ...speakable(pick(s.body, at))]),
    ...speakable(pick(article.keyPoint, at)),
  ].filter(Boolean);
  return { slug: article.slug, title, lang: spoken, paras, ...(missing ? { missingVoice: lang } : {}) };
}

/**
 * Novelty and robotic voices that ship with desktop systems (macOS's old MacinTalk set, the Eloquence
 * set, eSpeak). Nobody listens to an article in them, so they are never offered.
 */
const NOVELTY =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Wobble|Deranged|Fred|Good News|Jester|Hysterical|Junior|Kathy|Organ|Superstar|Princess|Ralph|Trinoids|Whisper|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
const isReal = (v: SpeechSynthesisVoice) =>
  !/speech\.synthesis\.voice|eloquence|espeak/i.test(v.voiceURI) && !NOVELTY.test(v.name) && !/espeak/i.test(v.name);
/** Better recordings first: premium and enhanced voices, then the network voices browsers add, then compact ones. */
const quality = (v: SpeechSynthesisVoice) =>
  /premium/i.test(v.voiceURI + v.name) ? 0 : /enhanced|natural|neural/i.test(v.voiceURI + v.name) ? 1 : !v.localService ? 2 : /super-compact/i.test(v.voiceURI) ? 4 : 3;

/** Real voices for a language, best first; the reader's own region before other accents. */
export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  const region = (typeof navigator !== 'undefined' ? navigator.language : '').split('-')[1]?.toUpperCase();
  const all = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  const real = all.filter(isReal);
  const local = (v: SpeechSynthesisVoice) => (region && v.lang.toUpperCase().endsWith(region) ? 0 : 1);
  return (real.length ? real : all).sort((a, b) => quality(a) - quality(b) || local(a) - local(b) || a.name.localeCompare(b.name));
}

/** "Samantha · English (United States)": the accent matters when a language has several. */
export function voiceLabel(v: SpeechSynthesisVoice, uiLang: Lang): string {
  try {
    const name = new Intl.DisplayNames([LOCALE[uiLang]], { type: 'language' }).of(v.lang.replace('_', '-'));
    return name ? `${v.name} · ${name}` : v.name;
  } catch {
    return v.name;
  }
}

/** Speaking pace at 1×, in characters per second (about 165 words a minute); used for the time readout. */
const CHARS_PER_SECOND = 15;

/** Seconds read and left at the current speed. Estimated: speech engines do not report durations. */
export function timing(s: Pick<AudioState, 'paras' | 'i' | 'offset'>, rate: number): { elapsed: number; total: number } {
  const lengths = s.paras.map((p) => p.length);
  const total = lengths.reduce((a, b) => a + b, 0);
  const done = lengths.slice(0, s.i).reduce((a, b) => a + b, 0) + s.offset;
  const cps = CHARS_PER_SECOND * rate;
  return { elapsed: Math.round(done / cps), total: Math.round(total / cps) };
}

/** Bumped on every start so callbacks of a cancelled utterance cannot advance the new one. */
let run = 0;

/** Speak paragraph `i` from character `from` (the start of a word). */
function speak(i: number, from = 0) {
  const s = useAudio.getState();
  const text = s.paras[i];
  const id = ++run;
  speechSynthesis.cancel();
  if (text === undefined) return useAudio.setState({ playing: false, i: 0, offset: 0 });
  useAudio.setState({ i, offset: from });
  const { rate, voice } = useReading.getState().settings;
  const u = new SpeechSynthesisUtterance(text.slice(from));
  u.lang = LOCALE[s.lang];
  u.rate = rate;
  // The reader's choice, else the best real voice: the engine's default can be a novelty one.
  const voices = voicesFor(s.lang);
  const chosen = voices.find((v) => v.voiceURI === voice[s.lang]) ?? voices[0];
  if (chosen) u.voice = chosen;
  u.onboundary = (e) => {
    if (id === run && e.name !== 'sentence') useAudio.setState({ offset: from + e.charIndex });
  };
  u.onend = () => {
    if (id !== run) return;
    speak(useAudio.getState().i + 1);
  };
  u.onerror = (e) => {
    if (id === run && e.error !== 'interrupted' && e.error !== 'canceled') useAudio.setState({ playing: false });
  };
  speechSynthesis.speak(u);
}

const silence = () => {
  run++;
  if (canSpeak()) speechSynthesis.cancel();
};

export const useAudio = create<AudioState>((set, get) => ({
  slug: '',
  title: '',
  lang: 'en',
  paras: [],
  i: 0,
  offset: 0,
  playing: false,
  play: (track) => {
    if (!canSpeak() || !track.paras.length) return;
    set({ ...track, i: 0, offset: 0, playing: true });
    speak(0);
  },
  toggle: () => {
    const { playing, i, offset, slug } = get();
    if (!slug) return;
    // Cancel and resume at the last word rather than speechSynthesis.pause(), which Android ignores.
    if (playing) silence();
    else speak(i, offset);
    set({ playing: !playing });
  },
  seek: (i) => {
    const { paras, playing } = get();
    const to = Math.max(0, Math.min(paras.length - 1, i));
    set({ i: to, offset: 0 });
    if (playing) speak(to);
  },
  stop: () => {
    silence();
    set({ slug: '', playing: false, paras: [], i: 0, offset: 0 });
  },
}));

/** Apply a new speed or voice from the word being read now, not from the start of the paragraph. */
export function restartSpeech() {
  const { playing, i, offset } = useAudio.getState();
  if (playing) speak(i, offset);
}
