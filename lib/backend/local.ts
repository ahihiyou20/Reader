// Local backend: used when Firebase is not configured (dev, forks, previews).
// Everything lives in localStorage on this device; "Google" sign-in is simulated and labelled as demo.
import type { Counts, Lang } from '@/lib/content/types';
import { EMPTY_STREAK, type Streak } from '@/lib/streak';
import type { AuthUser, Backend, CommentDoc, SignInResult, SubmissionDoc, SubmissionInput, UserData } from './types';
import { BackendError, commentLikeId } from './types';

const KEY = 'reader.local.v1';

interface Store {
  user: AuthUser;
  profile: { displayName: string | null; photoURL: string | null; lang?: Lang; streak: Streak; articlesRead: number };
  likes: string[];
  saves: string[];
  progress: UserData['progress'];
  readDays: Record<string, string[]>;
  commentLikes: string[];
  comments: Record<string, CommentDoc[]>;
  deltas: Record<string, Partial<Counts>>;
  submissions: SubmissionDoc[];
}

const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function fresh(): Store {
  return {
    user: { uid: `local-${rid()}`, provider: 'anonymous', isAnonymous: true, displayName: null, photoURL: null, email: null },
    profile: { displayName: null, photoURL: null, streak: { ...EMPTY_STREAK }, articlesRead: 0 },
    likes: [],
    saves: [],
    progress: {},
    readDays: {},
    commentLikes: [],
    comments: {},
    deltas: {},
    submissions: [],
  };
}

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {}
  return fresh();
}

