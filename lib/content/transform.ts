// ArticleSource (markup, CMS file) → ArticleClient (parsed, what the app reads).
import { parseRich } from './markup';
import type { ArticleClient, ArticleSource, Counts, FeedItem, Lang, Localized } from './types';
import { LANGS, TLANGS, ZERO_COUNTS } from './types';
import { fullLangs, totalWords } from './validate';

const LICENSE_NAME: Record<string, string> = {
  'CC-BY-4.0': 'CC BY 4.0',
  'CC-BY-3.0': 'CC BY 3.0',
  'CC-BY-SA-4.0': 'CC BY-SA 4.0',
  'CC-BY-ND-4.0': 'CC BY-ND 4.0',
  'CC-BY-NC-4.0': 'CC BY-NC 4.0',
  'CC-BY-NC-SA-4.0': 'CC BY-NC-SA 4.0',
  'CC-BY-NC-ND-4.0': 'CC BY-NC-ND 4.0',
  PD: 'Public domain',
  'Reader-CC-BY-4.0': 'CC BY 4.0',
  Copyright: 'All rights reserved',
};
export const licenseName = (l: string) => LICENSE_NAME[l] ?? l;

type Tpl = {
  and: string;
  etAl: string;
  original: string;
  publisher: string;
  changes: Record<string, string>;
  written: (by: string, lic: string) => string;
  by: string;
  summary: (src: string) => string;
  verbatim: (pub: string, lic: string, title: string, by: string) => string;
  adapted: (title: string, by: string, pub: string, lic: string, changes: string) => string;
  shareAlike: (lic: string) => string;
};

const BRAND = 'Pagemoor';
const CHANGE_KEYS = ['shortened', 'divided into sections', 'highlights added', 'headings added', 'lightly edited', 'key point and apply steps added', 'translated to Vietnamese', 'combined with other sources'];
const changes = (...t: string[]) => Object.fromEntries(CHANGE_KEYS.map((k, i) => [k, t[i]]));

const TPL: Record<Lang, Tpl> = {
  en: {
    and: ' and ',
    etAl: 'et al.',
    original: 'the original',
    publisher: 'the original publisher',
    changes: {},
    written: (by, lic) => `Written by ${by} for ${BRAND}. Licensed ${lic}.`,
    by: 'by',
    summary: (src) => `${BRAND}'s own summary of ${src}. The original is not reproduced here: read it in full at the source.`,
    verbatim: (pub, lic, title, by) => `Republished from ${pub} under ${lic}. ${title} by ${by}.`,
    adapted: (title, by, pub, lic, ch) => `Adapted from ${title} by ${by}${pub}, ${lic}.${ch ? ` Changes: ${ch}.` : ''}`,
    shareAlike: (lic) => ` This ${BRAND} article is also available under ${lic}.`,
  },
  vi: {
    and: ' và ',
    etAl: 'và cộng sự',
    original: 'bài gốc',
    publisher: 'nhà xuất bản gốc',
    changes: changes('rút gọn', 'chia thành các phần', 'thêm đánh dấu', 'thêm tiêu đề phụ', 'biên tập nhẹ', 'thêm KEY POINT và các bước Apply', 'dịch sang tiếng Việt', 'kết hợp với nguồn khác'),
    written: (by, lic) => `Bài do ${by} viết cho ${BRAND}. Giấy phép ${lic}.`,
    by: 'của',
    summary: (src) => `Bản tóm tắt của ${BRAND} về ${src}. Bài gốc không được đăng lại ở đây: hãy đọc đầy đủ tại nguồn.`,
    verbatim: (pub, lic, title, by) => `Đăng lại nguyên văn từ ${pub} theo giấy phép ${lic}. ${title} của ${by}.`,
    adapted: (title, by, pub, lic, ch) => `Phỏng theo ${title} của ${by}${pub}, giấy phép ${lic}.${ch ? ` Thay đổi: ${ch}.` : ''}`,
    shareAlike: (lic) => ` Bài ${BRAND} này cũng được cấp phép ${lic}.`,
  },
  fr: {
    and: ' et ',
    etAl: 'et al.',
    original: 'l’original',
    publisher: 'l’éditeur d’origine',
    changes: changes('raccourci', 'divisé en sections', 'surlignages ajoutés', 'intertitres ajoutés', 'légèrement révisé', 'point clé et étapes pratiques ajoutés', 'traduit', 'combiné avec d’autres sources'),
    written: (by, lic) => `Écrit par ${by} pour ${BRAND}. Licence ${lic}.`,
    by: 'par',
    summary: (src) => `Résumé rédigé par ${BRAND} de ${src}. L’original n’est pas reproduit ici : lisez-le en entier à la source.`,
    verbatim: (pub, lic, title, by) => `Republié depuis ${pub} sous licence ${lic}. ${title} par ${by}.`,
    adapted: (title, by, pub, lic, ch) => `Adapté de ${title} par ${by}${pub}, ${lic}.${ch ? ` Modifications : ${ch}.` : ''}`,
    shareAlike: (lic) => ` Cet article ${BRAND} est également disponible sous ${lic}.`,
  },
  de: {
    and: ' und ',
    etAl: 'et al.',
    original: 'dem Original',
    publisher: 'dem ursprünglichen Herausgeber',
    changes: changes('gekürzt', 'in Abschnitte gegliedert', 'Hervorhebungen ergänzt', 'Zwischenüberschriften ergänzt', 'leicht bearbeitet', 'Kernaussage und Praxisschritte ergänzt', 'übersetzt', 'mit anderen Quellen kombiniert'),
    written: (by, lic) => `Geschrieben von ${by} für ${BRAND}. Lizenz ${lic}.`,
    by: 'von',
    summary: (src) => `Eigene Zusammenfassung von ${BRAND} zu ${src}. Das Original wird hier nicht wiedergegeben: Lesen Sie es vollständig an der Quelle.`,
    verbatim: (pub, lic, title, by) => `Übernommen von ${pub} unter ${lic}. ${title} von ${by}.`,
    adapted: (title, by, pub, lic, ch) => `Bearbeitet nach ${title} von ${by}${pub}, ${lic}.${ch ? ` Änderungen: ${ch}.` : ''}`,
    shareAlike: (lic) => ` Dieser ${BRAND}-Artikel ist ebenfalls unter ${lic} verfügbar.`,
  },
  es: {
    and: ' y ',
    etAl: 'et al.',
    original: 'el original',
    publisher: 'el editor original',
    changes: changes('abreviado', 'dividido en secciones', 'resaltados añadidos', 'subtítulos añadidos', 'ligeramente editado', 'idea clave y pasos prácticos añadidos', 'traducido', 'combinado con otras fuentes'),
    written: (by, lic) => `Escrito por ${by} para ${BRAND}. Licencia ${lic}.`,
    by: 'de',
    summary: (src) => `Resumen propio de ${BRAND} de ${src}. El original no se reproduce aquí: léalo completo en la fuente.`,
    verbatim: (pub, lic, title, by) => `Republicado de ${pub} bajo ${lic}. ${title} de ${by}.`,
    adapted: (title, by, pub, lic, ch) => `Adaptado de ${title} de ${by}${pub}, ${lic}.${ch ? ` Cambios: ${ch}.` : ''}`,
    shareAlike: (lic) => ` Este artículo de ${BRAND} también está disponible bajo ${lic}.`,
  },
};

