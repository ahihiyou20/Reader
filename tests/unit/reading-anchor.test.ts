import { describe, expect, it } from 'vitest';
import { captureAnchor, restoreScrollTop, type BlockBox } from '@/lib/reading-anchor';

describe('captureAnchor (TESTSPEC §4, ARCHITECTURE §2)', () => {
  const blocks: BlockBox[] = [
    { top: 0, height: 100 },
    { top: 120, height: 200 },
    { top: 340, height: 60 },
  ];

  it('captures anchor within first block at scrollTop=0, lineY=50', () => {
    expect(captureAnchor(blocks, 0, 50)).toEqual({ index: 0, fraction: 0.5 });
  });

  it('captures anchor within block 1 at line 200 (scrollTop=100, lineY=100)', () => {
    expect(captureAnchor(blocks, 100, 100)).toEqual({ index: 1, fraction: 0.4 });
  });

  it('uses the block above with fraction 1 when line falls in a gap (line 110)', () => {
    expect(captureAnchor(blocks, 0, 110)).toEqual({ index: 0, fraction: 1 });
  });

  it('uses first block with fraction 0 when line is above first block (line -10)', () => {
    expect(captureAnchor(blocks, 0, -10)).toEqual({ index: 0, fraction: 0 });
  });

  it('uses last block with fraction 1 when line is below last block (line 1000)', () => {
    expect(captureAnchor(blocks, 0, 1000)).toEqual({ index: 2, fraction: 1 });
  });

  it('returns { index: 0, fraction: 0 } when blocks array is empty', () => {
    expect(captureAnchor([], 0, 0)).toEqual({ index: 0, fraction: 0 });
  });
});

describe('restoreScrollTop (TESTSPEC §4, ARCHITECTURE §2)', () => {
  const blocks: BlockBox[] = [
    { top: 0, height: 100 },
    { top: 120, height: 200 },
    { top: 340, height: 60 },
  ];

  it('restores scrollTop correctly for anchor { index: 1, fraction: 0.4 }', () => {
    // 120 + 0.4 * 200 - 100 = 200 - 100 = 100
    expect(restoreScrollTop({ index: 1, fraction: 0.4 }, blocks, 100, 1000)).toBe(100);
  });

  it('clamps result to maxScroll', () => {
    // 200 - 100 = 100, clamped to maxScroll = 50
    expect(restoreScrollTop({ index: 1, fraction: 0.4 }, blocks, 100, 50)).toBe(50);
  });

  it('clamps negative result to 0', () => {
    // 200 - 500 = -300, clamped to 0
    expect(restoreScrollTop({ index: 1, fraction: 0.4 }, blocks, 500, 1000)).toBe(0);
  });

  it('rounds fractional line point to an integer', () => {
    // 0 + 0.333 * 100 - 0 = 33.3 -> 33
    const result1 = restoreScrollTop({ index: 0, fraction: 0.333 }, blocks, 0, 1000);
    expect(result1).toBe(33);
    expect(Number.isInteger(result1)).toBe(true);

    // 0 + 0.337 * 100 - 0 = 33.7 -> 34
    const result2 = restoreScrollTop({ index: 0, fraction: 0.337 }, blocks, 0, 1000);
    expect(result2).toBe(34);
    expect(Number.isInteger(result2)).toBe(true);
  });

  it('uses the last block when anchor index is past the end', () => {
    // Last block is blocks[2] (top: 340, height: 60)
    // 340 + 0.5 * 60 - 0 = 370
    expect(restoreScrollTop({ index: 99, fraction: 0.5 }, blocks, 0, 1000)).toBe(370);
  });

  it('returns 0 when blocks array is empty', () => {
    expect(restoreScrollTop({ index: 0, fraction: 0 }, [], 100, 1000)).toBe(0);
  });

  it('preserves reading line position through a round trip under reflow scaling', () => {
    const originalScrollTop = 50;
    const originalLineY = 80;
    const anchor = captureAnchor(blocks, originalScrollTop, originalLineY);

    const scale = 1.37;
    const scaledBlocks: BlockBox[] = blocks.map((b) => ({
      top: b.top * scale,
      height: b.height * scale,
    }));
    const scaledLineY = originalLineY * scale;

    const restoredScrollTop = restoreScrollTop(anchor, scaledBlocks, scaledLineY, 5000);
    const restoredLinePoint = restoredScrollTop + scaledLineY;
    const scaledOriginalPoint = (originalScrollTop + originalLineY) * scale;

    expect(Math.abs(restoredLinePoint - scaledOriginalPoint)).toBeLessThanOrEqual(1);
  });
});
