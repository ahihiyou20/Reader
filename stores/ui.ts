import { create } from 'zustand';
import type { Lang } from '@/lib/content/types';
import type { Stage } from '@/lib/stage';

export type View = 0 | 1 | 2;
export type Overlay = 'explore' | 'search' | 'messages' | 'notifications' | 'profile' | 'create' | 'library' | 'settings';
export type LoginReason = 'comment' | 'create' | 'generic';
export type Sheet =
  | { kind: 'login'; reason: LoginReason }
  | { kind: 'sources'; slug: string; refId?: string }
  | { kind: 'deleteAccount' }
  | { kind: 'collect'; slug: string }
  | null;

interface UIState {
  lang: Lang;
  index: number;
  views: Record<string, View>;
  sections: Record<string, number>;
  overlays: Overlay[];
  sheet: Sheet;
  langMenu: boolean;
  /** The main navigation drawer. */
  navOpen: boolean;
  /** The reader asked to see the welcome again (Settings, the menu's logo): shown even on an article link. */
  introAsked: boolean;
  category: string | null;
  startSlug: string | null;
  feedVersion: number;
  toast: { id: number; text: string; flame?: boolean } | null;
  stage: Stage;
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
  showToast(text: string, flame?: boolean): void;
  setStage(stage: Stage): void;
}

let toastId = 0;
let switchedAt = -1;
/**
 * Go to a tab from the navigation. Tabs are peers, not a stack, so the panel on screen fades back and
 * the new one grows in on the spot (iOS tab switching) instead of both sliding across (Panel).
 */
export function switchTab(id: Overlay) {
  if (useUI.getState().overlays.length) switchedAt = performance.now();
  useUI.setState({ overlays: [id] });
}
export const tabSwitching = () => performance.now() - switchedAt < 150;

export const useUI = create<UIState>((set) => ({
  lang: 'en',
  index: 0,
  views: {},
  sections: {},
  overlays: [],
  sheet: null,
  langMenu: false,
  navOpen: false,
  introAsked: false,
  category: null,
  startSlug: null,
  feedVersion: 0,
  toast: null,
  stage: 'compact-portrait',
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
  showToast: (text, flame) => set({ toast: { id: ++toastId, text, flame } }),
  setStage: (stage) => set((s) => (s.stage === stage ? s : { stage })),
}));
