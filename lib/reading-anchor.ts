// Keeps the reader on the same line when the reading column reflows (rotation, resize).
// Contract only (ARCHITECTURE.md §2); WP1 implements the bodies. Pure functions, no DOM.

/** A block of the reading column, measured relative to the scroll content (offsetTop, offsetHeight). */
export interface BlockBox {
  top: number;
  height: number;
}

/** The block under the reading line and how far through it the line sits (0 = top edge, 1 = bottom edge). */
export interface ReadingAnchor {
  index: number;
  fraction: number;
}

/**
 * The block that contains the point `scrollTop + lineY`, with `fraction` clamped to [0, 1].
 * Above the first block: { index: 0, fraction: 0 }. Below the last: { index: last, fraction: 1 }.
 * In a gap between blocks: the block above, fraction 1. No blocks: { index: 0, fraction: 0 }.
 */
export function captureAnchor(blocks: BlockBox[], scrollTop: number, lineY: number): ReadingAnchor {
  if (blocks.length === 0) {
    return { index: 0, fraction: 0 };
  }
  const point = scrollTop + lineY;
  if (point < blocks[0].top) {
    return { index: 0, fraction: 0 };
  }
  const last = blocks.length - 1;
  const lastBlock = blocks[last];
  if (point > lastBlock.top + lastBlock.height) {
    return { index: last, fraction: 1 };
  }
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (point < b.top) {
      return { index: i - 1, fraction: 1 };
    }
    if (point <= b.top + b.height) {
      const fraction = b.height > 0 ? Math.max(0, Math.min(1, (point - b.top) / b.height)) : 0;
      return { index: i, fraction };
    }
  }
  return { index: last, fraction: 1 };
}

/**
 * The scrollTop that puts the same point of the same block back on the reading line after a
 * relayout: `blocks[i].top + fraction * blocks[i].height - lineY`, rounded, clamped to [0, maxScroll].
 * An index past the end uses the last block; no blocks gives 0.
 */
export function restoreScrollTop(anchor: ReadingAnchor, blocks: BlockBox[], lineY: number, maxScroll: number): number {
  if (blocks.length === 0) {
    return 0;
  }
  const idx = Math.min(Math.max(0, anchor.index), blocks.length - 1);
  const frac = Math.max(0, Math.min(1, anchor.fraction));
  const targetPoint = blocks[idx].top + frac * blocks[idx].height;
  const scrollTop = Math.round(targetPoint - lineY);
  return Math.max(0, Math.min(Math.max(0, maxScroll), scrollTop));
}
