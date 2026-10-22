// Firebase backend (Spark plan, no Cloud Functions): docs/06 §3 and docs/07.
// Loaded lazily so the feed paints before the Firebase SDK arrives.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  deleteUser,
  getAuth,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
  type Auth,
  type AuthCredential,
  type User,
} from 'firebase/auth';
import {
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from 'firebase/firestore';
import type { Counts, Lang } from '@/lib/content/types';
import { env } from '@/lib/env';
import { EMPTY_STREAK, localDate, streakFromDays, type Streak } from '@/lib/streak';
import type {
  AuthUser,
  Backend,
  CommentDoc,
  CommentPage,
  ProgressDoc,
  SignInResult,
  SubmissionDoc,
  SubmissionInput,
  UserData,
} from './types';
import { BackendError, commentLikeId } from './types';

const PENDING_MERGE = 'reader.pendingMerge';
const REDIRECTING = 'reader.redirecting';

interface GuestSnapshot {
  fromUid: string;
  at: number;
  likes: string[];
  saves: string[];
  progress: Record<string, ProgressDoc>;
  readDays: Record<string, string[]>;
  streak: Streak;
  articlesRead: number;
}

function code(e: unknown): string {
  return (e as { code?: string })?.code ?? '';
}

export function mapError(e: unknown): BackendError {
  const c = code(e);
  if (e instanceof BackendError) return e;
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request' || c === 'auth/user-cancelled')
    return new BackendError('cancelled', undefined, c);
  if (c === 'auth/network-request-failed' || c === 'unavailable' || c === 'firestore/unavailable')
    return new BackendError('network', undefined, c);
  if (c === 'resource-exhausted' || c === 'firestore/resource-exhausted' || c === 'auth/quota-exceeded')
    return new BackendError('busy', undefined, c);
  if (c === 'permission-denied' || c === 'firestore/permission-denied') return new BackendError('permission', undefined, c);
  if (c === 'auth/web-storage-unsupported' || c === 'auth/operation-not-supported-in-this-environment')
    return new BackendError('in-app-browser', undefined, c);
  return new BackendError('unknown', (e as Error)?.message, c || undefined);
}

function mapUser(u: User): AuthUser {
  const google = u.providerData.find((p) => p.providerId === 'google.com');
  return {
    uid: u.uid,
    provider: u.isAnonymous ? 'anonymous' : 'google',
    isAnonymous: u.isAnonymous,
    displayName: u.displayName ?? google?.displayName ?? null,
    photoURL: u.photoURL ?? google?.photoURL ?? null,
    email: u.email ?? google?.email ?? null,
  };
}

function toMillis(v: unknown): number {
  const t = v as { toMillis?: () => number } | null;
  return t?.toMillis ? t.toMillis() : typeof v === 'number' ? v : Date.now();
}

function store<T>(key: string, value: T | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

/** Splits writes into batches of at most 450 operations. */
class Batcher {
  private batches: WriteBatch[] = [];
  private n = 0;
  constructor(private db: Firestore) {}
  get batch(): WriteBatch {
    if (!this.batches.length || this.n >= 450) {
      this.batches.push(writeBatch(this.db));
      this.n = 0;
    }
    this.n++;
    return this.batches[this.batches.length - 1];
  }
  async commit() {
    for (const b of this.batches) await b.commit();
  }
}

export function createFirebaseBackend(): Backend {
  const app: FirebaseApp = initializeApp({
    apiKey: env.firebase.apiKey,
    authDomain: env.firebase.authDomain,
    projectId: env.firebase.projectId,
    appId: env.firebase.appId,
    ...(env.firebase.measurementId ? { measurementId: env.firebase.measurementId } : {}),
  });
  const auth: Auth = getAuth(app);
  const db: Firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (env.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  if (env.recaptchaSiteKey && !env.useEmulators) {
    import('firebase/app-check')
      .then(({ initializeAppCheck, ReCaptchaV3Provider }) =>
        initializeAppCheck(app, { provider: new ReCaptchaV3Provider(env.recaptchaSiteKey), isTokenAutoRefreshEnabled: true }),
      )
      .catch(() => {});
  }

  const provider = () => {
    const p = new GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    return p;
  };
  const me = () => {
    const u = auth.currentUser;
    if (!u) throw new BackendError('auth-required');
    return u;
  };
  const requireGoogle = () => {
    const u = me();
    if (u.isAnonymous) throw new BackendError('auth-required');
    return u;
  };
  const userRef = (uid: string) => doc(db, 'users', uid);
  const sub = (uid: string, name: string, id: string) => doc(db, 'users', uid, name, id);
  const counterRef = (slug: string) => doc(db, 'counters', slug);

  let signingOut = false;
  let redirectWork: Promise<SignInResult | null> = Promise.resolve(null);

  async function snapshotGuest(uid: string): Promise<GuestSnapshot> {
    const [userSnap, likes, saves, progress, days] = await Promise.all([
      getDoc(userRef(uid)),
      getDocs(collection(db, 'users', uid, 'likes')),
      getDocs(collection(db, 'users', uid, 'saves')),
      getDocs(collection(db, 'users', uid, 'progress')),
      getDocs(collection(db, 'users', uid, 'readDays')),
    ]);
    const u = userSnap.data() ?? {};
    const snap: GuestSnapshot = {
      fromUid: uid,
      at: Date.now(),
      likes: likes.docs.map((d) => d.id),
      saves: saves.docs.map((d) => d.id),
      progress: Object.fromEntries(progress.docs.map((d) => [d.id, progressFrom(d.data())])),
      readDays: Object.fromEntries(days.docs.map((d) => [d.id, (d.data().slugs as string[]) ?? []])),
      streak: (u.streak as Streak) ?? { ...EMPTY_STREAK },
      articlesRead: (u.stats?.articlesRead as number) ?? 0,
    };
    store(PENDING_MERGE, snap);
    return snap;
  }

  function progressFrom(d: DocumentData): ProgressDoc {
    return {
      lastSection: d.lastSection,
      completed: d.completed,
      completedAt: d.completedAt ? toMillis(d.completedAt) : undefined,
      applyDone: d.applyDone,
    };
  }

  async function writeProfileAfterGoogle(u: User) {
    const ref = userRef(u.uid);
    const snap = await getDoc(ref);
    const mapped = mapUser(u);
    if (!snap.exists()) await createProfile(u.uid, mapped, undefined);
    else
      await updateDoc(ref, {
        isAnonymous: false,
        displayName: snap.data().displayName ?? mapped.displayName,
        photoURL: mapped.photoURL,
        lastActiveAt: serverTimestamp(),
      });
  }

  async function createProfile(uid: string, u: AuthUser, lang: Lang | undefined) {
    await setDoc(userRef(uid), {
      displayName: u.displayName,
      photoURL: u.photoURL,
      isAnonymous: u.isAnonymous,
      lang: lang ?? (navigator.language?.toLowerCase().startsWith('vi') ? 'vi' : 'en'),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
      streak: { ...EMPTY_STREAK },
      stats: { articlesRead: 0 },
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    });
  }

  /** docs/07 §3.2 B: the Google account already exists, so copy the guest's data into it. */
  async function mergeGuest(g: GuestSnapshot, target: User) {
    const uid = target.uid;
    await writeProfileAfterGoogle(target);
    const [userSnap, likes, saves, progress, days] = await Promise.all([
      getDoc(userRef(uid)),
      getDocs(collection(db, 'users', uid, 'likes')),
      getDocs(collection(db, 'users', uid, 'saves')),
      getDocs(collection(db, 'users', uid, 'progress')),
      getDocs(collection(db, 'users', uid, 'readDays')),
    ]);
    const have = {
      likes: new Set(likes.docs.map((d) => d.id)),
      saves: new Set(saves.docs.map((d) => d.id)),
      progress: new Map(progress.docs.map((d) => [d.id, progressFrom(d.data())])),
      days: new Map(days.docs.map((d) => [d.id, (d.data().slugs as string[]) ?? []])),
    };
    const b = new Batcher(db);
    // Counters are not touched: the guest's likes were already counted once.
    for (const slug of g.likes) if (!have.likes.has(slug)) b.batch.set(sub(uid, 'likes', slug), { slug, createdAt: serverTimestamp() });
    for (const slug of g.saves) if (!have.saves.has(slug)) b.batch.set(sub(uid, 'saves', slug), { slug, createdAt: serverTimestamp() });
    let completed = 0;
    const allProgress = new Map(have.progress);
    for (const [slug, p] of Object.entries(g.progress)) {
      const cur = have.progress.get(slug) ?? {};
      const merged: ProgressDoc = {
        lastSection: Math.max(cur.lastSection ?? 0, p.lastSection ?? 0),
        completed: Boolean(cur.completed || p.completed),
        applyDone: [0, 1, 2].map((i) => Boolean(cur.applyDone?.[i] || p.applyDone?.[i])),
      };
      allProgress.set(slug, merged);
      b.batch.set(sub(uid, 'progress', slug), merged, { merge: true });
    }
    for (const p of allProgress.values()) if (p.completed) completed++;
    for (const [day, slugs] of Object.entries(g.readDays)) {
      if (slugs.length) b.batch.set(sub(uid, 'readDays', day), { slugs: arrayUnion(...slugs) }, { merge: true });
    }
    // Rebuild the streak from the union of reading days, within what the Rules allow (same, +1 or 1).
    const today = localDate();
    const union = [...new Set([...have.days.keys(), ...Object.keys(g.readDays)])];
    const rebuilt = streakFromDays(union, today);
    const current: Streak = (userSnap.data()?.streak as Streak) ?? { ...EMPTY_STREAK };
    let next: Streak = current;
    if (rebuilt.current === current.current || rebuilt.current === current.current + 1 || rebuilt.current === 1)
      next = { ...rebuilt, longest: Math.max(rebuilt.longest, current.longest, g.streak.longest) };
    else if (rebuilt.current > current.current && rebuilt.lastReadDate)
      next = { current: current.current + 1, longest: Math.max(current.longest, current.current + 1, g.streak.longest), lastReadDate: rebuilt.lastReadDate };
    b.batch.update(userRef(uid), { streak: next, 'stats.articlesRead': Math.max(completed, userSnap.data()?.stats?.articlesRead ?? 0) });
    await b.commit();
    store(PENDING_MERGE, null);
  }

  async function finishWithCredential(credential: AuthCredential | null, err: unknown): Promise<SignInResult> {
    if (!credential) throw mapError(err);
    const guestUid = auth.currentUser?.uid;
    const guest = read<GuestSnapshot>(PENDING_MERGE) ?? (guestUid ? await snapshotGuest(guestUid) : null);
    const res = await signInWithCredential(auth, credential);
    if (guest) await mergeGuest(guest, res.user);
    return { kind: 'merged', user: mapUser(res.user) };
  }

  async function handleRedirect(): Promise<SignInResult | null> {
    if (!sessionStorage.getItem(REDIRECTING)) return null;
    sessionStorage.removeItem(REDIRECTING);
    try {
      const res = await getRedirectResult(auth);
      if (!res) return null;
      await writeProfileAfterGoogle(res.user);
      store(PENDING_MERGE, null);
      return { kind: 'signed-in', user: mapUser(res.user) };
    } catch (e) {
      if (code(e) === 'auth/credential-already-in-use' || code(e) === 'auth/email-already-in-use')
        return finishWithCredential(GoogleAuthProvider.credentialFromError(e as never), e);
      throw mapError(e);
    }
  }

  const api: Backend = {
    kind: 'firebase',

    start(onUser) {
      let active = true;
      (async () => {
        await auth.authStateReady();
        redirectWork = handleRedirect().catch((e) => {
          throw mapError(e);
        });
        await redirectWork.catch(() => null);
        if (!auth.currentUser) await signInAnonymously(auth).catch(() => onUser(null));
      })();
      const off = onAuthStateChanged(auth, (u) => {
        if (!active) return;
        if (u) onUser(mapUser(u));
        else if (signingOut) {
          signingOut = false;
          signInAnonymously(auth).catch(() => onUser(null));
        }
      });
      return () => {
        active = false;
        off();
      };
    },

    async completeRedirect() {
      return redirectWork;
    },

    async signInWithGoogle(opts = {}) {
      const user = auth.currentUser;
      try {
        if (user?.isAnonymous) {
          if (opts.redirect) {
            await snapshotGuest(user.uid);
            sessionStorage.setItem(REDIRECTING, '1');
            await linkWithRedirect(user, provider());
            return { kind: 'redirecting' };
          }
          try {
            const res = await linkWithPopup(user, provider());
            await writeProfileAfterGoogle(res.user);
            return { kind: 'signed-in', user: mapUser(res.user) };
          } catch (e) {
            const c = code(e);
            if (c === 'auth/credential-already-in-use' || c === 'auth/email-already-in-use') {
              await snapshotGuest(user.uid);
              return finishWithCredential(GoogleAuthProvider.credentialFromError(e as never), e);
            }
            if (c === 'auth/popup-blocked') return api.signInWithGoogle({ redirect: true });
            throw e;
          }
        }
        if (opts.redirect) {
          sessionStorage.setItem(REDIRECTING, '1');
          await signInWithRedirect(auth, provider());
          return { kind: 'redirecting' };
        }
        const res = await signInWithPopup(auth, provider());
        await writeProfileAfterGoogle(res.user);
        return { kind: 'signed-in', user: mapUser(res.user) };
      } catch (e) {
        const err = mapError(e);
        if (err.code === 'cancelled') return { kind: 'cancelled' };
        throw err;
      }
    },

    async signInWithIdToken(idToken) {
      const credential = GoogleAuthProvider.credential(idToken);
      const user = auth.currentUser;
      try {
        if (user?.isAnonymous) {
          try {
            const res = await linkWithCredential(user, credential);
            await writeProfileAfterGoogle(res.user);
            return { kind: 'signed-in', user: mapUser(res.user) };
          } catch (e) {
            const c = code(e);
            if (c === 'auth/credential-already-in-use' || c === 'auth/email-already-in-use') {
              await snapshotGuest(user.uid);
              return finishWithCredential(GoogleAuthProvider.credentialFromError(e as never) ?? credential, e);
            }
            throw e;
          }
        }
        const res = await signInWithCredential(auth, credential);
        await writeProfileAfterGoogle(res.user);
        return { kind: 'signed-in', user: mapUser(res.user) };
      } catch (e) {
        throw mapError(e);
      }
    },

    async signOut() {
      signingOut = true;
      await fbSignOut(auth);
    },

    async ensureProfile(lang) {
      const u = me();
      try {
        const snap = await getDoc(userRef(u.uid));
        if (!snap.exists()) await createProfile(u.uid, mapUser(u), lang);
      } catch (e) {
        throw mapError(e);
      }
    },

    async loadUserData(): Promise<UserData> {
      const u = me();
      try {
        const [profile, likes, saves, progress, days, mod] = await Promise.all([
          getDoc(userRef(u.uid)),
          getDocs(collection(db, 'users', u.uid, 'likes')),
          getDocs(collection(db, 'users', u.uid, 'saves')),
          getDocs(collection(db, 'users', u.uid, 'progress')),
          getDocs(query(collection(db, 'users', u.uid, 'readDays'), orderBy(documentId(), 'desc'), limit(60))),
          u.isAnonymous ? Promise.resolve(null) : getDoc(doc(db, 'moderators', u.uid)).catch(() => null),
        ]);
        const p = profile.data() ?? {};
        return {
          displayName: (p.displayName as string) ?? u.displayName,
          photoURL: (p.photoURL as string) ?? u.photoURL,
          lang: p.lang as Lang | undefined,
          streak: (p.streak as Streak) ?? { ...EMPTY_STREAK },
          articlesRead: (p.stats?.articlesRead as number) ?? 0,
          likes: likes.docs.map((d) => d.id),
          saves: saves.docs.map((d) => d.id),
          progress: Object.fromEntries(progress.docs.map((d) => [d.id, progressFrom(d.data())])),
          readDays: days.docs.map((d) => d.id).sort(),
          isModerator: Boolean(mod?.exists()),
        };
      } catch (e) {
        throw mapError(e);
      }
    },

    async setLike(slug, on) {
      const u = me();
      const b = writeBatch(db);
      if (on) b.set(sub(u.uid, 'likes', slug), { slug, createdAt: serverTimestamp() });
      else b.delete(sub(u.uid, 'likes', slug));
      b.set(counterRef(slug), { likes: increment(on ? 1 : -1) }, { merge: true });
      await b.commit().catch((e) => {
        throw mapError(e);
      });
    },

    async setSave(slug, on) {
      const u = me();
      const b = writeBatch(db);
      if (on) b.set(sub(u.uid, 'saves', slug), { slug, createdAt: serverTimestamp() });
      else b.delete(sub(u.uid, 'saves', slug));
      b.set(counterRef(slug), { saves: increment(on ? 1 : -1) }, { merge: true });
      await b.commit().catch((e) => {
        throw mapError(e);
      });
    },

    async addShare(slug) {
      me();
      await setDoc(counterRef(slug), { shares: increment(1) }, { merge: true }).catch((e) => {
        throw mapError(e);
      });
    },

    async getCounts(slug) {
      try {
        const snap = await getDoc(counterRef(slug));
        if (!snap.exists()) return null;
        const d = snap.data();
        return { likes: d.likes ?? 0, saves: d.saves ?? 0, shares: d.shares ?? 0, comments: d.comments ?? 0 } as Counts;
      } catch {
        return null;
      }
    },

    async listComments(slug, cursor, pageSize = 20): Promise<CommentPage> {
      try {
        const base = collection(db, 'comments', slug, 'items');
        const q = cursor
          ? query(base, where('status', '==', 'visible'), orderBy('createdAt', 'desc'), startAfter(cursor as DocumentSnapshot), limit(pageSize))
          : query(base, where('status', '==', 'visible'), orderBy('createdAt', 'desc'), limit(pageSize));
        const [snap, liked] = await Promise.all([getDocs(q), myCommentLikes(slug)]);
        return {
          items: snap.docs.map((d) => toComment(slug, d, liked)),
          cursor: snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1] : null,
        };
      } catch (e) {
        throw mapError(e);
      }
    },

    watchComments(slug, onChange, pageSize = 20) {
      let liked = new Set<string>();
      let latest: QueryDocumentSnapshot[] = [];
      myCommentLikes(slug)
        .then((s) => {
          liked = s;
          onChange(latest.map((d) => toComment(slug, d, liked)));
        })
        .catch(() => {});
      const q = query(
        collection(db, 'comments', slug, 'items'),
        where('status', '==', 'visible'),
        orderBy('createdAt', 'desc'),
        limit(pageSize),
      );
      return onSnapshot(
        q,
        { includeMetadataChanges: false },
        (snap) => {
          latest = snap.docs;
          onChange(snap.docs.map((d) => toComment(slug, d, liked)));
        },
        () => {},
      );
    },

    async addComment(slug, text, lang) {
      const u = requireGoogle();
      const profile = await getDoc(userRef(u.uid)).catch(() => null);
      const name = (profile?.data()?.displayName as string) || u.displayName || 'Reader';
      const ref = doc(collection(db, 'comments', slug, 'items'));
      const b = writeBatch(db);
      const data = { uid: u.uid, displayName: name, photoURL: u.photoURL ?? null, text, lang, status: 'visible', likeCount: 0, createdAt: serverTimestamp() };
      b.set(ref, data);
      b.set(counterRef(slug), { comments: increment(1) }, { merge: true });
      await b.commit().catch((e) => {
        throw mapError(e);
      });
      return { ...data, id: ref.id, slug, createdAt: Date.now(), status: 'visible' } as CommentDoc;
    },

    async deleteComment(slug, id) {
      requireGoogle();
      const b = writeBatch(db);
      b.delete(doc(db, 'comments', slug, 'items', id));
      b.set(counterRef(slug), { comments: increment(-1) }, { merge: true });
      await b.commit().catch((e) => {
        throw mapError(e);
      });
    },

    async hideComment(slug, id) {
      requireGoogle();
      const b = writeBatch(db);
      b.update(doc(db, 'comments', slug, 'items', id), { status: 'hidden' });
      b.set(counterRef(slug), { comments: increment(-1) }, { merge: true });
      await b.commit().catch((e) => {
        throw mapError(e);
      });
    },

    async setCommentLike(slug, id, on) {
      const u = me();
      const b = writeBatch(db);
      const likeRef = sub(u.uid, 'commentLikes', commentLikeId(slug, id));
      if (on) b.set(likeRef, { slug, id, createdAt: serverTimestamp() });
      else b.delete(likeRef);
      b.update(doc(db, 'comments', slug, 'items', id), { likeCount: increment(on ? 1 : -1) });
      await b.commit().catch((e) => {
        throw mapError(e);
      });
    },

    async saveProgress(slug, lastSection) {
      const u = me();
      await setDoc(sub(u.uid, 'progress', slug), { lastSection, updatedAt: serverTimestamp() }, { merge: true }).catch(() => {});
    },

    async completeArticle(slug, today, streak) {
      const u = me();
      const progressRef = sub(u.uid, 'progress', slug);
      const before = await getDoc(progressRef).catch(() => null);
      const b = writeBatch(db);
      b.update(userRef(u.uid), {
        streak: { current: streak.current, longest: streak.longest, lastReadDate: streak.lastReadDate },
        ...(before?.data()?.completed ? {} : { 'stats.articlesRead': increment(1) }),
        lastActiveAt: serverTimestamp(),
      });
      b.set(sub(u.uid, 'readDays', today), { slugs: arrayUnion(slug) }, { merge: true });
      b.set(progressRef, { completed: true, completedAt: serverTimestamp() }, { merge: true });
      await b.commit().catch((e) => {
        throw mapError(e);
      });
    },

    async setApplyDone(slug, done) {
      const u = me();
      await setDoc(sub(u.uid, 'progress', slug), { applyDone: done }, { merge: true }).catch((e) => {
        throw mapError(e);
      });
    },

    async updateProfile(patch) {
      const u = me();
      const data: Record<string, unknown> = {};
      if (patch.displayName !== undefined) data.displayName = patch.displayName.slice(0, 60);
      if (patch.lang) data.lang = patch.lang;
      if (patch.timezone) data.timezone = patch.timezone;
      if (!Object.keys(data).length) return;
      try {
        await updateDoc(userRef(u.uid), data);
        if (patch.displayName !== undefined) await fbUpdateProfile(u, { displayName: patch.displayName.slice(0, 60) });
      } catch (e) {
        throw mapError(e);
      }
    },

    async submitPost(input: SubmissionInput) {
      const u = requireGoogle();
      const profile = await getDoc(userRef(u.uid)).catch(() => null);
      const name = (profile?.data()?.displayName as string) || u.displayName || 'Reader';
      try {
        const ref = await addDoc(collection(db, 'submissions'), {
          uid: u.uid,
          displayName: name,
          title: input.title.slice(0, 120),
          hook: input.hook.slice(0, 1200),
          sections: input.sections.slice(0, 10).map((s) => ({ heading: (s.heading ?? '').slice(0, 120), body: s.body.slice(0, 2000) })),
          references: input.references.slice(0, 20).map((r) => r.slice(0, 500)),
          coverUrl: (input.coverUrl ?? '').slice(0, 500),
          lang: input.lang,
          status: 'pending',
          createdAt: serverTimestamp(),
        });
        return ref.id;
      } catch (e) {
        throw mapError(e);
      }
    },

    async listMySubmissions() {
      const u = me();
      if (u.isAnonymous) return [];
      try {
        const snap = await getDocs(query(collection(db, 'submissions'), where('uid', '==', u.uid)));
        return snap.docs
          .map((d) => {
            const x = d.data();
            return { ...(x as SubmissionInput), id: d.id, status: x.status, slug: x.slug, createdAt: toMillis(x.createdAt) } as SubmissionDoc;
          })
          .sort((a, b) => b.createdAt - a.createdAt);
      } catch (e) {
        throw mapError(e);
      }
    },

    async exportData() {
      const u = me();
      const dump = async (name: string) =>
        Object.fromEntries((await getDocs(collection(db, 'users', u.uid, name))).docs.map((d) => [d.id, d.data()]));
      const [profile, likes, saves, progress, readDays, commentLikes, comments, submissions] = await Promise.all([
        getDoc(userRef(u.uid)),
        dump('likes'),
        dump('saves'),
        dump('progress'),
        dump('readDays'),
        dump('commentLikes'),
        u.isAnonymous ? Promise.resolve(null) : getDocs(query(collectionGroup(db, 'items'), where('uid', '==', u.uid))),
        u.isAnonymous ? Promise.resolve(null) : getDocs(query(collection(db, 'submissions'), where('uid', '==', u.uid))),
      ]);
      return {
        exportedAt: new Date().toISOString(),
        account: mapUser(u),
        profile: profile.data() ?? null,
        likes,
        saves,
        progress,
        readDays,
        commentLikes,
        comments: comments?.docs.map((d) => ({ path: d.ref.path, ...d.data() })) ?? [],
        submissions: submissions?.docs.map((d) => ({ id: d.id, ...d.data() })) ?? [],
      };
    },

    async deleteAccount({ deleteComments }) {
      const u = me();
      // Re-authenticate first so we never delete data and then fail to delete the account.
      if (!u.isAnonymous) {
        const last = Date.parse(u.metadata.lastSignInTime ?? '') || 0;
        if (Date.now() - last > 4 * 60_000) {
          try {
            await reauthenticateWithPopup(u, provider());
          } catch (e) {
            throw mapError(e);
          }
        }
      }
      const uid = u.uid;
      try {
        const b = new Batcher(db);
        const names = ['likes', 'saves', 'progress', 'readDays', 'commentLikes'] as const;
        const snaps = await Promise.all(names.map((n) => getDocs(collection(db, 'users', uid, n))));
        snaps.forEach((snap, i) => {
          for (const d of snap.docs) {
            const name = names[i];
            b.batch.delete(d.ref);
            if (name === 'likes' || name === 'saves') b.batch.set(counterRef(d.id), { [name]: increment(-1) }, { merge: true });
          }
        });
        await b.commit();
        if (!u.isAnonymous) {
          const mine = await getDocs(query(collectionGroup(db, 'items'), where('uid', '==', uid)));
          const c = new Batcher(db);
          for (const d of mine.docs) {
            const slug = d.ref.parent.parent?.id;
            if (deleteComments) {
              c.batch.delete(d.ref);
              if (slug && d.data().status === 'visible') c.batch.set(counterRef(slug), { comments: increment(-1) }, { merge: true });
            } else c.batch.update(d.ref, { displayName: 'Deleted user', photoURL: null });
          }
          await c.commit();
        }
        await deleteDoc(userRef(uid));
        await deleteUser(u);
      } catch (e) {
        throw mapError(e);
      }
    },
  };
  return api;

  async function myCommentLikes(slug: string): Promise<Set<string>> {
    const u = auth.currentUser;
    if (!u) return new Set();
    try {
      const snap = await getDocs(query(collection(db, 'users', u.uid, 'commentLikes'), where('slug', '==', slug)));
      return new Set(snap.docs.map((d) => d.data().id as string));
    } catch {
      return new Set();
    }
  }

  function toComment(slug: string, d: QueryDocumentSnapshot, liked: Set<string>): CommentDoc {
    const x = d.data({ serverTimestamps: 'estimate' });
    return {
      id: d.id,
      slug,
      uid: x.uid,
      displayName: x.displayName ?? 'Reader',
      photoURL: x.photoURL ?? null,
      text: x.text ?? '',
      lang: x.lang ?? 'en',
      status: x.status ?? 'visible',
      createdAt: toMillis(x.createdAt),
      likeCount: x.likeCount ?? 0,
      likedByMe: liked.has(d.id),
      pending: d.metadata.hasPendingWrites,
    };
  }
}
