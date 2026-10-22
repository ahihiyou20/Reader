import { describe, expect, it } from 'vitest';
import { formatCount, readingMinutes, shadeFor, timeAgo } from '@/lib/format';

describe('formatCount (FR-13)', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [1234, '1.2K'],
    [9999, '9.9K'],
    [12_345, '12K'],
    [999_999, '999K'],
    [1_200_000, '1.2M'],
    [15_000_000, '15M'],
  ])('%i → %s', (n, s) => expect(formatCount(n)).toBe(s));
  it('never shows negative numbers', () => expect(formatCount(-3)).toBe('0'));
});

describe('misc', () => {
  it('readingMinutes', () => {
    expect(readingMinutes(100)).toBe(1);
    expect(readingMinutes(800)).toBe(3);
  });
  it('timeAgo', () => {
    const now = Date.parse('2026-10-22T12:00:00Z');
    expect(timeAgo(now - 30_000, 'en', now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, 'vi', now)).toBe('5 phút');
    expect(timeAgo(now - 3 * 3600_000, 'en', now)).toBe('3h');
  });
  it('shadeFor darkens bright covers only', () => {
    expect(shadeFor('#101010')).toBe(0);
    expect(shadeFor('#f0f0f0')).toBeGreaterThan(0.25);
  });
});
