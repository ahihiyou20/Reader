import { describe, expect, it } from 'vitest';
import { splitTitle, titleStyle } from '@/lib/title';

describe('cover title', () => {
  it('stresses the last short phrase', () => {
    expect(splitTitle('Giải phẫu một hố đen')).toEqual({ lead: 'Giải phẫu', accent: 'một hố đen' });
    expect(splitTitle('Why we procrastinate')).toEqual({ lead: 'Why', accent: 'we procrastinate' });
    expect(splitTitle('Hố đen')).toEqual({ lead: '', accent: 'Hố đen' });
  });
  it('stresses a short subtitle after a colon', () => {
    expect(splitTitle('London 1952: the great smog')).toEqual({ lead: 'London 1952', accent: 'the great smog' });
  });
  it('never loses a word', () => {
    const t = 'A very long title about international organisations and their extraordinarily complicated responsibilities';
    const { lead, accent } = splitTitle(t);
    expect(`${lead} ${accent}`).toBe(t);
    expect(accent.split(' ').length).toBeLessThanOrEqual(3);
  });
  it('gives every category a style', () => {
    expect(titleStyle('science')).toBe('cosmos');
    expect(titleStyle('unknown')).toBe('mag');
  });
});
