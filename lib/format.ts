import type { Lang } from '@/lib/content/types';
import { translate } from '@/lib/i18n';

/** FR-13: 999 · 1.2K · 12K · 1.2M */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1000) return String(Math.floor(n));
  if (n < 10_000) return (Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n < 1_000_000) return Math.floor(n / 1000) + 'K';
  if (n < 10_000_000) return (Math.floor(n / 100_000) / 10).toFixed(1).replace(/\.0$/, '') + 'M';
  return Math.floor(n / 1_000_000) + 'M';
}

export function readingMinutes(words: number, wpm = 230): number {
  return Math.max(1, Math.round(words / wpm));
}

export function timeAgo(date: Date | number, lang: Lang, now = Date.now()): string {
  const s = Math.max(0, (now - +date) / 1000);
  if (s < 60) return translate(lang, 'justNow');
  if (s < 3600) return translate(lang, 'minutesAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return translate(lang, 'hoursAgo', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return translate(lang, 'daysAgo', { n: Math.floor(s / 86400) });
  return new Date(date).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short' });
}
