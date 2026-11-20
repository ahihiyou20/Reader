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
    history.set(h.slug, o ? { ...h, at: Math.max(o.at, h.at), ms: Math.max(o.ms, h.ms), done: o.done || h.done } : h);
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
let syncedUid: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSaved = '';

async function push() {
  clearTimeout(timer);
  timer = undefined;
  if (!syncedUid) return;
  const data = snapshot();
  const json = JSON.stringify(data);
  if (json === lastSaved) return;
  lastSaved = json;
  // A failed save is retried on the next change; the browser copy is intact either way.
  await (await getBackend()).saveReading(data).catch(() => {
    lastSaved = '';
  });
}

async function pull(uid: string) {
  const remote = await (await getBackend()).loadReading().catch(() => undefined);
  // Signed out or switched account while loading, or the account could not be read: do not overwrite it.
  if (remote === undefined || useUser.getState().user?.uid !== uid) return;
  if (remote) useReading.setState(mergeReading(snapshot(), remote));
  syncedUid = uid;
  await push();
}

/** Start syncing; call once. Returns the function that stops it. */
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
  // Leaving the page: save what the delay was still holding.
  const flush = () => {
    if (timer) void push();
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', flush);
  return () => {
    offUser();
    offReading();
    window.removeEventListener('pagehide', flush);
    document.removeEventListener('visibilitychange', flush);
  };
}
