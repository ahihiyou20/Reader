// Cover title typography: each category has one fixed lettering style, and the last words of the title
// are set in its accent face (script or display), the way a poster stresses one phrase.

export type TitleStyle = 'cosmos' | 'press' | 'poster' | 'mag' | 'elegant' | 'stamp';

const BY_CATEGORY: Record<string, TitleStyle> = {
  science: 'cosmos',
  technology: 'cosmos',
  history: 'press',
  society: 'press',
  productivity: 'poster',
  psychology: 'mag',
  health: 'elegant',
  economics: 'stamp',
};
export const titleStyle = (category: string): TitleStyle => BY_CATEGORY[category] ?? 'mag';

/** Script faces get hard to read past a short phrase. */
const ACCENT_MAX = 22;

/** Split a title into the lead and the phrase to stress: the part after a colon when short, else the last words. */
export function splitTitle(title: string): { lead: string; accent: string } {
  const t = title.trim();
  const colon = t.match(/^(.{8,}?)[:–—]\s+(.+)$/);
  if (colon && colon[2].length <= ACCENT_MAX + 8) return { lead: colon[1], accent: colon[2] };
  const words = t.split(/\s+/);
  if (words.length < 3) return { lead: '', accent: t };
  let n = 1;
  while (n < words.length - 1 && n < 3 && words.slice(-(n + 1)).join(' ').length <= ACCENT_MAX) n++;
  return { lead: words.slice(0, -n).join(' '), accent: words.slice(-n).join(' ') };
}
