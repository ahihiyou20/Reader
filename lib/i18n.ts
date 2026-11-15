import en from '@/messages/en.json';
import vi from '@/messages/vi.json';
import fr from '@/messages/fr.json';
import de from '@/messages/de.json';
import es from '@/messages/es.json';
import { LANGS, type Lang, type Localized } from '@/lib/content/types';

type Keys = keyof typeof en;
type PluralBase<K> = K extends `${infer B}_one` ? B : never;
export type MessageKey = Keys | PluralBase<Keys>;
const CATALOG: Record<Lang, Record<string, string>> = { en, vi, fr, de, es };

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const cat = CATALOG[lang];
  let k: string = key;
  if (vars && typeof vars.n === 'number') {
    const plural = vars.n === 1 ? `${key}_one` : `${key}_other`;
    if (plural in cat) k = plural;
  }
  let s = cat[k] ?? CATALOG.en[k] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  return s;
}

/** Pick the requested language, falling back to English. */
export function pick<T>(l: Localized<T> | undefined, lang: Lang): T | undefined {
  if (!l) return undefined;
  return (lang === 'en' ? undefined : l[lang]) ?? l.en;
}

export function isFallback(l: Localized<unknown> | undefined, lang: Lang): boolean {
  return lang !== 'en' && !!l && l[lang] === undefined;
}

const isLang = (s: string | null | undefined): s is Lang => LANGS.includes(s as Lang);

export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem('reader.lang');
    if (isLang(saved)) return saved;
  } catch {}
  const m = document.cookie.match(/(?:^|; )NEXT_LOCALE=([a-z]{2})/);
  if (isLang(m?.[1])) return m[1];
  for (const l of navigator.languages ?? []) {
    const code = l.slice(0, 2).toLowerCase();
    if (isLang(code)) return code;
  }
  return 'en';
}

export function rememberLang(lang: Lang) {
  try {
    localStorage.setItem('reader.lang', lang);
  } catch {}
  document.cookie = `NEXT_LOCALE=${lang}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = lang;
}
