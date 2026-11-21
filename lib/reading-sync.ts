// Keeps the reading data (stores/reading.ts) with the Google account, so topics, history, collections
// and settings follow the reader to another device. The browser copy stays the working copy: reads
// never wait for the network, and a guest keeps everything locally until they sign in.
import { getBackend } from '@/lib/backend';
import { useReading, type Collection, type Freeze, type HistoryEntry, type ReadingSettings, type Signal } from '@/stores/reading';
import { useUser } from '@/stores/user';

export interface ReadingData {
  topics: string[];
  signals: Record<string, Signal>;
  history: HistoryEntry[];
  collections: Collection[];
  settings: ReadingSettings;
  /** Absent in data saved before freezes existed. */
  freeze?: Freeze;
}

const HISTORY_MAX = 300;
const uniq = <T>(list: T[]) => [...new Set(list)];

/**
 * Combine this browser's data with the account's. Nothing is dropped: counters take the larger value
 * (both sides counted the same reading on the device that did it), lists are joined, and for one
 * article or collection present on both sides the fields are merged.
 */
export function mergeReading(local: ReadingData, remote: ReadingData): ReadingData {
  const signals: Record<string, Signal> = { ...remote.signals };
  for (const [cat, l] of Object.entries(local.signals)) {
    const r = remote.signals[cat];
    signals[cat] = r ? { opens: Math.max(l.opens, r.opens), completes: Math.max(l.completes, r.completes), saves: Math.max(l.saves, r.saves), skips: Math.max(l.skips, r.skips), ms: Math.max(l.ms, r.ms) } : l;
  }
  const history = new Map<string, HistoryEntry>();
  for (const h of [...remote.history, ...local.history]) {
    const o = history.get(h.slug);
    const viewedOn = [o?.viewedOn, h.viewedOn].filter(Boolean).sort().at(-1);
    history.set(h.slug, o ? { ...h, at: Math.max(o.at, h.at), ms: Math.max(o.ms, h.ms), done: o.done || h.done, ...(viewedOn ? { viewedOn } : {}) } : h);
  }
  const collections = new Map<string, Collection>();
  for (const c of [...remote.collections, ...local.collections]) {
    const o = collections.get(c.id);
    // This browser's name wins: it is the one the reader may just have typed.
    collections.set(c.id, o ? { ...c, slugs: uniq([...c.slugs, ...o.slugs]) } : c);
  }
  return {
    topics: uniq([...local.topics, ...remote.topics]),
    signals,
    history: [...history.values()].sort((a, b) => b.at - a.at).slice(0, HISTORY_MAX),
    collections: [...collections.values()],
    // Settings are per reader, not per device: the account's choice applies everywhere.
    settings: { ...local.settings, ...remote.settings, voice: { ...local.settings.voice, ...remote.settings.voice } },
    // Freezes are spent and claimed as events, so the newer copy is the true one.
    freeze: (remote.freeze?.at ?? 0) > (local.freeze?.at ?? 0) ? remote.freeze : local.freeze,
  };
}

const snapshot = (): ReadingData => {
  const { topics, signals, history, collections, settings, freeze } = useReading.getState();
  // Firestore refuses `undefined`; a JSON round trip drops it.
  return JSON.parse(JSON.stringify({ topics, signals, history, collections, settings, freeze })) as ReadingData;
};

const SAVE_DELAY_MS = 4000;
const PULL_AGAIN_MS = 30_000;
let syncedUid: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = '';
let pulledAt = 0;

// The copy this browser and the account last agreed on, kept across reloads. While the browser's copy
// still equals it, nothing changed here and the account's copy replaces it whole, so a collection
// deleted or a topic dropped on another device stays gone instead of coming back from the merge.
const BASE = (uid: string) => `pagemoor.reading.synced.${uid}`;
const readBase = (uid: string) => {
  try {
    return localStorage.getItem(BASE(uid));
  } catch {
    return null;
  }
};
const writeBase = (uid: string, json: string) => {
  try {
    localStorage.setItem(BASE(uid), json);
  } catch {}
};

async function push() {
  clearTimeout(timer);
  timer = undefined;
  const uid = syncedUid;
  if (!uid) return;
  const data = snapshot();
  const json = JSON.stringify(data);
  if (json === lastSaved) return;
  lastSaved = json;
  // A failed save is retried on the next change; the browser copy is intact either way.
  await (await getBackend())
    .saveReading(data)
    .then(() => writeBase(uid, json))
    .catch(() => {
      lastSaved = '';
    });
}

async function pull(uid: string) {
  pulledAt = Date.now();
  const remote = await (await getBackend()).loadReading().catch(() => undefined);
  // Signed out or switched account while loading, or the account could not be read: do not overwrite it.
  if (remote === undefined || useUser.getState().user?.uid !== uid) return;
  if (remote) {
    const local = snapshot();
    const { topics, signals, history, collections, settings, freeze } = remote;
    const untouched = readBase(uid) === JSON.stringify(local);
    useReading.setState(untouched ? { topics, signals, history, collections, settings, ...(freeze ? { freeze } : {}) } : mergeReading(local, remote));
    if (untouched) {
      lastSaved = JSON.stringify(snapshot());
      writeBase(uid, lastSaved);
    }
  }
  syncedUid = uid;
  await push();
}

/** Start syncing; call once. Returns a function that stops it. */
export function startReadingSync(): () => void {
  const onUser = () => {
    const { user, ready, backend } = useUser.getState();
    const uid = ready && backend === 'firebase' && user && !user.isAnonymous ? user.uid : null;
    if (uid === syncedUid) return;
    syncedUid = null;
    lastSaved = '';
    if (uid) void pull(uid);
  };
  onUser();
  const offUser = useUser.subscribe(onUser);
  const offReading = useReading.subscribe(() => {
    if (syncedUid && !timer) timer = setTimeout(push, SAVE_DELAY_MS);
  });
  // Leaving the page: save what the delay was still holding. Coming back: the other devices may have
  // read meanwhile, and a phone keeps this page open for days.
  const flush = () => {
    if (timer) void push();
  };
  const onVisible = () => {
    if (document.visibilityState === 'hidden') flush();
    else if (syncedUid && Date.now() - pulledAt > PULL_AGAIN_MS) void pull(syncedUid);
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    offUser();
    offReading();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
