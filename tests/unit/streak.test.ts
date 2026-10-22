import { describe, expect, it } from 'vitest';
import { diffDays, displayStreak, EMPTY_STREAK, lastNDays, localDate, nextStreak, streakFromDays } from '@/lib/streak';

describe('nextStreak (FR-20)', () => {
  it('first reading day starts at 1', () => {
    expect(nextStreak(EMPTY_STREAK, '2026-10-22')).toMatchObject({ current: 1, longest: 1, lastReadDate: '2026-10-22', changed: true });
  });
  it('same day does not change', () => {
    const s = { current: 3, longest: 5, lastReadDate: '2026-10-22' };
    expect(nextStreak(s, '2026-10-22')).toMatchObject({ current: 3, longest: 5, changed: false });
  });
  it('the next day adds one and updates the longest', () => {
    expect(nextStreak({ current: 5, longest: 5, lastReadDate: '2026-10-21' }, '2026-10-22')).toMatchObject({ current: 6, longest: 6 });
  });
  it('a missed day restarts at 1 and keeps the longest', () => {
    expect(nextStreak({ current: 5, longest: 9, lastReadDate: '2026-10-19' }, '2026-10-22')).toMatchObject({ current: 1, longest: 9 });
  });
  it('crosses month and year boundaries', () => {
    expect(nextStreak({ current: 2, longest: 2, lastReadDate: '2026-12-31' }, '2027-01-01').current).toBe(3);
    expect(nextStreak({ current: 2, longest: 2, lastReadDate: '2028-02-28' }, '2028-02-29').current).toBe(3);
  });
  it('a date in the past (time zone change) keeps the streak', () => {
    expect(nextStreak({ current: 4, longest: 4, lastReadDate: '2026-10-22' }, '2026-10-21')).toMatchObject({ current: 4, changed: false });
  });
});

describe('displayStreak', () => {
  it('shows the streak, greyed until today is read', () => {
    expect(displayStreak({ current: 3, longest: 3, lastReadDate: '2026-10-21' }, '2026-10-22')).toEqual({ value: 3, readToday: false });
    expect(displayStreak({ current: 3, longest: 3, lastReadDate: '2026-10-22' }, '2026-10-22')).toEqual({ value: 3, readToday: true });
  });
  it('shows 0 once a day was missed', () => {
    expect(displayStreak({ current: 3, longest: 3, lastReadDate: '2026-10-19' }, '2026-10-22').value).toBe(0);
  });
});

describe('helpers', () => {
  it('diffDays', () => expect(diffDays('2026-10-01', '2026-11-01')).toBe(31));
  it('localDate uses the given time zone', () => {
    const d = new Date('2026-10-22T18:30:00Z');
    expect(localDate(d, 'Asia/Ho_Chi_Minh')).toBe('2026-10-23');
    expect(localDate(d, 'America/New_York')).toBe('2026-10-22');
  });
  it('streakFromDays rebuilds a merged streak', () => {
    expect(streakFromDays(['2026-10-18', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-21'], '2026-10-22')).toEqual({
      current: 3,
      longest: 3,
      lastReadDate: '2026-10-22',
    });
  });
  it('lastNDays', () => expect(lastNDays(3, '2026-03-01')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01']));
});
