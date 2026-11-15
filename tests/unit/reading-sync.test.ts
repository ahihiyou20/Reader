import { describe, expect, it } from 'vitest';
import { mergeReading, type ReadingData } from '@/lib/reading-sync';

const base = (p: Partial<ReadingData>): ReadingData => ({ topics: [], signals: {}, history: [], collections: [], settings: { fontSize: 18, rate: 1, voice: {} }, ...p });
const sig = (opens: number, saves = 0) => ({ opens, completes: 0, saves, skips: 0, ms: opens * 1000 });

describe('reading sync merge', () => {
  it('joins this device with the account without dropping anything', () => {
    const local = base({
      topics: ['science'],
      signals: { science: sig(3), health: sig(1) },
      history: [{ slug: 'a', category: 'science', at: 200, ms: 5000, done: false }],
      collections: [{ id: 'c1', name: 'Later', slugs: ['a'] }],
    });
    const remote = base({
      topics: ['history', 'science'],
      signals: { science: sig(5, 2), history: sig(2) },
      history: [
        { slug: 'a', category: 'science', at: 100, ms: 9000, done: true },
        { slug: 'b', category: 'history', at: 150, ms: 1000, done: false },
      ],
      collections: [
        { id: 'c1', name: 'Read later', slugs: ['b'] },
        { id: 'c2', name: 'Work', slugs: [] },
      ],
      settings: { fontSize: 21, rate: 1.25, voice: { fr: 'Amelie' } },
    });
    const m = mergeReading(local, remote);
    expect(m.topics.sort()).toEqual(['history', 'science']);
    expect(m.signals.science).toMatchObject({ opens: 5, saves: 2 });
    expect(Object.keys(m.signals).sort()).toEqual(['health', 'history', 'science']);
    expect(m.history.map((h) => h.slug)).toEqual(['a', 'b']);
    expect(m.history[0]).toMatchObject({ at: 200, ms: 9000, done: true });
    expect(m.collections.find((c) => c.id === 'c1')).toMatchObject({ name: 'Later', slugs: ['a', 'b'] });
    expect(m.collections).toHaveLength(2);
    expect(m.settings).toEqual({ fontSize: 21, rate: 1.25, voice: { fr: 'Amelie' } });
  });
  it('is stable when merged with itself', () => {
    const d = base({ topics: ['x'], signals: { x: sig(2) }, history: [{ slug: 'a', category: 'x', at: 1, ms: 1, done: true }], collections: [{ id: 'c', name: 'n', slugs: ['a'] }] });
    expect(mergeReading(d, d)).toEqual(d);
  });
});
