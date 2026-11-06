'use client';
// User actions: optimistic updates in the stores, then the backend (Firestore or local).
import { backendKind, backendStarted, getBackend, isInAppBrowser, onBackendStart, preferRedirect } from '@/lib/backend';
import { BackendError, type AuthUser, type UserData } from '@/lib/backend/types';
import type { Counts, Lang } from '@/lib/content/types';
import { track } from '@/lib/analytics';
import { translate, type MessageKey } from '@/lib/i18n';
import { localDate, nextStreak } from '@/lib/streak';
import { useUI } from '@/stores/ui';
import { useUser } from '@/stores/user';

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(useUI.getState().lang, key, vars);
const toast = (text: string) => text && useUI.getState().showToast(text);

export function errorMessage(e: unknown): string {
  const code = e instanceof BackendError ? e.code : 'unknown';
  if (code === 'cancelled') return '';
  if (code === 'network') return t('noConnection');
  if (code === 'busy') return t('busy');
  if (code === 'in-app-browser') return t('inAppSub');
  return t('signInFailed');
}

// ---------- Session ----------

const CACHE = (uid: string) => `reader.userdata.${uid}`;
const LAST_UID = 'reader.lastUid';
const REFRESH_AFTER = 30 * 60_000;
let started = false;
let currentUid: string | null = null;
const userWaiters: Array<(u: AuthUser) => void> = [];

// Likes and saves written by this device but not yet confirmed. Loaded data can predate them
// (the first tap is what starts the backend), so they are laid over it until the write settles.
const pending = { likes: new Map<string, boolean>(), saves: new Map<string, boolean>() };
function withPending(key: 'likes' | 'saves', list: string[]) {
  const set = new Set(list);
  pending[key].forEach((on, slug) => (on ? set.add(slug) : set.delete(slug)));
  return Object.fromEntries([...set].map((s) => [s, true as const]));
}

function applyData(d: UserData) {
  useUser.setState({
    displayName: d.displayName,
    photoURL: d.photoURL,
    likes: withPending('likes', d.likes),
    saves: withPending('saves', d.saves),
    progress: d.progress,
    readDays: d.readDays,
    streak: d.streak,
    articlesRead: d.articlesRead,
    isModerator: d.isModerator,
  });
}

function snapshotData(): UserData {
  const s = useUser.getState();
  return {
    displayName: s.displayName,
    photoURL: s.photoURL,
    streak: s.streak,
    articlesRead: s.articlesRead,
    likes: Object.keys(s.likes),
    saves: Object.keys(s.saves),
    progress: s.progress,
    readDays: s.readDays,
    isModerator: s.isModerator,
  };
}

function persistCache() {
  const uid = useUser.getState().user?.uid;
  if (!uid) return;
  try {
    localStorage.setItem(CACHE(uid), JSON.stringify({ at: Date.now(), data: snapshotData() }));
    localStorage.setItem(LAST_UID, uid);
  } catch {}
}

/**
 * Show this device's last known reading data (progress, streak, likes) at load, before the backend
 * starts: the feed can put finished articles last and the header can show the streak without Firebase.
 */
export function restoreCachedUser() {
  useUser.setState({ backend: backendKind });
  try {
    const uid = localStorage.getItem(LAST_UID);
    const cached = uid ? (JSON.parse(localStorage.getItem(CACHE(uid)) ?? 'null') as { data: UserData } | null) : null;
    if (cached && !useUser.getState().user) applyData(cached.data);
  } catch {}
}

async function refreshUserData(force = false) {
  const b = await getBackend();
  const uid = useUser.getState().user?.uid;
  if (!uid) return;
  let cached: { at: number; data: UserData } | null = null;
  try {
    cached = JSON.parse(localStorage.getItem(CACHE(uid)) ?? 'null');
  } catch {}
  if (cached) applyData(cached.data);
  if (!force && cached && Date.now() - cached.at < REFRESH_AFTER) return;
  try {
    const fresh = await b.loadUserData();
    if (useUser.getState().user?.uid !== uid) return;
    applyData(fresh);
    persistCache();
  } catch {
    /* offline: keep the cached copy */
  }
}

