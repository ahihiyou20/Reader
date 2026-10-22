'use client';
import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { setLanguage } from '@/lib/actions';
import type { Lang } from '@/lib/content/types';
import { useUI } from '@/stores/ui';
import { useT } from '../hooks';

const OPTIONS: Array<{ lang: Lang; flag: string; name: string }> = [
  { lang: 'vi', flag: '🇻🇳', name: 'Tiếng Việt' },
  { lang: 'en', flag: '🇺🇸', name: 'English' },
];

/** CMP-03: grows from the trigger, closes the same way, closes on outside tap or Escape. */
export function LangMenu() {
  const t = useT();
  const open = useUI((s) => s.langMenu);
  const lang = useUI((s) => s.lang);
  const setOpen = useUI((s) => s.setLangMenu);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, setOpen]);
  return (
    <>
      {open && <div className="click-shield" onPointerDown={() => setOpen(false)} />}
      <div className={`lmenu${open ? ' open' : ''}`} role="menu" aria-label={t('language')} aria-hidden={!open} inert={!open || undefined}>
        {OPTIONS.map((o, i) => (
          <button
            key={o.lang}
            ref={i === 0 ? first : undefined}
            type="button"
            role="menuitemradio"
            aria-checked={lang === o.lang}
            onClick={() => {
              setLanguage(o.lang);
              setOpen(false);
            }}
          >
            <span className="ck">
              <Check className="ic" strokeWidth={2.6} aria-hidden="true" />
            </span>
            <span aria-hidden="true">{o.flag}</span>
            {o.name}
          </button>
        ))}
      </div>
    </>
  );
}
