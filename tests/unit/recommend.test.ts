import { describe, expect, it } from 'vitest';
import { affinity, rankForYou } from '@/lib/recommend';
import type { Signal } from '@/stores/reading';

const sig = (p: Partial<Signal>): Signal => ({ opens: 0, completes: 0, saves: 0, skips: 0, ms: 0, ...p });
const items = ['science', 'history', 'health', 'science', 'history', 'health', 'economy', 'science'].map((category, i) => ({ slug: `a${i}`, category }));

describe('Smart Feed', () => {
  it('keeps the editorial order for a reader with no history', () => {
    expect(rankForYou(items, {}, [])).toBe(items);
  });
  it('raises a favourite topic and topics the reader finishes and saves', () => {
    const fav = rankForYou(items, {}, ['economy']);
    expect(fav.findIndex((i) => i.category === 'economy')).toBeLessThan(6);
    const read = rankForYou(items, { health: sig({ opens: 4, completes: 4, saves: 2, ms: 240000 }) }, []);
    expect(read[0].category).toBe('health');
  });
  it('lowers a topic the reader keeps skipping, without dropping it', () => {
    const out = rankForYou(items, { science: sig({ skips: 3 }) }, []);
    expect(out[0].category).not.toBe('science');
    expect(out).toHaveLength(items.length);
  });
  it('explains the strongest reason', () => {
    expect(affinity(undefined, true).reason).toBe('topic');
    expect(affinity(sig({ opens: 2, completes: 2 }), false).reason).toBe('finishes');
    expect(affinity(sig({ opens: 1, saves: 2 }), false).reason).toBe('saves');
    expect(affinity(undefined, false).reason).toBe('explore');
    expect(affinity(sig({ skips: 2 }), false).reason).toBe(null);
  });
});
