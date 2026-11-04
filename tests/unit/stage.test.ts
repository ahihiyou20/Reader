import { describe, expect, it } from 'vitest';
import { isCompact, isLandscape, stageOf, stageScript, STAGES } from '@/lib/stage';

describe('stageOf (TESTSPEC §3, ACCEPTANCE 1)', () => {
  it.each([
    [390, 844, 'compact-portrait'],
    [599, 1000, 'compact-portrait'],
    [600, 1000, 'regular-portrait'],
    [820, 1180, 'regular-portrait'],
    [844, 390, 'compact-landscape'],
    [1000, 559, 'compact-landscape'],
    [1000, 560, 'regular-landscape'],
    [1440, 900, 'regular-landscape'],
    [700, 700, 'regular-landscape'],
    [500, 500, 'compact-landscape'],
    [0, 0, 'compact-portrait'],
    [NaN, 800, 'compact-portrait'],
    [-1, 5, 'compact-portrait'],
  ] as const)('stageOf(%d, %d) → %s', (w, h, expected) => {
    expect(stageOf(w, h)).toBe(expected);
  });
});

describe('stageScript (TESTSPEC §3, ACCEPTANCE 1)', () => {
  it('agrees with stageOf on every (w, h) where w, h in {1, 37, 74, ... up to 2600}', () => {
    const dimensions: number[] = [1];
    for (let d = 37; d <= 2600; d += 37) {
      dimensions.push(d);
    }
    if (dimensions[dimensions.length - 1] !== 2600) {
      dimensions.push(2600);
    }

    const runScript = new Function(
      'innerWidth',
      'innerHeight',
      'document',
      stageScript,
    ) as (w: number, h: number, doc: { documentElement: { setAttribute: (name: string, val: string) => void } }) => void;

    let attributeValue = '';
    const fakeDoc = {
      documentElement: {
        setAttribute: (_name: string, val: string) => {
          attributeValue = val;
        },
      },
    };

    for (const w of dimensions) {
      for (const h of dimensions) {
        attributeValue = '';
        runScript(w, h, fakeDoc);
        expect(attributeValue).toBe(stageOf(w, h));
      }
    }
  });
});

describe('stage predicates and STAGES (TESTSPEC §3, ACCEPTANCE 1)', () => {
  it('contains all four stages in STAGES', () => {
    expect(STAGES).toEqual([
      'compact-portrait',
      'regular-portrait',
      'compact-landscape',
      'regular-landscape',
    ]);
  });

  it('isLandscape and isCompact assertions for all four stages', () => {
    expect(isLandscape('compact-portrait')).toBe(false);
    expect(isCompact('compact-portrait')).toBe(true);

    expect(isLandscape('regular-portrait')).toBe(false);
    expect(isCompact('regular-portrait')).toBe(false);

    expect(isLandscape('compact-landscape')).toBe(true);
    expect(isCompact('compact-landscape')).toBe(true);

    expect(isLandscape('regular-landscape')).toBe(true);
    expect(isCompact('regular-landscape')).toBe(false);
  });
});
