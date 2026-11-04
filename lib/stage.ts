// Stage system (ARCHITECTURE.md §1): four layout classes chosen from the viewport's shape and
// size, never from the device or user agent. `html[data-stage]` drives every layout rule.

export type Stage = 'compact-portrait' | 'regular-portrait' | 'compact-landscape' | 'regular-landscape';

export const STAGES: readonly Stage[] = ['compact-portrait', 'regular-portrait', 'compact-landscape', 'regular-landscape'];

/** Portrait is regular from this width; landscape is regular from this height (CSS px). */
export const STAGE_BREAKPOINTS = { portraitWidth: 600, landscapeHeight: 560 } as const;

export function stageOf(w: number, h: number): Stage {
  if (!(w > 0) || !(h > 0)) return 'compact-portrait';
  if (w < h) return w < STAGE_BREAKPOINTS.portraitWidth ? 'compact-portrait' : 'regular-portrait';
  return h < STAGE_BREAKPOINTS.landscapeHeight ? 'compact-landscape' : 'regular-landscape';
}

export const isLandscape = (s: Stage) => s === 'compact-landscape' || s === 'regular-landscape';
export const isCompact = (s: Stage) => s === 'compact-portrait' || s === 'compact-landscape';

/**
 * Inline <head> script: sets `data-stage` on <html> before the first paint, so the static HTML
 * already has the right layout. Built from the same breakpoints as stageOf.
 */
export const stageScript = `(function(){var w=innerWidth,h=innerHeight,s=!(w>0&&h>0)?'compact-portrait':w<h?(w<${STAGE_BREAKPOINTS.portraitWidth}?'compact-portrait':'regular-portrait'):(h<${STAGE_BREAKPOINTS.landscapeHeight}?'compact-landscape':'regular-landscape');document.documentElement.setAttribute('data-stage',s)})()`;
