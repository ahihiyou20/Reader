import { describe, expect, it } from 'vitest';
import { timing } from '@/stores/audio';

describe('audio reading time', () => {
  const paras = ['a'.repeat(150), 'b'.repeat(300), 'c'.repeat(150)];
  it('counts the paragraphs before and the place inside the current one', () => {
    expect(timing({ paras, i: 0, offset: 0 }, 1)).toEqual({ elapsed: 0, total: 40 });
    expect(timing({ paras, i: 1, offset: 150 }, 1)).toEqual({ elapsed: 20, total: 40 });
  });
  it('scales with the speed', () => {
    expect(timing({ paras, i: 1, offset: 150 }, 2)).toEqual({ elapsed: 10, total: 20 });
  });
});
