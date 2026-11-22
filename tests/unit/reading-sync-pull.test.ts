import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingData } from '@/lib/reading-sync';

const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('window', { localStorage: storage, addEventListener() {}, removeEventListener() {} });
vi.stubGlobal('document', { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} });

let remote: ReadingData | null = null;
const saved: ReadingData[] = [];
vi.mock('@/lib/backend', () => ({
  getBackend: async () => ({ loadReading: async () => remote, saveReading: async (d: ReadingData) => void saved.push(d) }),
}));

const { startReadingSync } = await import('@/lib/reading-sync');
const { useReading } = await import('@/stores/reading');
const { useUser } = await import('@/stores/user');

const settings = { fontSize: 18, rate: 1, voice: {} };
const freeze = { count: 0, claimed: null, covered: [], at: 0 };
const data = (collections: ReadingData['collections']): ReadingData => ({ topics: [], signals: {}, history: [], collections, settings, freeze });
const signIn = () => useUser.setState({ ready: true, backend: 'firebase', user: { uid: 'u1', provider: 'google', isAnonymous: false, displayName: null, photoURL: null, email: null } });
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('reading sync pull', () => {
  beforeEach(() => {
    useUser.setState({ user: null });
    mem.clear();
    saved.length = 0;
  });

  it('takes the account copy whole when nothing changed here since the last sync', async () => {
    const before = data([{ id: 'c1', name: 'Later', slugs: [] }]);
    useReading.setState(before);
    mem.set('pagemoor.reading.synced.u1', JSON.stringify(before));
    remote = data([]);
    const stop = startReadingSync();
    signIn();
    await settle();
    expect(useReading.getState().collections).toEqual([]);
    expect(saved).toHaveLength(0);
    stop();
  });

  it('merges when this browser changed too, and saves the result', async () => {
    useReading.setState(data([{ id: 'c2', name: 'New here', slugs: [] }]));
    mem.set('pagemoor.reading.synced.u1', JSON.stringify(data([])));
    remote = data([{ id: 'c1', name: 'Other device', slugs: [] }]);
    const stop = startReadingSync();
    signIn();
    await settle();
    expect(useReading.getState().collections.map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect(saved.at(-1)?.collections).toHaveLength(2);
    stop();
  });
});
