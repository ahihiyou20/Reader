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
