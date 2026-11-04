'use client';
import { useEffect, useState } from 'react';
import { chromeP } from '../feed/nav';
import { useT } from '../hooks';

const HINTS = [
  { key: '↑', labelKey: 'keyHintUp' as const },
  { key: '↓', labelKey: 'keyHintDown' as const },
  { key: '←', labelKey: 'keyHintPrev' as const },
  { key: '→', labelKey: 'keyHintNext' as const },
  { key: 'L', labelKey: 'keyHintLike' as const },
  { key: 'S', labelKey: 'keyHintSave' as const },
];

/**
 * Visual chips indicating keyboard navigation shortcuts.
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
    <div className="key-hints" data-region="key-hints" aria-hidden="true">
      {HINTS.map((h) => (
        <div key={h.key} className="key-chip">
          <kbd className="key-cap">{h.key}</kbd>
          <span className="key-text">{t(h.labelKey)}</span>
        </div>
      ))}
    </div>
  );
}