onBackendStart(startSession);

function startSession() {
  if (started) return;
  started = true;
  useUser.setState({ backend: backendKind });
  getBackend().then((b) => {
    b.start(async (u) => {
      if (!u) {
        useUser.setState({ ready: true, user: null });
        return;
      }
      const changed = u.uid !== currentUid;
      // Counts and submissions belong to an account: drop them when it switches. The first user of
      // the session keeps the deltas of taps made while it loaded (often the tap that started it).
      const switched = changed && currentUid !== null;
      currentUid = u.uid;
      useUser.setState({ user: u, ready: true, ...(switched ? { deltas: {}, live: {}, submissions: null } : {}) });
      if (!useUser.getState().displayName && u.displayName) useUser.setState({ displayName: u.displayName });
      if (!useUser.getState().photoURL && u.photoURL) useUser.setState({ photoURL: u.photoURL });
      userWaiters.splice(0).forEach((fn) => fn(u));
      if (changed) {
        b.ensureProfile(useUI.getState().lang).catch(() => {});
        await refreshUserData(false);
        const lang = useUI.getState().lang;
        b.updateProfile({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lang }).catch(() => {});
      }
    });
    b.completeRedirect()
      .then((r) => {
        if (!r) return;
        if (r.kind === 'merged') toast(t('merged', { name: r.user.displayName ?? '' }));
        else if (r.kind === 'signed-in') toast(t('signedInAs', { name: r.user.displayName ?? '' }));
        if (r.kind === 'merged' || r.kind === 'signed-in') refreshUserData(true);
      })
      .catch((e) => toast(errorMessage(e)));
  });
}

function whenUser(timeout = 10_000): Promise<AuthUser> {
  getBackend(); // a reader action: start the backend if it has not started yet
  const u = useUser.getState().user;
  if (u) return Promise.resolve(u);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new BackendError('network')), timeout);
    userWaiters.push((x) => {
      clearTimeout(timer);
      resolve(x);
    });
  });
}

// ---------- Counters ----------

function bump(slug: string, field: keyof Counts, d: number) {
  useUser.setState((s) => {
    const cur = s.deltas[slug] ?? {};
    return { deltas: { ...s.deltas, [slug]: { ...cur, [field]: (cur[field] ?? 0) + d } } };
  });
}

const liveLoaded = new Set<string>();
export async function loadLiveCounts(slug: string) {
  // Reading alone does not start the backend; until it runs, the build-time counts are shown.
  if (liveLoaded.has(slug) || !backendStarted()) return;
  liveLoaded.add(slug);
  const b = await getBackend();
  const c = await b.getCounts(slug).catch(() => null);
  if (!c) return;
  useUser.setState((s) => {
    const deltas = { ...s.deltas };
    // Live counts include this device's finished writes, not one still in flight (the tap that
    // started the backend), so its delta stays until the next load.
    if (!pending.likes.has(slug) && !pending.saves.has(slug)) delete deltas[slug];
    return { live: { ...s.live, [slug]: c }, deltas };
  });
}

// ---------- Like / save / share ----------

function flip(key: 'likes' | 'saves', slug: string, on: boolean) {
  useUser.setState((s) => {
    const next = { ...s[key] };
    if (on) next[slug] = true;
    else delete next[slug];
    return { [key]: next } as Partial<typeof s>;
  });
}

