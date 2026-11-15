// What the reader does, kept to personalise the feed and to show history, stats and collections.
// shortcut: stored in this browser only (localStorage), so it does not follow the account to another
// device; move it behind lib/backend when cross-device sync is wanted.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lang } from '@/lib/content/types';

/** Per category: what the reader did with its articles. */
export interface Signal {
  opens: number;
  completes: number;
  saves: number;
  skips: number;
  /** Reading time in milliseconds. */
  ms: number;
}

export interface HistoryEntry {
  slug: string;
  category: string;
  /** Last opened (epoch ms). */
  at: number;
  ms: number;
  done: boolean;
}

export interface Collection {
  id: string;
  name: string;
  slugs: string[];
}

export interface ReadingSettings {
  /** Body text size in the reading view, px. */
  fontSize: number;
  /** Speech rate for audio reading. */
  rate: number;
  /** Chosen voice (SpeechSynthesisVoice.voiceURI) per language. */
  voice: Partial<Record<Lang, string>>;
}

interface ReadingState {
  topics: string[];
  signals: Record<string, Signal>;
  history: HistoryEntry[];
  collections: Collection[];
  settings: ReadingSettings;
  /** The welcome screen has been seen. */
  welcomed: boolean;
  toggleTopic(id: string): void;
  record(category: string, patch: Partial<Signal>): void;
  visit(slug: string, category: string, ms: number, done?: boolean): void;
  addCollection(name: string): string;
  renameCollection(id: string, name: string): void;
  removeCollection(id: string): void;
  toggleInCollection(id: string, slug: string): void;
  setSettings(patch: Partial<ReadingSettings>): void;
  setWelcomed(v: boolean): void;
  reset(): void;
}

const HISTORY_MAX = 300;
export const ZERO_SIGNAL: Signal = { opens: 0, completes: 0, saves: 0, skips: 0, ms: 0 };
const INITIAL = {
  topics: [] as string[],
  signals: {} as Record<string, Signal>,
  history: [] as HistoryEntry[],
  collections: [] as Collection[],
  settings: { fontSize: 18, rate: 1, voice: {} } as ReadingSettings,
  welcomed: false,
};

export const useReading = create<ReadingState>()(
  persist(
    (set) => ({
      ...INITIAL,
      toggleTopic: (id) => set((s) => ({ topics: s.topics.includes(id) ? s.topics.filter((t) => t !== id) : [...s.topics, id] })),
      record: (category, patch) =>
        set((s) => {
          const cur = s.signals[category] ?? ZERO_SIGNAL;
          const next = { ...cur };
          for (const k of Object.keys(patch) as Array<keyof Signal>) next[k] = Math.max(0, cur[k] + (patch[k] ?? 0));
          return { signals: { ...s.signals, [category]: next } };
        }),
      visit: (slug, category, ms, done) =>
        set((s) => {
          const old = s.history.find((h) => h.slug === slug);
          const entry: HistoryEntry = { slug, category, at: Date.now(), ms: (old?.ms ?? 0) + ms, done: done || old?.done || false };
          return { history: [entry, ...s.history.filter((h) => h.slug !== slug)].slice(0, HISTORY_MAX) };
        }),
      addCollection: (name) => {
        const id = `c${Date.now().toString(36)}`;
        set((s) => ({ collections: [...s.collections, { id, name: name.trim().slice(0, 40), slugs: [] }] }));
        return id;
      },
      renameCollection: (id, name) => set((s) => ({ collections: s.collections.map((c) => (c.id === id ? { ...c, name: name.trim().slice(0, 40) } : c)) })),
      removeCollection: (id) => set((s) => ({ collections: s.collections.filter((c) => c.id !== id) })),
      toggleInCollection: (id, slug) =>
        set((s) => ({
          collections: s.collections.map((c) => (c.id !== id ? c : { ...c, slugs: c.slugs.includes(slug) ? c.slugs.filter((x) => x !== slug) : [slug, ...c.slugs] })),
        })),
      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setWelcomed: (welcomed) => set({ welcomed }),
      // Reading data only: the reader keeps their settings and does not see the welcome again.
      reset: () => set((s) => ({ ...INITIAL, settings: s.settings, welcomed: s.welcomed })),
    }),
    { name: 'pagemoor.reading', version: 1 },
  ),
);