function attributionIn(a: ArticleSource, lang: Lang): string {
  const o = a.origin;
  const t = TPL[lang];
  const lic = licenseName(o.license);
  const by = o.authors.length <= 2 ? o.authors.join(t.and) : `${o.authors[0]} ${t.etAl}`;
  const pub = o.publisher ? ` (${o.publisher})` : '';
  const title = o.originalTitle ? `“${o.originalTitle}”` : t.original;
  if (o.group === 4) return t.written(by, lic);
  if (o.group === 5) return t.summary(`${title} ${t.by} ${by}${pub}`);
  if (o.group === 3) return t.verbatim(o.publisher ?? t.publisher, lic, title, by);
  const ch = o.changes.filter(Boolean).map((c) => t.changes[c] ?? c).join(', ');
  return t.adapted(title, by, pub, lic, ch) + (o.group === 2 ? t.shareAlike(lic) : '');
}

export function buildAttribution(a: ArticleSource): Localized<string> {
  return Object.fromEntries(LANGS.map((l) => [l, attributionIn(a, l)])) as Localized<string>;
}

/** Keep `en` and every translation that has text. */
function localize<T, U>(get: (l: Lang) => T | undefined, map: (v: T) => U, filled: (v: T) => boolean): Localized<U> | undefined {
  const en = get('en');
  if (en === undefined || !filled(en)) return undefined;
  const out: Localized<U> = { en: map(en) };
  for (const l of TLANGS) {
    const v = get(l);
    if (v !== undefined && filled(v)) out[l] = map(v);
  }
  return out;
}

const hasText = (s: string) => s.trim().length > 0;

export function toClient(a: ArticleSource, counts: Counts = ZERO_COUNTS, extra: { dominant?: string; blurDataURL?: string } = {}): ArticleClient {
  const refs = new Map(a.references.map((r) => [r.id, r.label]));
  const words = totalWords(a);
  const toRich = (v: string) => parseRich(v, { refs }).rich;
  const rich = (get: (l: Lang) => string | undefined) => localize(get, toRich, hasText);
  return {
    slug: a.slug,
    category: a.category,
    publishedAt: a.publishAt ?? new Date().toISOString(),
    title: localize((l) => a.title[l], (v) => v, hasText)!,
    hook: rich((l) => a.hook[l])!,
    sections: a.sections.map((s) => ({
      heading: localize((l) => s[`heading_${l}`], (v) => v, hasText),
      body: rich((l) => s[`body_${l}`])!,
    })),
    keyPoint: rich((l) => a.keyPoint?.[l]),
    applySteps: localize((l) => a.applySteps?.[l], (v) => v, (v) => v.length > 0),
    // Group 3 summaries may exist in translation only (the English reader has the full text).
    summary: a.origin.group === 3 && LANGS.some((l) => a.summary?.[l]?.trim()) ? { ...rich((l) => a.summary?.[l] ?? (l === 'en' ? ' ' : undefined)), en: toRich(a.summary?.en ?? '') } : undefined,
    references: a.references,
    cover: {
      type: a.cover.type,
      url: a.cover.url,
      poster: a.cover.poster,
      blurDataURL: extra.blurDataURL ?? a.blurDataURL,
      dominant: extra.dominant ?? a.dominant ?? '#1a1a22',
      author: a.cover.author,
      authorUrl: a.cover.authorUrl,
      license: a.cover.license,
      provider: a.cover.provider,
      sourceUrl: a.cover.sourceUrl,
    },
    origin: a.origin,
    attribution: buildAttribution(a),
    counts,
    readingMinutes: Math.max(1, Math.round(words / 230)),
    wordCount: words,
    langs: fullLangs(a),
    ...(a.glossary ? { glossary: a.glossary } : {}),
  };
}

export function toFeedItem(c: ArticleClient): FeedItem {
  return {
    slug: c.slug,
    category: c.category,
    publishedAt: c.publishedAt,
    title: c.title,
    cover: c.cover,
    counts: c.counts,
    readingMinutes: c.readingMinutes,
    sections: c.sections.length + 1,
    langs: c.langs,
  };
}