export function createLocalBackend(): Backend {
  let s = load();
  let onUser: ((u: AuthUser | null) => void) | null = null;
  const listeners = new Map<string, Set<(items: CommentDoc[]) => void>>();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  };
  const bump = (slug: string, field: keyof Counts, d: number) => {
    const c = (s.deltas[slug] ??= {});
    c[field] = (c[field] ?? 0) + d;
  };
  const visible = (slug: string) =>
    (s.comments[slug] ?? [])
      .filter((c) => c.status === 'visible')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({ ...c, likedByMe: s.commentLikes.includes(commentLikeId(slug, c.id)) }));
  const emit = (slug: string) => listeners.get(slug)?.forEach((fn) => fn(visible(slug)));
  const requireAccount = () => {
    if (s.user.isAnonymous) throw new BackendError('auth-required');
  };
  const toggle = (list: string[], id: string, on: boolean) => {
    const has = list.includes(id);
    if (on && !has) list.push(id);
    if (!on && has) list.splice(list.indexOf(id), 1);
    return has !== on;
  };

  return {
    kind: 'local',
    start(cb) {
      onUser = cb;
      save();
      queueMicrotask(() => cb(s.user));
      return () => {
        onUser = null;
      };
    },
    async signInWithGoogle(): Promise<SignInResult> {
      s.user = {
        ...s.user,
        provider: 'demo',
        isAnonymous: false,
        displayName: s.profile.displayName ?? 'Demo reader',
        email: null,
      };
      s.profile.displayName = s.user.displayName;
      save();
      onUser?.(s.user);
      return { kind: 'signed-in', user: s.user };
    },
    async completeRedirect() {
      return null;
    },
    async signOut() {
      s = fresh();
      save();
      onUser?.(s.user);
    },
    async loadUserData(): Promise<UserData> {
      return {
        displayName: s.profile.displayName,
        photoURL: s.profile.photoURL,
        lang: s.profile.lang,
        streak: s.profile.streak,
        articlesRead: s.profile.articlesRead,
        likes: [...s.likes],
        saves: [...s.saves],
        progress: structuredClone(s.progress),
        readDays: Object.keys(s.readDays).sort(),
        isModerator: false,
      };
    },
    async ensureProfile(lang) {
      if (!s.profile.lang) {
        s.profile.lang = lang;
        save();
      }
    },
    async setLike(slug, on) {
      if (toggle(s.likes, slug, on)) bump(slug, 'likes', on ? 1 : -1);
      save();
    },
    async setSave(slug, on) {
      if (toggle(s.saves, slug, on)) bump(slug, 'saves', on ? 1 : -1);
      save();
    },
    async addShare(slug) {
      bump(slug, 'shares', 1);
      save();
    },
    async getCounts() {
      return null;
    },
    async listComments(slug) {
      return { items: visible(slug), cursor: null };
    },
    watchComments(slug, fn) {
      let set = listeners.get(slug);
      if (!set) listeners.set(slug, (set = new Set()));
      set.add(fn);
      fn(visible(slug));
      return () => set!.delete(fn);
    },
    async addComment(slug, text, lang) {
      requireAccount();
      const c: CommentDoc = {
        id: rid(),
        slug,
        uid: s.user.uid,
        displayName: s.profile.displayName ?? 'Reader',
        photoURL: s.profile.photoURL,
        text,
        lang,
        status: 'visible',
        createdAt: Date.now(),
        likeCount: 0,
      };
      (s.comments[slug] ??= []).push(c);
      bump(slug, 'comments', 1);
      save();
      emit(slug);
      return c;
    },
    async deleteComment(slug, id) {
      const list = s.comments[slug] ?? [];
      const i = list.findIndex((c) => c.id === id && c.uid === s.user.uid);
      if (i >= 0) {
        list.splice(i, 1);
        bump(slug, 'comments', -1);
      }
      save();
      emit(slug);
    },
    async hideComment() {
      throw new BackendError('permission');
    },
    async setCommentLike(slug, id, on) {
      const c = (s.comments[slug] ?? []).find((x) => x.id === id);
      if (toggle(s.commentLikes, commentLikeId(slug, id), on) && c) c.likeCount += on ? 1 : -1;
      save();
      emit(slug);
    },
    async saveProgress(slug, lastSection) {
      s.progress[slug] = { ...s.progress[slug], lastSection };
      save();
    },
    async completeArticle(slug, today, streak) {
      const wasDone = s.progress[slug]?.completed;
      s.progress[slug] = { ...s.progress[slug], completed: true, completedAt: Date.now() };
      const day = (s.readDays[today] ??= []);
      if (!day.includes(slug)) day.push(slug);
      s.profile.streak = { current: streak.current, longest: streak.longest, lastReadDate: streak.lastReadDate };
      if (!wasDone) s.profile.articlesRead += 1;
      save();
    },
    async setApplyDone(slug, done) {
      s.progress[slug] = { ...s.progress[slug], applyDone: done };
      save();
    },
    async updateProfile(patch) {
      if (patch.displayName !== undefined) {
        s.profile.displayName = patch.displayName;
        s.user = { ...s.user, displayName: patch.displayName };
        onUser?.(s.user);
      }
      if (patch.lang) s.profile.lang = patch.lang;
      save();
    },
    async submitPost(input: SubmissionInput) {
      requireAccount();
      const doc: SubmissionDoc = { ...input, id: rid(), status: 'pending', createdAt: Date.now() };
      s.submissions.unshift(doc);
      save();
      return doc.id;
    },
    async listMySubmissions() {
      return [...s.submissions];
    },
    async exportData() {
      return { exportedAt: new Date().toISOString(), mode: 'local', ...s };
    },
    async deleteAccount({ deleteComments }) {
      for (const slug of Object.keys(s.comments)) {
        for (const c of s.comments[slug]) {
          if (c.uid !== s.user.uid) continue;
          if (deleteComments) c.status = 'hidden';
          else c.displayName = 'Deleted user';
        }
        s.comments[slug] = s.comments[slug].filter((c) => c.status === 'visible');
      }
      const comments = s.comments;
      s = fresh();
      s.comments = comments;
      save();
      onUser?.(s.user);
    },
  };
}

/** Counts added on this device (local mode only), merged on top of the static counts. */
export function localDeltas(): Record<string, Partial<Counts>> {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Store>).deltas ?? {};
  } catch {
    return {};
  }
}
