import type { Locator } from '@playwright/test';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Returns the element's bounding client rect if visible, or null if:
 * - count is 0
 * - zero area (width <= 0 or height <= 0)
 * - visibility: hidden or display: none on element or any ancestor
 * - the cumulative opacity product of element and ancestors is < 0.05
 */
export async function visibleRect(locator: Locator): Promise<Rect | null> {
  const count = await locator.count();
  if (count === 0) return null;
  return await locator.first().evaluate((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    let curr: Element | null = el;
    let opacityProduct = 1;
    while (curr) {
      const style = window.getComputedStyle(curr);
      if (style.visibility === 'hidden' || style.display === 'none') return null;
      const op = parseFloat(style.opacity);
      if (!Number.isNaN(op)) opacityProduct *= op;
      curr = curr.parentElement;
    }
    if (opacityProduct < 0.05) return null;

    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });
}

/**
 * Computes intersection area between two rects (0 if no overlap).
 */
export function intersectArea(a: Rect | null | undefined, b: Rect | null | undefined): number {
  if (!a || !b) return 0;
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

/**
 * Tests whether rect lies completely inside the viewport bounds [0, width] x [0, height],
 * with a tolerance of tol pixels (default 1).
 */
export function insideViewport(
  rect: Rect | null | undefined,
  vp: { width: number; height: number },
  tol = 1,
): boolean {
  if (!rect) return false;
  return (
    rect.x >= -tol &&
    rect.y >= -tol &&
    rect.x + rect.width <= vp.width + tol &&
    rect.y + rect.height <= vp.height + tol
  );
}
