import { describe, expect, it } from 'vitest';
import { applyFreezes, milestone, nextStreak } from '@/lib/streak';

describe('streak freezes', () => {
  const s = { current: 6, longest: 9, lastReadDate: '2026-11-18' };
  it('cover the missed days and keep the streak going', () => {
    const r = applyFreezes(s, '2026-11-20', 1);
    expect(r.covered).toEqual(['2026-11-19']);
    expect(r.streak.lastReadDate).toBe('2026-11-19');
    expect(nextStreak(r.streak, '2026-11-20').current).toBe(7);
  });
  it('are not spent when nothing was missed, nothing is held, or too much was missed', () => {
    expect(applyFreezes(s, '2026-11-19', 2).covered).toEqual([]);
    expect(applyFreezes(s, '2026-11-20', 0).covered).toEqual([]);
    expect(applyFreezes(s, '2026-11-22', 2).covered).toEqual([]);
    expect(applyFreezes({ current: 0, longest: 3, lastReadDate: '2026-11-10' }, '2026-11-12', 2).covered).toEqual([]);
  });
  it('two freezes cover two days, across a month end', () => {
    expect(applyFreezes({ ...s, lastReadDate: '2026-10-30' }, '2026-11-02', 2).covered).toEqual(['2026-10-31', '2026-11-01']);
  });
});

describe('milestones', () => {
  it('run from the last one reached to the next', () => {
    expect(milestone(0)).toEqual({ from: 0, to: 3 });
    expect(milestone(3)).toEqual({ from: 3, to: 7 });
    expect(milestone(29)).toEqual({ from: 14, to: 30 });
    expect(milestone(400)).toEqual({ from: 365, to: 500 });
  });
});
