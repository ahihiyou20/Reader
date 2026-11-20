'use client';
import { useEffect, useState } from 'react';
import { chromeP } from '../feed/nav';
import { useT } from '../hooks';

const HINTS = [
  { key: '↑', code: 'ArrowUp', labelKey: 'keyHintUp' as const },
  { key: '↓', code: 'ArrowDown', labelKey: 'keyHintDown' as const },
  { key: '←', code: 'ArrowLeft', labelKey: 'keyHintPrev' as const },
  { key: '→', code: 'ArrowRight', labelKey: 'keyHintNext' as const },
  { key: 'L', code: 'l', labelKey: 'keyHintLike' as const },
  { key: 'S', code: 's', labelKey: 'keyHintSave' as const },
];
// A click does what the key does: the feed's keyboard handler is the one place these actions live.
const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));

/**
 * Keyboard shortcut chips, also clickable with the mouse.
 * Rendered in Cover view on fine-pointer desktop screens.
 */
export function KeyHints() {
  const t = useT();
  const [view, setView] = useState(() => Math.round(chromeP.get()));

  useEffect(() => {
    const sync = (p: number) => {
      const v = Math.round(p);
      setView((prev) => (prev !== v ? v : prev));
    };
    sync(chromeP.get());
    return chromeP.on('change', sync);
  }, []);

  if (view !== 0) return null;

  return (
    <div className="key-hints" data-region="key-hints">
      {HINTS.map((h) => (
        <button key={h.key} type="button" className="key-chip" onClick={() => press(h.code)}>
          <kbd className="key-cap" aria-hidden="true">{h.key}</kbd>
          <span className="key-text">{t(h.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
