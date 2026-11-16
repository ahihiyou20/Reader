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

/** The two faces each lettering style sets (app/styles/pagemoor.css), as `font` shorthands without the family. */
const FACES: Record<TitleStyle, Array<[string, string]>> = {
  cosmos: [['italic 400', '--f-playfair'], ['400', '--f-vibes']],
  press: [['400', '--f-yeseva'], ['400', '--f-pinyon']],
  poster: [['400', '--f-anton']],
  mag: [['900', '--f-fraunces'], ['400', '--f-allura']],
  elegant: [['300', '--f-cormorant'], ['700', '--f-dancing']],
  stamp: [['400', '--f-dela'], ['700', '--f-charm']],
};
const requested = new Set<TitleStyle>();

/**
 * Fetch the faces a category's cover title uses before the cover reaches the screen. The faces are not
 * preloaded with the page (a cover needs two of twelve); fetched on sight, the title is drawn in the
 * fallback first and jumps when the face arrives, which shows as a layout shift when covers pass by quickly.
 */
export function preloadTitleFaces(category: string) {
  if (typeof document === 'undefined' || !document.fonts) return;
  const style = titleStyle(category);
  if (requested.has(style)) return;
  requested.add(style);
  const vars = getComputedStyle(document.documentElement);
  for (const [face, variable] of FACES[style]) {
    const family = vars.getPropertyValue(variable).trim();
    if (family) document.fonts.load(`${face} 32px ${family}`).catch(() => requested.delete(style));
  }
}