async function toggle(key: 'likes' | 'saves', slug: string, force?: boolean) {
  const on = force ?? !useUser.getState()[key][slug];
  if (Boolean(useUser.getState()[key][slug]) === on) return;
  flip(key, slug, on);
  bump(slug, key, on ? 1 : -1);
  track(key === 'likes' ? 'like' : 'save', { articleId: slug, on });
  pending[key].set(slug, on);
  try {
    await whenUser();
    const b = await getBackend();
    await (key === 'likes' ? b.setLike(slug, on) : b.setSave(slug, on));
    if (pending[key].get(slug) === on) pending[key].delete(slug);
    // Counts loaded while the write was in flight kept its delta; reload them now it has landed.
    if (liveLoaded.delete(slug)) loadLiveCounts(slug);
    persistCache();
  } catch (e) {
    if (pending[key].get(slug) === on) pending[key].delete(slug);
    flip(key, slug, !on);
    bump(slug, key, on ? -1 : 1);
    // Refused because this device's list is stale (liked or unliked elsewhere): reload the real state.
    if (e instanceof BackendError && e.code === 'permission') refreshUserData(true);
    else toast(errorMessage(e));
  }
}

export const toggleLike = (slug: string, force?: boolean) => toggle('likes', slug, force);
export const toggleSave = (slug: string) => toggle('saves', slug);

export async function shareArticle(slug: string, title: string) {
  const url = `${location.origin}/a/${slug}`;
  let shared = false;
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      shared = true;
    } else {
      await navigator.clipboard.writeText(url);
      toast(t('copied'));
      shared = true;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('copied'));
      shared = true;
    } catch {
      toast(t('shareFailed'));
    }
  }
  if (!shared) return;
  bump(slug, 'shares', 1);
  track('share', { articleId: slug });
  try {
    await whenUser();
    // A reader's shares of one article count once; take back the optimistic +1 for a repeat.
    if (!(await (await getBackend()).addShare(slug))) bump(slug, 'shares', -1);
  } catch {
    /* the share itself worked; the counter is best effort */
  }
}

// ---------- Reading progress, completion, streak ----------

const sectionTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function rememberSection(slug: string, index: number) {
  const prev = useUser.getState().progress[slug]?.lastSection ?? 0;
  useUser.setState((s) => ({ progress: { ...s.progress, [slug]: { ...s.progress[slug], lastSection: index } } }));
  if (index === prev) return;
  clearTimeout(sectionTimers.get(slug));
  sectionTimers.set(
    slug,
    setTimeout(() => {
      sectionTimers.delete(slug);
      persistCache();
      // Scrolling through an article is not a reason to load Firebase: the position waits in the
      // local cache and is saved once the backend starts for something else (once per article).
      if (!progressToSave.size) onBackendStart(saveProgressNow);
      progressToSave.add(slug);
    }, 1000),
  );
}

const progressToSave = new Set<string>();
async function saveProgressNow() {
  const slugs = [...progressToSave];
  progressToSave.clear();
  try {
    await whenUser();
    const b = await getBackend();
    for (const slug of slugs) {
      const last = useUser.getState().progress[slug]?.lastSection;
      if (last !== undefined) await b.saveProgress(slug, last);
    }
  } catch {}
}

const completedToday = new Set<string>();
export async function completeArticle(slug: string) {
  const today = localDate();
  const key = `${slug}@${today}`;
  if (completedToday.has(key)) return;
  completedToday.add(key);
  const s = useUser.getState();
  const next = nextStreak(s.streak, today);
  const wasDone = s.progress[slug]?.completed;
  useUser.setState((st) => ({
    streak: { current: next.current, longest: next.longest, lastReadDate: next.lastReadDate },
    readDays: st.readDays.includes(today) ? st.readDays : [...st.readDays, today],
    articlesRead: st.articlesRead + (wasDone ? 0 : 1),
    progress: { ...st.progress, [slug]: { ...st.progress[slug], completed: true, completedAt: Date.now() } },
    streakBump: next.changed ? st.streakBump + 1 : st.streakBump,
  }));
  track('article_complete', { articleId: slug });
  if (next.changed) {
    toast(t('streakUp', { n: next.current }));
    track('streak_up', { value: next.current });
    try {
      navigator.vibrate?.(10);
    } catch {}
  }
  persistCache();
  try {
    await whenUser();
    await (await getBackend()).completeArticle(slug, today, next);
  } catch {
    completedToday.delete(key);
  }
}

