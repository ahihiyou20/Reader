// Self-hosted first-screen covers (written by scripts/covers.mjs at build time, passed in by the pages).

export interface OptCover {
  src: string;
  srcSet: string;
  width: number;
  height: number;
}
export type OptCovers = Record<string, OptCover>;

/** The cover's rendered width: the 460px column in compact-portrait, the full stage elsewhere. */
export const COVER_SIZES = '(orientation: portrait) and (max-width: 599px) min(100vw, 460px), 100vw';

let covers: OptCovers = {};
export function setOptCovers(next: OptCovers): void {
  covers = next;
}
export function optCover(slug: string): OptCover | undefined {
  return covers[slug];
}

/**
 * Unsplash's 1080 px cover at quality 60 instead of 74: a quarter fewer bytes (about 270 KB down to 200
 * KB a cover, on every swipe) with no visible change on a phone under the cover's shade.
 */
export function lighterCover(url: string): string {
  if (!url.startsWith('https://images.unsplash.com/')) return url;
  const u = new URL(url);
  if (Number(u.searchParams.get('w')) >= 1080) u.searchParams.set('q', '60');
  return u.toString();
}
