import { create } from 'zustand';
import type { Lang } from '@/lib/content/types';

export type View = 0 | 1 | 2;
export type Overlay = 'explore' | 'search' | 'messages' | 'notifications' | 'profile' | 'create';
export type LoginReason = 'comment' | 'create' | 'generic';
export type Sheet =
  | { kind: 'login'; reason: LoginReason }
  | { kind: 'sources'; slug: string; refId?: string }
  | { kind: 'deleteAccount' }
  | null;

interface UIState {
  lang: Lang;
  index: number;
  views: Record<string, View>;
  sections: Record<string, number>;
  overlays: Overlay[];
  sheet: Sheet;
  langMenu: boolean;
  category: string | null;
  startSlug: string | null;
  feedVersion: number;
  toast: { id: number; text: string } | null;
  setLang(lang: Lang): void;
  setIndex(i: number): void;
  setView(slug: string, v: View): void;
  setSection(slug: string, i: number): void;
  openOverlay(o: Overlay): void;
  closeOverlay(o?: Overlay): void;
  openSheet(s: NonNullable<Sheet>): void;
  closeSheet(): void;
  setLangMenu(open: boolean): void;
  startFeed(opts: { category: string | null; slug?: string | null }): void;
  showToast(text: string): void;
}

let toastId = 0;

export const useUI = create<UIState>((set) => ({
  lang: 'en',
  index: 0,
  views: {},
  sections: {},
  overlays: [],
  sheet: null,
  langMenu: false,
  category: null,
  startSlug: null,
  feedVersion: 0,
  toast: null,
  setLang: (lang) => set({ lang }),
  setIndex: (index) => set({ index }),
  setView: (slug, v) => set((s) => (s.views[slug] === v ? s : { views: { ...s.views, [slug]: v } })),
  setSection: (slug, i) => set((s) => (s.sections[slug] === i ? s : { sections: { ...s.sections, [slug]: i } })),
  openOverlay: (o) => set((s) => ({ overlays: [...s.overlays.filter((x) => x !== o), o], langMenu: false })),
  closeOverlay: (o) =>
    set((s) => ({ overlays: o ? s.overlays.filter((x) => x !== o) : s.overlays.slice(0, -1) })),
  openSheet: (sheet) => set({ sheet, langMenu: false }),
  closeSheet: () => set({ sheet: null }),
  setLangMenu: (langMenu) => set({ langMenu }),
  startFeed: ({ category, slug = null }) =>
    set((s) => ({ category, startSlug: slug, index: 0, feedVersion: s.feedVersion + 1, overlays: [] })),
  showToast: (text) => set({ toast: { id: ++toastId, text } }),
}));
