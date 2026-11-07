import { describe, expect, it } from 'vitest';
import { analyze, type Frame } from '../qa/continuity';

// Synthetic frames for the continuity detectors (TESTSPEC round 2, D12–D17).
const H = 844;
function frames(tops: number[], extra: Partial<Frame> = {}): Frame[] {
  return tops.map((top, i) => ({
    t: i * 16.7,
    w: 390,
    h: H,
    active: 'b',
    tops: { a: top - H, b: top },
    coverLeft: 0,
    coverage: 1,
    ...extra,
  }));
}
const kinds = (v: ReturnType<typeof analyze>) => v.map((x) => x.kind);

describe('continuity detectors', () => {
  it('passes a smooth settle with one overshoot', () => {
    const rec = { frames: frames([400, 250, 120, 40, 5, -6, -2, 0, 0]), shift: 0 };
    expect(analyze(rec, { jumps: true, touches: [[-50, -10]], expectSlug: 'b' })).toEqual([]);
  });

  it('flags a teleport but not the same step while a finger is down', () => {
    const tops = [300, 290, 280, 140, 130, 120];
    expect(kinds(analyze({ frames: frames(tops), shift: 0 }, { jumps: true }))).toEqual(['jump']);
    const touching: Array<[number, number]> = [[0, 60]];
    expect(analyze({ frames: frames(tops), shift: 0 }, { jumps: true, touches: touching })).toEqual([]);
  });

  it('allows the spring to pick up the finger speed after a release, but not a teleport after that', () => {
    // Release at t=0; frames every 67 ms (4× CPU): a short first step, then the spring's real speed.
    const slow = (tops: number[]) => frames(tops).map((f, i) => ({ ...f, t: i * 67 }));
    const touches: Array<[number, number]> = [[-200, 0]];
    expect(analyze({ frames: slow([305, 300, 230, 223, 221, 220]), shift: 0 }, { jumps: true, touches })).toEqual([]);
    const late = analyze({ frames: slow([305, 300, 296, 293, 200, 199, 199]), shift: 0 }, { jumps: true, touches });
    expect(kinds(late)).toEqual(['jump']);
  });

  it('does not call a fast but smooth slide a jump', () => {
    const rec = { frames: frames([800, 700, 590, 470, 350, 240, 140, 60, 10, 0]), shift: 0 };
    expect(analyze(rec, { jumps: true })).toEqual([]);
  });

  it('flags a settle that wobbles', () => {
    const rec = { frames: frames([100, 50, -10, 20, -15, 10, 0]), shift: 0 };
    expect(kinds(analyze(rec, { touches: [[-50, -10]] }))).toEqual(['reversal']);
  });

  it('flags uncovered frames, the wrong final article and a change of article in a steady scenario', () => {
    const rec = { frames: frames([0, 0, 0]), shift: 0 };
    rec.frames[1] = { ...rec.frames[1], coverage: 0.9, active: 'a' };
    expect(kinds(analyze(rec, { steady: true, expectSlug: 'c' })).sort()).toEqual(['gap', 'wrong-article', 'wrong-article']);
  });

  it('counts layout shift in gestures but not across a rotation', () => {
    const rec = { frames: frames([0, 0, 0]), shift: 0.2 };
    expect(kinds(analyze(rec, {}))).toEqual(['layout-shift']);
    expect(analyze(rec, { resizeAt: [10] })).toEqual([]);
  });
});
