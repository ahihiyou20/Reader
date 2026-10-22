import { create } from 'zustand';
import type { AuthUser, ProgressDoc, SubmissionDoc } from '@/lib/backend/types';
import type { Counts } from '@/lib/content/types';
import { EMPTY_STREAK, type Streak } from '@/lib/streak';

export interface UserState {
  ready: boolean;
  backend: 'firebase' | 'local';
  user: AuthUser | null;
  displayName: string | null;
  photoURL: string | null;
  likes: Record<string, true>;
  saves: Record<string, true>;
  progress: Record<string, ProgressDoc>;
  readDays: string[];
  streak: Streak;
  articlesRead: number;
  isModerator: boolean;
  submissions: SubmissionDoc[] | null;
  /** Live counters read from Firestore when an article is opened. */
  live: Record<string, Counts>;
  /** Changes made on this device since the base counts were read. */
  deltas: Record<string, Partial<Counts>>;
  /** Bumped every time the streak goes up, to replay the 🔥 animation. */
  streakBump: number;
  busy: null | 'signing-in' | 'merging';
}

export const useUser = create<UserState>(() => ({
  ready: false,
  backend: 'local',
  user: null,
  displayName: null,
  photoURL: null,
  likes: {},
  saves: {},
  progress: {},
  readDays: [],
  streak: { ...EMPTY_STREAK },
  articlesRead: 0,
  isModerator: false,
  submissions: null,
  live: {},
  deltas: {},
  streakBump: 0,
  busy: null,
}));

export const isGoogleUser = (s: UserState) => !!s.user && !s.user.isAnonymous;

/** Counts to show: live counts (or the static ones baked into the feed) plus this device's changes. */
export function countsFor(s: UserState, slug: string, base: Counts): Counts {
  const b = s.live[slug] ?? base;
  const d = s.deltas[slug] ?? {};
  return {
    likes: Math.max(0, b.likes + (d.likes ?? 0)),
    saves: Math.max(0, b.saves + (d.saves ?? 0)),
    shares: Math.max(0, b.shares + (d.shares ?? 0)),
    comments: Math.max(0, b.comments + (d.comments ?? 0)),
  };
}
