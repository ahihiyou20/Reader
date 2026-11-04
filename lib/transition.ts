// Stage-change choreography (ARCHITECTURE.md §2). Contract only; WP1 implements the body.

import { dur, prefersReducedMotion } from '@/lib/motion';

interface ActiveTransition {
  skipTransition(): void;
}

let activeTransition: ActiveTransition | null = null;
let activeFallbackAnim: Animation | null = null;

/**
 * Applies `update` (which must change the DOM synchronously: set `html[data-stage]` and flush
 * React with flushSync) inside `document.startViewTransition` when the API exists and reduced
 * motion is off. Named groups (view-transition-name) morph from old to new positions over
 * dur.stage with springCSS easing; the root settles from scale 0.985 to 1.
 *
 * Fallbacks: no View Transitions API, or prefers-reduced-motion → apply `update`, then crossfade
 * the `.app` root for dur.crossfade (opacity only).
 *
 * Calling it while a transition runs skips the running one (`skipTransition()`) and starts anew.
 * Resolves when the transition (or fallback) has finished. Never rejects; errors fall back to an
 * instant update.
 */
export async function withStageTransition(update: () => void): Promise<void> {
  if (activeTransition) {
    try {
      activeTransition.skipTransition();
    } catch {}
    activeTransition = null;
  }
  if (activeFallbackAnim) {
    try {
      activeFallbackAnim.cancel();
    } catch {}
    activeFallbackAnim = null;
  }

  const hasVT =
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function';
  const reduce = prefersReducedMotion();

  if (hasVT && !reduce) {
    let vt: { finished: Promise<unknown>; skipTransition(): void } | null = null;
    try {
      vt = document.startViewTransition(() => {
        update();
      });
      activeTransition = vt;
      await vt.finished.catch(() => {});
      return;
    } catch {
      try {
        update();
      } catch {}
      return;
    } finally {
      if (activeTransition === vt) {
        activeTransition = null;
      }
    }
  }

  try {
    update();
  } catch {
    return;
  }

  if (typeof document !== 'undefined') {
    const appEl = document.querySelector('.app');
    if (appEl && 'animate' in appEl) {
      try {
        const anim = appEl.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: dur.crossfade,
          easing: 'ease-out',
        });
        activeFallbackAnim = anim;
        await anim.finished.catch(() => {});
      } catch {}
      finally {
        if (activeFallbackAnim) activeFallbackAnim = null;
      }
    }
  }
}
