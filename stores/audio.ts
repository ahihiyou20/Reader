// Audio reading with the browser's own voices (Web Speech API): free, offline-capable and available
// in all five languages on current phones and desktops. One paragraph is one utterance, so pause,
// skip and seek work per paragraph and long articles do not hit the engines' length limits.
import { create } from 'zustand';
import { LOCALE, type Lang, type Rich } from '@/lib/content/types';
import { useReading } from './reading';

interface AudioState {
  slug: string | null;
  title: string;
  lang: Lang;
  paras: string[];
  /** Paragraph being read. */
  i: number;
  playing: boolean;
  play(track: { slug: string; title: string; lang: Lang; paras: string[] }): void;
  toggle(): void;
  seek(i: number): void;
  stop(): void;
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Paragraphs of a rich block as plain text; reference chips are not read aloud. */
export const speakable = (r: Rich | undefined): string[] =>
  (r ?? []).map((p) => p.filter((n) => n.t !== 'cite').map((n) => n.v).join('').trim()).filter(Boolean);

export function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
}

/** Bumped on every start so callbacks of a cancelled utterance cannot advance the new one. */
let run = 0;

function speak(i: number) {
  const s = useAudio.getState();
  const text = s.paras[i];
  const id = ++run;
  speechSynthesis.cancel();
  if (text === undefined) return useAudio.setState({ playing: false, i: 0 });
  const { rate, voice } = useReading.getState().settings;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LOCALE[s.lang];
  u.rate = rate;
  const chosen = voicesFor(s.lang).find((v) => v.voiceURI === voice[s.lang]);
  if (chosen) u.voice = chosen;
  u.onend = () => {
    if (id !== run) return;
    const next = useAudio.getState().i + 1;
    useAudio.setState({ i: next });
    speak(next);
  };
  u.onerror = (e) => {
    if (id === run && e.error !== 'interrupted' && e.error !== 'canceled') useAudio.setState({ playing: false });
  };
  speechSynthesis.speak(u);
}

export const useAudio = create<AudioState>((set, get) => ({
  slug: null,
  title: '',
  lang: 'en',
  paras: [],
  i: 0,
  playing: false,
  play: (track) => {
    if (!canSpeak() || !track.paras.length) return;
    set({ ...track, i: 0, playing: true });
    speak(0);
  },
  toggle: () => {
    const { playing, i, slug } = get();
    if (!slug) return;
    // Restarting the paragraph is more reliable than speechSynthesis.pause(), which Android ignores.
    if (playing) {
      run++;
      speechSynthesis.cancel();
    } else speak(i);
    set({ playing: !playing });
  },
  seek: (i) => {
    const { paras, playing } = get();
    const to = Math.max(0, Math.min(paras.length - 1, i));
    set({ i: to });
    if (playing) speak(to);
  },
  stop: () => {
    run++;
    if (canSpeak()) speechSynthesis.cancel();
    set({ slug: null, playing: false, paras: [], i: 0 });
  },
}));

/** Apply a new rate or voice to what is being read now. */
export function restartSpeech() {
  const { playing, i } = useAudio.getState();
  if (playing) speak(i);
}
