// Streak rules (FR-20, docs/02 §4.4). Dates are 'YYYY-MM-DD' in the reader's own time zone.

export interface Streak {
  current: number;
  longest: number;
  lastReadDate: string | null;
}
export const EMPTY_STREAK: Streak = { current: 0, longest: 0, lastReadDate: null };

export function localDate(d: Date = new Date(), timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function nextStreak(s: Streak, today: string): Streak & { changed: boolean } {
  if (s.lastReadDate === today) return { ...s, changed: false };
  // A date in the past (clock moved back or a different time zone): keep the streak as it is.
  if (s.lastReadDate && diffDays(s.lastReadDate, today) < 0) return { ...s, changed: false };
  const consecutive = s.lastReadDate !== null && diffDays(s.lastReadDate, today) === 1;
  const current = consecutive ? s.current + 1 : 1;
  return { current, longest: Math.max(s.longest, current), lastReadDate: today, changed: true };
}

/** What the header shows: a streak that was broken (no reading yesterday or today) reads as 0. */
export function displayStreak(s: Streak, today: string): { value: number; readToday: boolean } {
  if (!s.lastReadDate) return { value: 0, readToday: false };
  const gap = diffDays(s.lastReadDate, today);
  if (gap <= 0) return { value: s.current, readToday: true };
  if (gap === 1) return { value: s.current, readToday: false };
  return { value: 0, readToday: false };
}

/** Rebuild a streak from a set of reading days (used when merging a guest into a Google account). */
export function streakFromDays(days: string[], today: string): Streak {
  const sorted = [...new Set(days)].sort();
  let s: Streak = { ...EMPTY_STREAK };
  for (const d of sorted) {
    if (diffDays(d, today) < 0) continue;
    s = nextStreak(s, d);
  }
  return { current: s.current, longest: s.longest, lastReadDate: s.lastReadDate };
}

export function lastNDays(n: number, today: string): string[] {
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => new Date(base - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

/** Streak freezes: earned by reading 5 minutes in a day, at most two held, spent on missed days. */
export const FREEZE_GOAL_MS = 5 * 60_000;
export const FREEZE_MAX = 2;

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Spend freezes on the days missed since the last reading day, so a streak that would read as broken
 * stays alive: the missed days count as covered and the streak continues from yesterday. Nothing is
 * spent when there is no streak, nothing was missed, or more days were missed than freezes held
 * (the streak is lost either way).
 */
export function applyFreezes(s: Streak, today: string, held: number): { streak: Streak; covered: string[] } {
  if (!s.lastReadDate || s.current === 0) return { streak: s, covered: [] };
  const missed = diffDays(s.lastReadDate, today) - 1;
  if (missed < 1 || missed > held) return { streak: s, covered: [] };
  const covered = Array.from({ length: missed }, (_, i) => addDays(s.lastReadDate!, i + 1));
  return { streak: { ...s, lastReadDate: addDays(today, -1) }, covered };
}

/** The next streak milestone above `n`, and the one it starts from (for the progress track). */
export const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];
export function milestone(n: number): { from: number; to: number } {
  const to = MILESTONES.find((m) => m > n) ?? Math.ceil((n + 1) / 100) * 100;
  const from = [...MILESTONES].reverse().find((m) => m < to && m <= n) ?? 0;
  return { from, to };
}
