'use client';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ArticleClient, Lang } from '@/lib/content/types';
import { LANGS } from '@/lib/content/types';
import { glossaryAt, lookup, wordAt, type Meaning } from '@/lib/dictionary';
import { useT } from '../hooks';

interface Pop {
  x: number;
  y: number;
  term: string;
  /** undefined while Wiktionary is being asked, null when nothing was found. */
  result: Meaning | null | undefined;
}

/** Text node and offset under a point, in the two forms browsers offer. */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/**
 * Tap to understand: a tap on a word in the article opens its meaning. Returns the click handler for
 * the reading column and the popover to render.
 */
export function useTapToDefine(article: ArticleClient, lang: Lang) {
  const [pop, setPop] = useState<Pop | null>(null);

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as Element;
      // Taps on controls and reference chips keep their own meaning; a text selection is not a tap.
      if (target.closest('button, a, .cite, .wordpop') || !target.closest('p, h3, li') || !window.getSelection()?.isCollapsed) return setPop(null);
      const caret = caretAt(e.clientX, e.clientY);
      const block = target.closest('p, h3, li');
      if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !block?.contains(caret.node)) return setPop(null);
      const before = document.createRange();
      before.setStart(block, 0);
      before.setEnd(caret.node, caret.offset);
      const text = block.textContent ?? '';
      const offset = before.toString().length;
      const hit = wordAt(text, offset);
      if (!hit || /^\d+$/.test(hit.word)) return setPop(null);
      // A block shown in English because its translation is missing is looked up in English.
      const attr = block.closest('[lang]')?.getAttribute('lang');
      const textLang = LANGS.find((l) => l === attr) ?? lang;
      const at = { x: e.clientX, y: e.clientY };
      const known = glossaryAt(article.glossary?.[textLang], text, offset);
      if (known) return setPop({ ...at, term: known.term, result: known });

      // Vietnamese words are mostly two syllables: try the pair with each neighbour before the syllable alone.
      const candidates = [hit.word];
      if (textLang === 'vi') {
        const next = wordAt(text, hit.end + 1);
        const prev = hit.start > 1 ? wordAt(text, hit.start - 2) : null;
        if (prev && text.slice(prev.end, hit.start) === ' ') candidates.unshift(`${prev.word} ${hit.word}`);
        if (next && text.slice(hit.end, next.start) === ' ') candidates.unshift(`${hit.word} ${next.word}`);
      }
      setPop({ ...at, term: hit.word, result: undefined });
      lookup(candidates, textLang).then((result) => setPop((p) => (p && p.x === at.x && p.y === at.y ? { ...p, term: result?.term ?? p.term, result } : p)));
    },
    [article, lang],
  );

  useEffect(() => {
    if (!pop) return;
    const close = () => setPop(null);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', key);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('touchmove', close, { passive: true });
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('wheel', close);
      window.removeEventListener('touchmove', close);
    };
  }, [pop]);

  return { onClick, pop: pop && <WordPop pop={pop} /> };
}

function WordPop({ pop }: { pop: Pop }) {
  const t = useT();
  const above = pop.y > 260;
  const style = {
    left: Math.max(12, Math.min(pop.x - 150, (typeof window === 'undefined' ? 400 : window.innerWidth) - 312)),
    ...(above ? { bottom: window.innerHeight - pop.y + 16 } : { top: pop.y + 22 }),
  };
  const r = pop.result;
  return (
    <div className="wordpop" role="dialog" aria-label={t('defineTitle', { word: pop.term })} style={style}>
      <b>{pop.term}</b>
      <p aria-live="polite">{r === undefined ? t('defineLoading') : r === null ? t('defineNone') : r.meaning}</p>
      {r && (
        <span className="wordpop-src">
          {r.source === 'glossary' ? (
            t('defineInContext')
          ) : (
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              Wiktionary
              <ExternalLink className="ic" aria-hidden="true" />
            </a>
          )}
        </span>
      )}
    </div>
  );
}