export async function setApplyStep(slug: string, index: number, done: boolean) {
  const cur = useUser.getState().progress[slug]?.applyDone ?? [false, false, false];
  const next = [0, 1, 2].map((i) => (i === index ? done : Boolean(cur[i])));
  const all = next.every(Boolean) && !cur.every(Boolean);
  useUser.setState((s) => ({ progress: { ...s.progress, [slug]: { ...s.progress[slug], applyDone: next } } }));
  if (all) {
    toast(t('appliedToast'));
    track('apply_done', { articleId: slug });
  }
  persistCache();
  try {
    await whenUser();
    await (await getBackend()).setApplyDone(slug, next);
  } catch {}
  return all;
}

// ---------- Account ----------

export function needsGoogle(reason: 'comment' | 'create' | 'generic'): boolean {
  const u = useUser.getState().user;
  if (u && !u.isAnonymous) return false;
  useUI.getState().openSheet({ kind: 'login', reason });
  return true;
}

export async function signInWithGoogle(idToken?: string): Promise<boolean> {
  if (isInAppBrowser()) {
    toast(t('inAppSub'));
    return false;
  }
  useUser.setState({ busy: 'signing-in' });
  try {
    const b = await getBackend();
    await whenUser().catch(() => null);
    const res = idToken && b.signInWithIdToken ? await b.signInWithIdToken(idToken) : await b.signInWithGoogle({ redirect: preferRedirect() });
    if (res.kind === 'cancelled' || res.kind === 'redirecting') return false;
    useUI.getState().closeSheet();
    if (res.kind === 'merged') toast(t('merged', { name: res.user.displayName ?? '' }));
    else toast(t('signedInAs', { name: res.user.displayName ?? '' }));
    useUser.setState({ user: res.user, displayName: res.user.displayName ?? useUser.getState().displayName });
    track('sign_in', { method: idToken ? 'one_tap' : 'google', merged: res.kind === 'merged' });
    await refreshUserData(true);
    return true;
  } catch (e) {
    toast(errorMessage(e));
    return false;
  } finally {
    useUser.setState({ busy: null });
  }
}

export async function signOut() {
  const b = await getBackend();
  const uid = useUser.getState().user?.uid;
  await b.signOut();
  if (uid)
    try {
      localStorage.removeItem(CACHE(uid));
    } catch {}
  useUser.setState({
    likes: {},
    saves: {},
    progress: {},
    readDays: [],
    streak: { current: 0, longest: 0, lastReadDate: null },
    articlesRead: 0,
    isModerator: false,
    displayName: null,
    photoURL: null,
    submissions: null,
    deltas: {},
    live: {},
  });
  currentUid = null;
  useUI.getState().closeOverlay('profile');
  toast(t('signedOut'));
}

export async function updateDisplayName(name: string) {
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  useUser.setState({ displayName: clean });
  try {
    await (await getBackend()).updateProfile({ displayName: clean });
    persistCache();
    toast(t('nameSaved'));
  } catch (e) {
    toast(errorMessage(e));
  }
}

export async function setLanguage(lang: Lang) {
  const { rememberLang } = await import('@/lib/i18n');
  if (useUI.getState().lang === lang) return;
  useUI.getState().setLang(lang);
  rememberLang(lang);
  track('lang_switch', { lang });
  if (useUser.getState().user) (await getBackend()).updateProfile({ lang }).catch(() => {});
}

export async function loadSubmissions() {
  try {
    const list = await (await getBackend()).listMySubmissions();
    useUser.setState({ submissions: list });
  } catch {
    useUser.setState({ submissions: [] });
  }
}

export async function exportMyData() {
  const data = await (await getBackend()).exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `reader-data-${localDate()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function deleteAccount(deleteComments: boolean) {
  try {
    await (await getBackend()).deleteAccount({ deleteComments });
    const uid = useUser.getState().user?.uid;
    if (uid)
      try {
        localStorage.removeItem(CACHE(uid));
      } catch {}
    useUI.getState().closeSheet();
    useUI.getState().closeOverlay('profile');
    toast(t('accountDeleted'));
    return true;
  } catch (e) {
    toast(errorMessage(e));
    return false;
  }
}
