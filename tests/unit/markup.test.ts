import { describe, expect, it } from 'vitest';
import { citedIds, countWords, parseInline, parseRich, plainText } from '@/lib/content/markup';

describe('markup (docs/05 §6.3)', () => {
  it('parses every node type', () => {
    const { nodes, errors } = parseInline('A **bold** and *italic* with [y:(2011)] [p:95%] [g:the second type] {cnbc}.', {
      refs: { cnbc: 'CNBC (2025)' },
    });
    expect(errors).toEqual([]);
    expect(nodes).toEqual([
      { t: 'text', v: 'A ' },
      { t: 'bold', v: 'bold' },
      { t: 'text', v: ' and ' },
      { t: 'italic', v: 'italic' },
      { t: 'text', v: ' with ' },
      { t: 'hl', v: '(2011)', color: 'yellow' },
      { t: 'text', v: ' ' },
      { t: 'hl', v: '95%', color: 'pink' },
      { t: 'text', v: ' ' },
      { t: 'hl', v: 'the second type', color: 'green' },
      { t: 'text', v: ' ' },
      { t: 'cite', v: 'CNBC (2025)', refId: 'cnbc' },
      { t: 'text', v: '.' },
    ]);
  });
  it('supports bold or italic inside a highlight', () => {
    expect(parseInline('[p:**key**]').nodes).toEqual([{ t: 'hl', v: 'key', color: 'pink', bold: true }]);
    expect(parseInline('[y:*Title*]').nodes).toEqual([{ t: 'hl', v: 'Title', color: 'yellow', italic: true }]);
  });
  it('reports unbalanced markup and unknown references', () => {
    expect(parseInline('a **b').errors[0].message).toMatch(/Unclosed/);
    expect(parseInline('a [p:b').errors[0].message).toMatch(/Unclosed highlight/);
    expect(parseInline('{nope}', { refs: {} }).errors[0].message).toMatch(/Unknown reference/);
  });
  it('escapes and leaves ordinary brackets alone', () => {
    expect(parseInline('5 \\* 3 [note] {not an id}').nodes).toEqual([{ t: 'text', v: '5 * 3 [note] {not an id}' }]);
  });
  it('splits paragraphs on blank lines', () => {
    expect(parseRich('One\nline\n\nTwo').rich).toEqual([[{ t: 'text', v: 'One line' }], [{ t: 'text', v: 'Two' }]]);
  });
  it('plain text, word counts and cited ids', () => {
    expect(plainText('**Hi** [p:there] {x}', { x: 'X (2020)' })).toBe('Hi there X (2020)');
    expect(countWords('Đây là một câu tiếng Việt, 35,000 quyết định.')).toBe(9);
    expect(citedIds('a {one} b {two}')).toEqual(['one', 'two']);
  });
});
